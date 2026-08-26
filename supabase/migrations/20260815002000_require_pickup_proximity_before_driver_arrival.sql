-- APOIS Corridas: `motorista_chegou` changes the passenger cancellation/no-show
-- lifecycle, so it cannot be asserted from an arbitrary remote location.
-- Require fresh server-known telemetry and a configurable pickup geofence.

insert into public.app_settings(key,value)
values
  ('ride.arrival_max_distance_m','500'::jsonb),
  ('ride.arrival_location_max_age_seconds','120'::jsonb)
on conflict(key) do nothing;

create or replace function apois_rpc_private.driver_mark_arrived(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','apois_rpc_private'
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_ride public.rides%rowtype;
  v_max_distance_m numeric := 500;
  v_max_age_seconds integer := 120;
  v_distance_m double precision;
begin
  if v_auth_user_id is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  v_profile_id := public.mobility_user_id();
  if v_profile_id is null then
    raise exception 'driver_profile_missing';
  end if;

  select * into v_driver
  from public.drivers
  where user_id=v_profile_id
  for update;

  if not found then
    raise exception 'driver_profile_missing';
  end if;

  select * into v_ride
  from public.rides
  where id=_ride_id
    and driver_id=v_driver.id
    and status='motorista_a_caminho'
  for update;

  if not found then
    raise exception 'invalid_ride_transition';
  end if;

  if v_ride.origin_lat is null or v_ride.origin_lng is null then
    raise exception 'pickup_location_missing' using errcode='55000';
  end if;

  begin
    select greatest(100,least(coalesce((value #>> '{}')::numeric,500),3000))
      into v_max_distance_m
    from public.app_settings
    where key='ride.arrival_max_distance_m';
  exception when others then
    v_max_distance_m := 500;
  end;

  begin
    select greatest(30,least(coalesce((value #>> '{}')::integer,120),600))
      into v_max_age_seconds
    from public.app_settings
    where key='ride.arrival_location_max_age_seconds';
  exception when others then
    v_max_age_seconds := 120;
  end;

  if v_driver.current_lat is null
     or v_driver.current_lng is null
     or v_driver.last_location_at is null
     or v_driver.last_location_at < now() - make_interval(secs => v_max_age_seconds) then
    raise exception 'driver_location_stale' using errcode='55000';
  end if;

  v_distance_m := 6371000.0 * 2.0 * asin(sqrt(least(1.0,greatest(0.0,
    power(sin(radians((v_driver.current_lat-v_ride.origin_lat)::double precision)/2),2)
    + cos(radians(v_ride.origin_lat::double precision))
      * cos(radians(v_driver.current_lat::double precision))
      * power(sin(radians((v_driver.current_lng-v_ride.origin_lng)::double precision)/2),2)
  ))));

  if v_distance_m > v_max_distance_m then
    raise exception 'driver_too_far_from_pickup' using errcode='55000';
  end if;

  update public.rides
  set status='motorista_chegou',
      driver_arrived_at=now(),
      updated_at=now()
  where id=v_ride.id
  returning * into v_ride;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    v_auth_user_id,
    'ride.driver_arrived',
    'ride',
    v_ride.id::text,
    jsonb_build_object(
      'driver_id',v_driver.id,
      'driver_domain_user_id',v_profile_id,
      'distance_to_pickup_m',round(v_distance_m::numeric,1),
      'arrival_max_distance_m',v_max_distance_m
    )
  );

  return to_jsonb(v_ride);
end;
$function$;
