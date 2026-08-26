-- APOIS Corridas: harden bidirectional ride rating.
-- Domain user IDs remain in ride_ratings; audit_logs.actor_id must always use auth.users.id.
-- Client access is only through public SECURITY DEFINER wrappers.

CREATE OR REPLACE FUNCTION apois_rpc_private.rate_passenger_ride(
  _ride_id uuid,
  _rating integer,
  _comment text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'apois_rpc_private'
AS $function$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_passenger_id uuid := public.mobility_user_id();
  v_ride public.rides%rowtype;
  v_driver_user_id uuid;
  v_existing public.ride_ratings%rowtype;
  v_inserted public.ride_ratings%rowtype;
  v_average numeric;
  v_count integer;
  v_comment text;
BEGIN
  IF v_auth_user_id IS NULL OR v_passenger_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'rating_out_of_range' USING errcode = '22023';
  END IF;

  v_comment := nullif(left(trim(coalesce(_comment, '')), 500), '');

  SELECT * INTO v_ride
  FROM public.rides
  WHERE id = _ride_id AND passenger_id = v_passenger_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ride_not_found'; END IF;
  IF v_ride.status <> 'finalizada' THEN RAISE EXCEPTION 'ride_not_completed'; END IF;
  IF v_ride.driver_id IS NULL THEN RAISE EXCEPTION 'ride_driver_missing'; END IF;

  SELECT d.user_id INTO v_driver_user_id
  FROM public.drivers d
  WHERE d.id = v_ride.driver_id;

  IF v_driver_user_id IS NULL THEN RAISE EXCEPTION 'ride_driver_missing'; END IF;
  IF v_driver_user_id = v_passenger_id THEN RAISE EXCEPTION 'ride_rating_participants_invalid'; END IF;

  INSERT INTO public.ride_ratings (ride_id, direction, rater_user_id, ratee_user_id, rating, comment)
  VALUES (_ride_id, 'passenger_to_driver', v_passenger_id, v_driver_user_id, _rating::smallint, v_comment)
  ON CONFLICT (ride_id, direction) DO NOTHING
  RETURNING * INTO v_inserted;

  IF v_inserted.id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.ride_ratings
    WHERE ride_id = _ride_id AND direction = 'passenger_to_driver';

    IF v_existing.id IS NULL
       OR v_existing.rater_user_id <> v_passenger_id
       OR v_existing.ratee_user_id <> v_driver_user_id
       OR v_existing.rating <> _rating
       OR v_existing.comment IS DISTINCT FROM v_comment THEN
      RAISE EXCEPTION 'ride_already_rated';
    END IF;
  ELSE
    UPDATE public.rides
    SET passenger_rating = v_inserted.rating,
        passenger_rating_comment = v_inserted.comment,
        passenger_rated_at = v_inserted.created_at,
        updated_at = now()
    WHERE id = _ride_id;

    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_auth_user_id,
      'ride.rating.passenger_to_driver',
      'ride',
      _ride_id::text,
      jsonb_build_object(
        'rater_domain_user_id', v_passenger_id,
        'rating', v_inserted.rating,
        'driver_id', v_ride.driver_id,
        'driver_domain_user_id', v_driver_user_id,
        'comment_saved', v_inserted.comment IS NOT NULL
      )
    );
  END IF;

  SELECT CASE WHEN count(*) > 0 THEN round(avg(rr.rating)::numeric, 2) ELSE NULL END,
         count(*)::integer
  INTO v_average, v_count
  FROM public.ride_ratings rr
  WHERE rr.direction = 'passenger_to_driver'
    AND rr.ratee_user_id = v_driver_user_id;

  UPDATE public.drivers
  SET rating = v_average,
      total_ratings = v_count,
      updated_at = now()
  WHERE id = v_ride.driver_id;

  UPDATE public.rides
  SET driver_rating = v_average
  WHERE driver_id = v_ride.driver_id
    AND driver_rating IS DISTINCT FROM v_average;

  RETURN jsonb_build_object(
    'ok', true,
    'ride_id', _ride_id,
    'rating', _rating,
    'comment_saved', v_comment IS NOT NULL,
    'driver_average_rating', v_average,
    'driver_ratings_count', v_count,
    'idempotent', v_inserted.id IS NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION apois_rpc_private.driver_rate_passenger(
  _ride_id uuid,
  _stars integer,
  _comment text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'apois_rpc_private'
AS $function$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_driver_id uuid;
  v_user_id uuid := public.mobility_user_id();
  v_ride public.rides%rowtype;
  v_existing public.ride_ratings%rowtype;
  v_inserted public.ride_ratings%rowtype;
  v_average numeric;
  v_count integer;
  v_comment text;
BEGIN
  IF v_auth_user_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;
  IF _stars IS NULL OR _stars < 1 OR _stars > 5 THEN
    RAISE EXCEPTION 'invalid_rating' USING errcode = '22023';
  END IF;

  SELECT d.id INTO v_driver_id
  FROM public.drivers d
  WHERE d.user_id = v_user_id;

  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'driver_profile_missing'; END IF;
  v_comment := nullif(left(trim(coalesce(_comment, '')), 500), '');

  SELECT * INTO v_ride
  FROM public.rides
  WHERE id = _ride_id AND driver_id = v_driver_id
  FOR UPDATE;

  IF NOT FOUND OR v_ride.status <> 'finalizada' THEN RAISE EXCEPTION 'rating_unavailable'; END IF;
  IF v_ride.passenger_id = v_user_id THEN RAISE EXCEPTION 'rating_unavailable'; END IF;

  INSERT INTO public.ride_ratings (ride_id, direction, rater_user_id, ratee_user_id, rating, comment)
  VALUES (_ride_id, 'driver_to_passenger', v_user_id, v_ride.passenger_id, _stars::smallint, v_comment)
  ON CONFLICT (ride_id, direction) DO NOTHING
  RETURNING * INTO v_inserted;

  IF v_inserted.id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.ride_ratings
    WHERE ride_id = _ride_id AND direction = 'driver_to_passenger';

    IF v_existing.id IS NULL
       OR v_existing.rater_user_id <> v_user_id
       OR v_existing.ratee_user_id <> v_ride.passenger_id
       OR v_existing.rating <> _stars
       OR v_existing.comment IS DISTINCT FROM v_comment THEN
      RAISE EXCEPTION 'rating_unavailable';
    END IF;
  ELSE
    UPDATE public.rides
    SET driver_to_passenger_rating = v_inserted.rating,
        driver_to_passenger_comment = v_inserted.comment,
        driver_rated_at = v_inserted.created_at,
        updated_at = now()
    WHERE id = _ride_id;

    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_auth_user_id,
      'ride.rating.driver_to_passenger',
      'ride',
      _ride_id::text,
      jsonb_build_object(
        'rater_domain_user_id', v_user_id,
        'driver_id', v_driver_id,
        'passenger_id', v_ride.passenger_id,
        'rating', v_inserted.rating,
        'comment_saved', v_inserted.comment IS NOT NULL
      )
    );
  END IF;

  SELECT CASE WHEN count(*) > 0 THEN round(avg(rr.rating)::numeric, 2) ELSE NULL END,
         count(*)::integer
  INTO v_average, v_count
  FROM public.ride_ratings rr
  WHERE rr.direction = 'driver_to_passenger'
    AND rr.ratee_user_id = v_ride.passenger_id;

  UPDATE public.users
  SET average_rating = v_average,
      total_ratings = v_count,
      updated_at = now()
  WHERE id = v_ride.passenger_id;

  RETURN jsonb_build_object(
    'ok', true,
    'ride_id', _ride_id,
    'rating', _stars,
    'comment_saved', v_comment IS NOT NULL,
    'passenger_average_rating', v_average,
    'passenger_ratings_count', v_count,
    'idempotent', v_inserted.id IS NULL
  );
END;
$function$;

ALTER FUNCTION public.rate_passenger_ride(uuid, integer, text) SECURITY DEFINER;
ALTER FUNCTION public.driver_rate_passenger(uuid, integer, text) SECURITY DEFINER;

REVOKE ALL ON FUNCTION apois_rpc_private.rate_passenger_ride(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION apois_rpc_private.driver_rate_passenger(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apois_rpc_private.rate_passenger_ride(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION apois_rpc_private.driver_rate_passenger(uuid, integer, text) TO service_role;

REVOKE ALL ON FUNCTION public.rate_passenger_ride(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_rate_passenger(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rate_passenger_ride(uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_rate_passenger(uuid, integer, text) TO authenticated, service_role;
