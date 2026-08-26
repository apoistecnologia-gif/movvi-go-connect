-- APOIS Corridas: trial/bootstrap status must never authorize driver operations.
-- Keep legacy active spellings only; new-driver normalization remains responsible
-- for converting the historical "teste" default to "pending" on INSERT.

CREATE OR REPLACE FUNCTION apois_rpc_private.driver_accept_ride_candidate_legacy(_ride_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_ride public.rides%rowtype;
  v_current public.rides%rowtype;
  v_radius_km numeric := 5;
  v_distance_km numeric;
  v_public_driver_name text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  v_profile_id := public.mobility_user_id();
  select * into v_driver
  from public.drivers
  where user_id = v_profile_id
  for update;

  if not found then raise exception 'driver_profile_missing'; end if;
  if v_driver.approval_status <> 'aprovado' then raise exception 'driver_not_approved'; end if;
  if lower(coalesce(v_driver.subscription_status,'')) not in ('active','ativa') then raise exception 'driver_subscription_inactive'; end if;
  if not v_driver.is_online then raise exception 'driver_offline'; end if;

  v_public_driver_name := nullif(split_part(trim(coalesce(v_driver.name, '')), ' ', 1), '');

  select * into v_ride
  from public.rides
  where id=_ride_id
  for update;

  if not found
     or v_ride.status <> 'procurar_motorista'
     or v_ride.driver_id is not null
     or not (v_profile_id=any(coalesce(v_ride.candidate_driver_ids,'{}'::uuid[])))
     or (v_profile_id=any(coalesce(v_ride.rejected_driver_ids,'{}'::uuid[])))
     or (v_ride.request_expires_at is not null and v_ride.request_expires_at<=now()) then
    raise exception 'ride_offer_unavailable';
  end if;

  select * into v_current
  from public.rides
  where driver_id=v_driver.id
    and status in ('motorista_a_caminho','motorista_chegou','em_viagem')
    and id<>_ride_id
  order by created_at desc
  limit 1
  for update;

  if found and v_current.status in ('motorista_a_caminho','motorista_chegou') then
    raise exception 'driver_busy';
  end if;

  if found and v_current.status='em_viagem' then
    if exists (
      select 1 from public.rides q
      where q.driver_id=v_driver.id
        and q.status='procurar_motorista'
        and q.queued_after_ride_id is not null
        and q.id<>_ride_id
    ) then
      raise exception 'next_ride_already_reserved';
    end if;

    if v_current.destination_lat is null or v_current.destination_lng is null
       or v_ride.origin_lat is null or v_ride.origin_lng is null then
      raise exception 'next_ride_location_unavailable';
    end if;

    begin
      select coalesce((value #>> '{}')::numeric,5)
        into v_radius_km
      from public.app_settings
      where key='ride.next_offer_max_distance_km';
    exception when others then
      v_radius_km := 5;
    end;
    v_radius_km := greatest(0.5, least(coalesce(v_radius_km,5),20));

    v_distance_km := 6371 * acos(
      least(1, greatest(-1,
        cos(radians(v_ride.origin_lat::double precision))
        * cos(radians(v_current.destination_lat::double precision))
        * cos(radians(v_current.destination_lng::double precision) - radians(v_ride.origin_lng::double precision))
        + sin(radians(v_ride.origin_lat::double precision))
        * sin(radians(v_current.destination_lat::double precision))
      ))
    );

    if v_distance_km > v_radius_km then
      raise exception 'next_ride_not_nearby';
    end if;

    update public.rides
    set driver_id=v_driver.id,
        accepted_driver_id=v_driver.id,
        queued_after_ride_id=v_current.id,
        queued_at=now(),
        request_expires_at=null,
        search_expires_at=null,
        current_offer_driver_id=null,
        driver_name=v_public_driver_name,
        driver_photo=v_driver.photo_url,
        driver_phone=v_driver.phone,
        driver_vehicle_model=v_driver.vehicle_model,
        driver_vehicle_color=v_driver.vehicle_color,
        driver_vehicle_plate=v_driver.vehicle_plate,
        driver_rating=v_driver.rating,
        cancellation_reason=null,
        cancelled_by=null,
        cancelled_at=null,
        updated_at=now()
    where id=_ride_id
      and status='procurar_motorista'
      and driver_id is null
    returning * into v_ride;

    if not found then raise exception 'ride_offer_unavailable'; end if;
    return to_jsonb(v_ride);
  end if;

  update public.rides
  set status='motorista_a_caminho',
      driver_id=v_driver.id,
      accepted_driver_id=v_driver.id,
      accepted_at=now(),
      current_offer_driver_id=null,
      request_expires_at=null,
      search_expires_at=null,
      security_code=coalesce(security_code,lpad((floor(random()*10000))::int::text,4,'0')),
      driver_name=v_public_driver_name,
      driver_photo=v_driver.photo_url,
      driver_phone=v_driver.phone,
      driver_vehicle_model=v_driver.vehicle_model,
      driver_vehicle_color=v_driver.vehicle_color,
      driver_vehicle_plate=v_driver.vehicle_plate,
      driver_rating=v_driver.rating,
      driver_latitude=v_driver.current_lat,
      driver_longitude=v_driver.current_lng,
      driver_heading=v_driver.current_heading,
      cancellation_reason=null,
      cancelled_by=null,
      cancelled_at=null,
      updated_at=now()
  where id=_ride_id
    and status='procurar_motorista'
    and driver_id is null
  returning * into v_ride;

  if not found then raise exception 'ride_offer_unavailable'; end if;
  return to_jsonb(v_ride);
end;
$function$;

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
DECLARE v_profile_id uuid; v_driver public.drivers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  v_profile_id := public.mobility_user_id(); IF v_profile_id IS NULL THEN RAISE EXCEPTION 'profile_missing'; END IF;
  SELECT * INTO v_driver FROM public.drivers WHERE user_id = v_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'driver_profile_missing'; END IF;
  IF v_driver.approval_status <> 'aprovado' THEN RAISE EXCEPTION 'driver_not_approved'; END IF;
  IF lower(coalesce(v_driver.subscription_status,'')) NOT IN ('active','ativa') THEN RAISE EXCEPTION 'driver_subscription_inactive'; END IF;
  IF coalesce(_online,false) AND (_lat IS NULL OR _lng IS NULL OR _lat < -90 OR _lat > 90 OR _lng < -180 OR _lng > 180) THEN RAISE EXCEPTION 'invalid_location'; END IF;
  UPDATE public.drivers SET is_online=coalesce(_online,false),current_lat=CASE WHEN coalesce(_online,false) THEN _lat ELSE current_lat END,current_lng=CASE WHEN coalesce(_online,false) THEN _lng ELSE current_lng END,current_heading=CASE WHEN coalesce(_online,false) THEN _heading ELSE current_heading END,current_speed=CASE WHEN coalesce(_online,false) THEN _speed ELSE current_speed END,last_location_at=CASE WHEN coalesce(_online,false) THEN now() ELSE last_location_at END,updated_at=now() WHERE id=v_driver.id RETURNING * INTO v_driver;
  RETURN to_jsonb(v_driver);
END; $function$;
