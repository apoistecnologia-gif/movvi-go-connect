-- APOIS Corridas: harden Driver cancellation authorization/audit boundary.
-- Domain user IDs stay in mobility relations; audit actor_id is auth.users.id.

CREATE OR REPLACE FUNCTION apois_rpc_private.driver_cancel_ride(
  _ride_id uuid,
  _reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'apois_rpc_private'
AS $function$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_ride public.rides%rowtype;
  v_reason text;
  v_reason_norm text;
  v_is_no_show boolean := false;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;

  v_profile_id := public.mobility_user_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;

  SELECT * INTO v_driver
  FROM public.drivers
  WHERE user_id = v_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_profile_missing';
  END IF;

  v_reason := left(trim(coalesce(_reason, '')), 500);
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'driver_cancel_reason_required';
  END IF;

  v_reason_norm := lower(v_reason);
  v_is_no_show := v_reason_norm like '%não apareceu%'
    OR v_reason_norm like '%nao apareceu%'
    OR v_reason_norm like '%não compareceu%'
    OR v_reason_norm like '%nao compareceu%';

  SELECT * INTO v_ride
  FROM public.rides
  WHERE id = _ride_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_ride.driver_id <> v_driver.id
     OR v_ride.status NOT IN ('motorista_a_caminho', 'motorista_chegou') THEN
    RAISE EXCEPTION 'invalid_ride_transition';
  END IF;

  IF v_is_no_show THEN
    IF v_ride.status <> 'motorista_chegou' THEN
      RAISE EXCEPTION 'no_show_requires_driver_arrival' USING errcode = '55000';
    END IF;

    UPDATE public.rides
    SET status = 'cancelada_motorista',
        cancellation_reason = v_reason,
        cancelled_by = 'driver',
        cancelled_at = now(),
        updated_at = now()
    WHERE id = _ride_id
    RETURNING * INTO v_ride;

    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_auth_user_id,
      'ride.driver_no_show_cancelled',
      'ride',
      _ride_id::text,
      jsonb_build_object(
        'driver_id', v_driver.id,
        'driver_domain_user_id', v_profile_id,
        'payment_method', v_ride.payment_method,
        'payment_status', v_ride.payment_status,
        'reason', v_reason
      )
    );

    RETURN to_jsonb(v_ride);
  END IF;

  UPDATE public.rides
  SET status = 'procurar_motorista',
      driver_id = null,
      accepted_driver_id = null,
      accepted_at = null,
      driver_arrived_at = null,
      current_offer_driver_id = null,
      driver_name = null,
      driver_photo = null,
      driver_phone = null,
      driver_vehicle_model = null,
      driver_vehicle_color = null,
      driver_vehicle_plate = null,
      driver_rating = null,
      driver_latitude = null,
      driver_longitude = null,
      driver_heading = null,
      security_code = null,
      candidate_driver_ids = array_remove(coalesce(candidate_driver_ids, '{}'::uuid[]), v_profile_id),
      offered_driver_ids = array_remove(coalesce(offered_driver_ids, '{}'::uuid[]), v_profile_id),
      rejected_driver_ids = CASE
        WHEN v_profile_id = ANY(coalesce(rejected_driver_ids, '{}'::uuid[]))
          THEN coalesce(rejected_driver_ids, '{}'::uuid[])
        ELSE array_append(coalesce(rejected_driver_ids, '{}'::uuid[]), v_profile_id)
      END,
      request_expires_at = now(),
      search_expires_at = CASE
        WHEN search_expires_at IS NULL OR search_expires_at <= now() THEN now() + interval '8 minutes'
        ELSE search_expires_at
      END,
      cancellation_reason = v_reason,
      cancelled_by = 'driver',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = _ride_id
  RETURNING * INTO v_ride;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_auth_user_id,
    'ride.driver_cancelled_for_redispatch',
    'ride',
    _ride_id::text,
    jsonb_build_object(
      'driver_id', v_driver.id,
      'driver_domain_user_id', v_profile_id,
      'reason', v_reason,
      'new_status', v_ride.status
    )
  );

  RETURN to_jsonb(v_ride);
END;
$function$;

ALTER FUNCTION public.driver_cancel_ride(uuid, text) SECURITY DEFINER;

REVOKE ALL ON FUNCTION apois_rpc_private.driver_cancel_ride(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apois_rpc_private.driver_cancel_ride(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.driver_cancel_ride(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_cancel_ride(uuid, text) TO authenticated, service_role;
