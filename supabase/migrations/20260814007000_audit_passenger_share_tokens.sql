-- APOIS Corridas: sharing a live ride exposes operational location data.
-- Record token creation/refresh and revocation server-side in the same transaction.

CREATE OR REPLACE FUNCTION apois_rpc_private.create_passenger_share_token(_ride_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'apois_rpc_private'
AS $function$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_passenger_id uuid;
  v_ride public.rides%rowtype;
  v_ttl_minutes integer := 720;
  v_setting jsonb;
  v_created_new boolean := false;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;

  v_passenger_id := public.mobility_user_id();
  IF v_passenger_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;

  SELECT value INTO v_setting
  FROM public.app_settings
  WHERE key = 'ride.share_ttl_minutes'
  LIMIT 1;

  IF v_setting IS NOT NULL THEN
    BEGIN
      IF jsonb_typeof(v_setting) = 'number' THEN
        v_ttl_minutes := greatest(15, least(1440, (v_setting::text)::integer));
      ELSIF jsonb_typeof(v_setting) = 'string' AND (v_setting #>> '{}') ~ '^[0-9]+$' THEN
        v_ttl_minutes := greatest(15, least(1440, (v_setting #>> '{}')::integer));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_ttl_minutes := 720;
    END;
  END IF;

  SELECT * INTO v_ride
  FROM public.rides
  WHERE id = _ride_id
    AND passenger_id = v_passenger_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ride_not_found';
  END IF;

  IF v_ride.status NOT IN ('motorista_a_caminho', 'motorista_chegou', 'em_viagem') THEN
    RAISE EXCEPTION 'ride_not_shareable';
  END IF;

  IF v_ride.share_token IS NULL
     OR v_ride.share_revoked_at IS NOT NULL
     OR v_ride.share_expires_at IS NULL
     OR v_ride.share_expires_at <= now() THEN
    UPDATE public.rides
    SET share_token = gen_random_uuid(),
        share_expires_at = now() + make_interval(mins => v_ttl_minutes),
        share_revoked_at = NULL,
        updated_at = now()
    WHERE id = _ride_id
    RETURNING * INTO v_ride;
    v_created_new := true;
  END IF;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_auth_user_id,
    CASE WHEN v_created_new THEN 'ride.share.created' ELSE 'ride.share.reused' END,
    'ride',
    v_ride.id::text,
    jsonb_build_object(
      'mobility_user_id', v_passenger_id,
      'expires_at', v_ride.share_expires_at,
      'ttl_minutes', v_ttl_minutes,
      'token_rotated', v_created_new
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'ride_id', v_ride.id,
    'share_token', v_ride.share_token,
    'expires_at', v_ride.share_expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION apois_rpc_private.revoke_passenger_share_token(_ride_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'apois_rpc_private'
AS $function$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_passenger_id uuid;
  v_token uuid;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;

  v_passenger_id := public.mobility_user_id();
  IF v_passenger_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;

  UPDATE public.rides
  SET share_revoked_at = now(),
      updated_at = now()
  WHERE id = _ride_id
    AND passenger_id = v_passenger_id
  RETURNING share_token INTO v_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ride_not_found';
  END IF;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_auth_user_id,
    'ride.share.revoked',
    'ride',
    _ride_id::text,
    jsonb_build_object(
      'mobility_user_id', v_passenger_id,
      'had_share_token', v_token IS NOT NULL
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'ride_id', _ride_id,
    'revoked', true,
    'share_token', v_token
  );
END;
$function$;

REVOKE ALL ON FUNCTION apois_rpc_private.create_passenger_share_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION apois_rpc_private.revoke_passenger_share_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apois_rpc_private.create_passenger_share_token(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION apois_rpc_private.revoke_passenger_share_token(uuid) TO authenticated, service_role;
