-- APOIS Corridas: canonical driver SOS creation.
-- Safe forward migration: never trusts client identity and never guesses an active ride.

CREATE OR REPLACE FUNCTION apois_rpc_private.create_driver_sos(
  _lat numeric DEFAULT NULL::numeric,
  _lng numeric DEFAULT NULL::numeric,
  _severity text DEFAULT 'critical'::text,
  _message text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'apois_rpc_private'
AS $function$
DECLARE
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_candidate_ride_ids uuid[];
  v_candidate_ride_count integer := 0;
  v_ride_id uuid;
  v_alert_id uuid;
  v_severity text;
  v_message text;
  v_created_at timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;

  v_profile_id := public.mobility_user_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;

  SELECT * INTO v_driver
  FROM public.drivers
  WHERE user_id = v_profile_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_profile_missing' USING errcode = '42501';
  END IF;

  v_severity := lower(trim(coalesce(_severity, 'critical')));
  IF v_severity NOT IN ('critical', 'high', 'medical', 'security') THEN
    RAISE EXCEPTION 'invalid_sos_severity';
  END IF;

  IF _lat IS NOT NULL AND (_lat < -90 OR _lat > 90) THEN
    RAISE EXCEPTION 'invalid_sos_location';
  END IF;
  IF _lng IS NOT NULL AND (_lng < -180 OR _lng > 180) THEN
    RAISE EXCEPTION 'invalid_sos_location';
  END IF;

  SELECT
    coalesce(array_agg(r.id ORDER BY
      CASE r.status
        WHEN 'em_viagem' THEN 1
        WHEN 'motorista_chegou' THEN 2
        ELSE 3
      END,
      r.accepted_at DESC NULLS LAST,
      r.created_at DESC
    ), ARRAY[]::uuid[]),
    count(*)::integer
  INTO v_candidate_ride_ids, v_candidate_ride_count
  FROM public.rides r
  WHERE r.driver_id = v_driver.id
    AND r.status IN ('motorista_a_caminho', 'motorista_chegou', 'em_viagem');

  IF v_candidate_ride_count > 1 THEN
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_profile_id,
      'sos.driver.rejected.multiple_active_rides',
      'driver',
      v_driver.id::text,
      jsonb_build_object(
        'driver_id', v_driver.id,
        'candidate_ride_ids', to_jsonb(v_candidate_ride_ids),
        'candidate_ride_count', v_candidate_ride_count,
        'severity', v_severity,
        'lat', _lat,
        'lng', _lng
      )
    );

    RETURN jsonb_build_object(
      'ok', false,
      'error', 'multiple_active_rides',
      'alert_id', NULL,
      'ride_id', NULL,
      'driver_id', v_driver.id,
      'severity', v_severity,
      'status', NULL,
      'created_at', v_created_at
    );
  END IF;

  IF v_candidate_ride_count = 1 THEN
    v_ride_id := v_candidate_ride_ids[1];
  ELSE
    v_ride_id := NULL;
  END IF;

  v_message := nullif(
    left(trim(coalesce(_message, 'SOS acionado pelo motorista no aplicativo APOIS.')), 500),
    ''
  );

  INSERT INTO public.sos_alerts(
    user_id,
    driver_id,
    ride_id,
    lat,
    lng,
    message,
    severity,
    status
  )
  VALUES (
    v_profile_id,
    v_driver.id,
    v_ride_id,
    _lat,
    _lng,
    v_message,
    v_severity,
    'open'
  )
  RETURNING id, created_at INTO v_alert_id, v_created_at;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_profile_id,
    'sos.driver.created',
    CASE WHEN v_ride_id IS NULL THEN 'driver' ELSE 'ride' END,
    coalesce(v_ride_id::text, v_driver.id::text),
    jsonb_build_object(
      'sos_alert_id', v_alert_id,
      'ride_id', v_ride_id,
      'driver_id', v_driver.id,
      'severity', v_severity,
      'status', 'open',
      'lat', _lat,
      'lng', _lng
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'alert_id', v_alert_id,
    'ride_id', v_ride_id,
    'driver_id', v_driver.id,
    'severity', v_severity,
    'status', 'open',
    'created_at', v_created_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION apois_rpc_private.create_driver_sos(numeric, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apois_rpc_private.create_driver_sos(numeric, numeric, text, text) TO service_role;
