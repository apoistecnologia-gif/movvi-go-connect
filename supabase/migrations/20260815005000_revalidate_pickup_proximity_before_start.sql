-- APOIS Corridas: the passenger PIN proves consent to start, but it must not
-- replace the physical pickup check. A driver who legitimately marked arrival
-- could move away before receiving the PIN. Revalidate fresh server-known
-- telemetry and the same configurable pickup geofence before consuming the PIN.

create or replace function apois_rpc_private.driver_start_ride(_ride_id uuid, _security_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','apois_rpc_private'
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_user_id uuid;
  v_driver public.drivers%rowtype;
  v_ride public.rides%rowtype;
  v_expected_code text;
  v_now timestamptz := clock_timestamp();
  v_attempt integer;
  v_remaining integer;
  v_lock_until timestamptz;
  v_retry_after integer;
  v_max_distance_m numeric := 500;
  v_max_age_seconds integer := 120;
  v_distance_m double precision;
  c_max_attempts constant integer := 5;
  c_window constant interval := interval '5 minutes';
  c_lock_interval constant interval := interval '5 minutes';
begin
  if v_auth_user_id is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  v_user_id := public.mobility_user_id();
  if v_user_id is null then
    raise exception 'driver_profile_missing';
  end if;

  select d.* into v_driver
  from public.drivers d
  where d.user_id=v_user_id
  for update;

  if not found then
    raise exception 'driver_profile_missing';
  end if;

  select r.* into v_ride
  from public.rides r
  where r.id=_ride_id and r.driver_id=v_driver.id
  for update;

  if not found or v_ride.status <> 'motorista_chegou' then
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
     or v_driver.last_location_at < v_now - make_interval(secs => v_max_age_seconds) then
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

  -- Only after the physical pickup check succeeds do we read/consume PIN state.
  select s.security_code into v_expected_code
  from public.ride_security_secrets s
  where s.ride_id=v_ride.id;

  if v_expected_code is null then
    raise exception 'security_code_unavailable';
  end if;

  if v_ride.security_code_locked_until is not null and v_ride.security_code_locked_until > v_now then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_ride.security_code_locked_until-v_now)))::integer);
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values (v_auth_user_id,'ride_security_code_locked_attempt','ride',v_ride.id::text,
      jsonb_build_object('driver_id',v_driver.id,'driver_domain_user_id',v_user_id,'retry_after_seconds',v_retry_after));
    return jsonb_build_object('ok',false,'code','security_code_temporarily_locked','retry_after_seconds',v_retry_after,'remaining_attempts',0);
  end if;

  if trim(coalesce(_security_code,'')) is distinct from v_expected_code then
    v_attempt := case
      when v_ride.security_code_locked_until is not null and v_ride.security_code_locked_until <= v_now then 1
      when v_ride.security_code_last_failed_at is null or v_ride.security_code_last_failed_at < v_now-c_window then 1
      else coalesce(v_ride.security_code_failed_attempts,0)+1
    end;

    if v_attempt >= c_max_attempts then
      v_lock_until := v_now+c_lock_interval;
      v_retry_after := ceil(extract(epoch from c_lock_interval))::integer;
      v_remaining := 0;
      update public.rides
      set security_code_failed_attempts=0,security_code_locked_until=v_lock_until,
          security_code_last_failed_at=v_now,updated_at=v_now
      where id=v_ride.id;
    else
      v_remaining := c_max_attempts-v_attempt;
      update public.rides
      set security_code_failed_attempts=v_attempt,security_code_locked_until=null,
          security_code_last_failed_at=v_now,updated_at=v_now
      where id=v_ride.id;
    end if;

    insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values (
      v_auth_user_id,
      case when v_lock_until is null then 'ride_security_code_failed' else 'ride_security_code_temporarily_locked' end,
      'ride',v_ride.id::text,
      jsonb_build_object('driver_id',v_driver.id,'driver_domain_user_id',v_user_id,'attempt_number',v_attempt,
        'max_attempts',c_max_attempts,'remaining_attempts',v_remaining,'locked_until',v_lock_until)
    );

    if v_lock_until is not null then
      return jsonb_build_object('ok',false,'code','security_code_temporarily_locked','retry_after_seconds',v_retry_after,'remaining_attempts',0);
    end if;

    return jsonb_build_object('ok',false,'code','invalid_security_code','remaining_attempts',v_remaining);
  end if;

  update public.rides
  set status='em_viagem',started_at=coalesce(started_at,v_now),security_code_failed_attempts=0,
      security_code_locked_until=null,security_code_last_failed_at=null,updated_at=v_now
  where id=v_ride.id and driver_id=v_driver.id and status='motorista_chegou'
  returning * into v_ride;

  if not found then
    raise exception 'invalid_ride_transition';
  end if;

  delete from public.ride_security_secrets where ride_id=v_ride.id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (v_auth_user_id,'ride_security_code_verified','ride',v_ride.id::text,
    jsonb_build_object('driver_id',v_driver.id,'driver_domain_user_id',v_user_id,
      'distance_to_pickup_m',round(v_distance_m::numeric,1),'start_max_distance_m',v_max_distance_m));

  return to_jsonb(v_ride)-'security_code';
end;
$function$;
