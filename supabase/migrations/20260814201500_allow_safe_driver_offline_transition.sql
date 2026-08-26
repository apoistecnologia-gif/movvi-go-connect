-- APOIS Corridas: going offline is a privilege-reducing operation and must remain
-- available even when approval/subscription became invalid after the driver was
-- already online. Going online still requires full operational eligibility.

CREATE OR REPLACE FUNCTION apois_rpc_private.driver_set_presence(
  _online boolean,
  _lat numeric DEFAULT NULL::numeric,
  _lng numeric DEFAULT NULL::numeric,
  _heading numeric DEFAULT NULL::numeric,
  _speed numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_driver public.drivers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  v_profile_id := public.mobility_user_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_missing';
  END IF;

  SELECT * INTO v_driver
  FROM public.drivers
  WHERE user_id = v_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_profile_missing';
  END IF;

  -- Never block an explicit offline transition. Eligibility is required only
  -- when the driver asks to become operational/online.
  IF coalesce(_online, false) THEN
    IF v_driver.approval_status <> 'aprovado' THEN
      RAISE EXCEPTION 'driver_not_approved';
    END IF;

    IF lower(coalesce(v_driver.subscription_status, '')) NOT IN ('active', 'ativa') THEN
      RAISE EXCEPTION 'driver_subscription_inactive';
    END IF;

    IF _lat IS NULL OR _lng IS NULL
       OR _lat < -90 OR _lat > 90
       OR _lng < -180 OR _lng > 180 THEN
      RAISE EXCEPTION 'invalid_location';
    END IF;
  END IF;

  UPDATE public.drivers
  SET
    is_online = coalesce(_online, false),
    current_lat = CASE WHEN coalesce(_online, false) THEN _lat ELSE current_lat END,
    current_lng = CASE WHEN coalesce(_online, false) THEN _lng ELSE current_lng END,
    current_heading = CASE WHEN coalesce(_online, false) THEN _heading ELSE current_heading END,
    current_speed = CASE WHEN coalesce(_online, false) THEN _speed ELSE current_speed END,
    last_location_at = CASE WHEN coalesce(_online, false) THEN now() ELSE last_location_at END,
    updated_at = now()
  WHERE id = v_driver.id
  RETURNING * INTO v_driver;

  RETURN to_jsonb(v_driver);
END;
$function$;

-- Close any stale operational presence left behind by a driver that is no
-- longer eligible. This only reduces privileges and does not remove ride/data.
UPDATE public.drivers
SET is_online = false,
    updated_at = now()
WHERE is_online IS TRUE
  AND NOT (
    approval_status = 'aprovado'
    AND lower(coalesce(subscription_status, '')) IN ('active', 'ativa')
  );
