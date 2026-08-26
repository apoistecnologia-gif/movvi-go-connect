-- Preserve the canonical passenger SOS contract while fixing audit identity.
-- audit_logs.actor_id references auth.users(id); sos_alerts.user_id uses public.users.id.

CREATE OR REPLACE FUNCTION apois_rpc_private.create_passenger_sos(
  _ride_id uuid,
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
  v_auth_user_id uuid := auth.uid();
  v_passenger_id uuid;
  v_ride public.rides%rowtype;
  v_alert_id uuid;
  v_severity text;
  v_message text;
  v_created_at timestamptz := now();
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;

  v_passenger_id := public.mobility_user_id();
  IF v_passenger_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
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

  SELECT * INTO v_ride
  FROM public.rides
  WHERE id = _ride_id
    AND passenger_id = v_passenger_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ride_not_found';
  END IF;
  IF v_ride.status NOT IN ('motorista_a_caminho', 'motorista_chegou', 'em_viagem') THEN
    RAISE EXCEPTION 'ride_not_active';
  END IF;

  v_message := nullif(
    left(trim(coalesce(_message, 'SOS acionado pelo passageiro durante corrida ativa.')), 500),
    ''
  );

  INSERT INTO public.sos_alerts(user_id, driver_id, ride_id, lat, lng, message, severity, status)
  VALUES (v_passenger_id, v_ride.driver_id, v_ride.id, _lat, _lng, v_message, v_severity, 'open')
  RETURNING id, created_at INTO v_alert_id, v_created_at;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_auth_user_id,
    'sos.passenger.created',
    'ride',
    v_ride.id::text,
    jsonb_build_object(
      'sos_alert_id', v_alert_id,
      'mobility_user_id', v_passenger_id,
      'severity', v_severity,
      'status', 'open',
      'lat', _lat,
      'lng', _lng,
      'driver_id', v_ride.driver_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'alert_id', v_alert_id,
    'ride_id', v_ride.id,
    'severity', v_severity,
    'status', 'open',
    'created_at', v_created_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION apois_rpc_private.create_passenger_sos(uuid, numeric, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apois_rpc_private.create_passenger_sos(uuid, numeric, numeric, text, text) TO authenticated, service_role;
