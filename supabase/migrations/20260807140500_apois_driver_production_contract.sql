BEGIN;

-- APOIS Motorista — contrato mínimo seguro para homologação em produção.
-- Mantém o identificador operacional em public.users.id e nunca usa auth.uid()
-- diretamente em candidate_driver_ids/accepted_driver_id.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS vehicle_year integer,
  ADD COLUMN IF NOT EXISTS selfie_url text,
  ADD COLUMN IF NOT EXISTS cnh_url text,
  ADD COLUMN IF NOT EXISTS cnh_back_url text,
  ADD COLUMN IF NOT EXISTS vehicle_document_url text,
  ADD COLUMN IF NOT EXISTS documents_status text,
  ADD COLUMN IF NOT EXISTS motivo_reprovacao text,
  ADD COLUMN IF NOT EXISTS current_speed numeric;

CREATE UNIQUE INDEX IF NOT EXISTS drivers_user_id_unique
  ON public.drivers(user_id);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drivers_no_passenger_direct_access ON public.drivers;
DROP POLICY IF EXISTS drivers_read_own_profile ON public.drivers;
CREATE POLICY drivers_read_own_profile
  ON public.drivers
  FOR SELECT
  TO authenticated
  USING (user_id = public.mobility_user_id());

DROP POLICY IF EXISTS rides_driver_read_relevant ON public.rides;
CREATE POLICY rides_driver_read_relevant
  ON public.rides
  FOR SELECT
  TO authenticated
  USING (
    public.mobility_user_id() = ANY(candidate_driver_ids)
    OR accepted_driver_id = public.mobility_user_id()
    OR EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.id = rides.driver_id
        AND d.user_id = public.mobility_user_id()
    )
  );

CREATE OR REPLACE FUNCTION public.driver_bootstrap_profile(
  _category text,
  _vehicle_model text,
  _vehicle_plate text,
  _vehicle_color text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.users%ROWTYPE;
  v_driver public.drivers%ROWTYPE;
  v_category text := lower(trim(coalesce(_category, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF v_category NOT IN ('carros','motos','fretes','guincho','envios') THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;

  SELECT * INTO v_profile
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_missing';
  END IF;

  SELECT * INTO v_driver
  FROM public.drivers
  WHERE user_id = v_profile.id
  LIMIT 1;

  IF FOUND THEN
    RETURN to_jsonb(v_driver);
  END IF;

  INSERT INTO public.drivers (
    user_id,
    name,
    email,
    phone,
    category,
    vehicle_model,
    vehicle_plate,
    vehicle_color,
    approval_status,
    subscription_status,
    is_online,
    created_at,
    updated_at
  ) VALUES (
    v_profile.id,
    coalesce(v_profile.name, v_profile.email, 'Motorista APOIS'),
    v_profile.email,
    v_profile.phone,
    v_category,
    nullif(trim(coalesce(_vehicle_model, '')), ''),
    upper(nullif(trim(coalesce(_vehicle_plate, '')), '')),
    nullif(trim(coalesce(_vehicle_color, '')), ''),
    'pendente',
    'teste',
    false,
    now(),
    now()
  )
  RETURNING * INTO v_driver;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_profile.id, 'driver')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN to_jsonb(v_driver);
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_get_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
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
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_driver);
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_set_presence(
  _online boolean,
  _lat numeric DEFAULT NULL,
  _lng numeric DEFAULT NULL,
  _heading numeric DEFAULT NULL,
  _speed numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF v_driver.approval_status <> 'aprovado' THEN
    RAISE EXCEPTION 'driver_not_approved';
  END IF;

  IF lower(coalesce(v_driver.subscription_status, '')) NOT IN ('active','ativa','teste') THEN
    RAISE EXCEPTION 'driver_subscription_inactive';
  END IF;

  IF coalesce(_online, false) THEN
    IF _lat IS NULL OR _lng IS NULL OR _lat < -90 OR _lat > 90 OR _lng < -180 OR _lng > 180 THEN
      RAISE EXCEPTION 'invalid_location';
    END IF;
  END IF;

  UPDATE public.drivers
  SET is_online = coalesce(_online, false),
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
$$;

CREATE OR REPLACE FUNCTION public.driver_accept_ride(_ride_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_driver public.drivers%ROWTYPE;
  v_ride public.rides%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  v_profile_id := public.mobility_user_id();
  SELECT * INTO v_driver
  FROM public.drivers
  WHERE user_id = v_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'driver_profile_missing'; END IF;
  IF v_driver.approval_status <> 'aprovado' THEN RAISE EXCEPTION 'driver_not_approved'; END IF;
  IF lower(coalesce(v_driver.subscription_status, '')) NOT IN ('active','ativa','teste') THEN
    RAISE EXCEPTION 'driver_subscription_inactive';
  END IF;
  IF NOT v_driver.is_online THEN RAISE EXCEPTION 'driver_offline'; END IF;

  UPDATE public.rides
  SET status = 'motorista_a_caminho',
      driver_id = v_driver.id,
      accepted_driver_id = v_profile_id,
      accepted_at = now(),
      current_offer_driver_id = NULL,
      security_code = coalesce(security_code, lpad((floor(random() * 10000))::int::text, 4, '0')),
      driver_name = v_driver.name,
      driver_photo = v_driver.photo_url,
      driver_phone = v_driver.phone,
      driver_vehicle_model = v_driver.vehicle_model,
      driver_vehicle_color = v_driver.vehicle_color,
      driver_vehicle_plate = v_driver.vehicle_plate,
      driver_rating = v_driver.rating,
      driver_latitude = v_driver.current_lat,
      driver_longitude = v_driver.current_lng,
      driver_heading = v_driver.current_heading,
      updated_at = now()
  WHERE id = _ride_id
    AND status = 'procurar_motorista'
    AND driver_id IS NULL
    AND v_profile_id = ANY(candidate_driver_ids)
    AND (request_expires_at IS NULL OR request_expires_at > now())
  RETURNING * INTO v_ride;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ride_offer_unavailable';
  END IF;

  RETURN to_jsonb(v_ride);
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_reject_ride(_ride_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_ride public.rides%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  v_profile_id := public.mobility_user_id();

  UPDATE public.rides
  SET rejected_driver_ids = array_append(array_remove(rejected_driver_ids, v_profile_id), v_profile_id),
      candidate_driver_ids = array_remove(candidate_driver_ids, v_profile_id),
      offered_driver_ids = array_remove(offered_driver_ids, v_profile_id),
      updated_at = now()
  WHERE id = _ride_id
    AND status = 'procurar_motorista'
    AND v_profile_id = ANY(candidate_driver_ids)
  RETURNING * INTO v_ride;

  IF NOT FOUND THEN RAISE EXCEPTION 'ride_offer_unavailable'; END IF;
  RETURN to_jsonb(v_ride);
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_mark_arrived(_ride_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id uuid;
  v_ride public.rides%ROWTYPE;
BEGIN
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = public.mobility_user_id();
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'driver_profile_missing'; END IF;

  UPDATE public.rides
  SET status = 'motorista_chegou', driver_arrived_at = now(), updated_at = now()
  WHERE id = _ride_id AND driver_id = v_driver_id AND status = 'motorista_a_caminho'
  RETURNING * INTO v_ride;

  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_ride_transition'; END IF;
  RETURN to_jsonb(v_ride);
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_start_ride(_ride_id uuid, _security_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id uuid;
  v_ride public.rides%ROWTYPE;
BEGIN
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = public.mobility_user_id();
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'driver_profile_missing'; END IF;

  UPDATE public.rides
  SET status = 'em_viagem', started_at = now(), updated_at = now()
  WHERE id = _ride_id
    AND driver_id = v_driver_id
    AND status = 'motorista_chegou'
    AND security_code = trim(coalesce(_security_code, ''))
  RETURNING * INTO v_ride;

  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_security_code_or_transition'; END IF;
  RETURN to_jsonb(v_ride);
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_finish_ride(_ride_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id uuid;
  v_ride public.rides%ROWTYPE;
BEGIN
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = public.mobility_user_id();
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'driver_profile_missing'; END IF;

  UPDATE public.rides
  SET status = 'finalizada',
      final_price = coalesce(final_price, estimated_price),
      completed_at = now(),
      updated_at = now()
  WHERE id = _ride_id AND driver_id = v_driver_id AND status = 'em_viagem'
  RETURNING * INTO v_ride;

  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_ride_transition'; END IF;

  UPDATE public.drivers SET is_online = false, updated_at = now() WHERE id = v_driver_id;
  RETURN to_jsonb(v_ride);
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_cancel_ride(_ride_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id uuid;
  v_ride public.rides%ROWTYPE;
BEGIN
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = public.mobility_user_id();
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'driver_profile_missing'; END IF;

  UPDATE public.rides
  SET status = 'cancelada_motorista',
      cancellation_reason = coalesce(nullif(left(trim(coalesce(_reason, '')), 500), ''), 'Cancelada pelo motorista'),
      cancelled_by = 'driver',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = _ride_id
    AND driver_id = v_driver_id
    AND status IN ('motorista_a_caminho','motorista_chegou')
  RETURNING * INTO v_ride;

  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_ride_transition'; END IF;
  RETURN to_jsonb(v_ride);
END;
$$;

REVOKE ALL ON FUNCTION public.driver_bootstrap_profile(text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_get_profile() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_set_presence(boolean,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_accept_ride(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_reject_ride(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_mark_arrived(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_start_ride(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_finish_ride(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_cancel_ride(uuid,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.driver_bootstrap_profile(text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_get_profile() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_set_presence(boolean,numeric,numeric,numeric,numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_accept_ride(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_reject_ride(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_mark_arrived(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_start_ride(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_finish_ride(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_cancel_ride(uuid,text) TO authenticated, service_role;

COMMIT;
