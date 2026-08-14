-- APOIS Corridas: strengthen the server-side telemetry boundary against
-- arbitrary coordinate jumps. Reported current_speed alone is not trusted;
-- derive an implied speed from successive server-stamped positions instead.

create or replace function private.enforce_driver_presence_telemetry()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_elapsed_seconds double precision;
  v_distance_m double precision;
  v_haversine double precision;
begin
  if new.is_online then
    if new.current_lat is null or new.current_lng is null then
      raise exception 'invalid_location' using errcode='22023';
    end if;

    if new.current_lat < -35.5 or new.current_lat > 6.5
       or new.current_lng < -75 or new.current_lng > -32 then
      raise exception 'location_outside_operating_country' using errcode='22023';
    end if;
  end if;

  if new.current_heading is not null
     and (new.current_heading < 0 or new.current_heading >= 360) then
    raise exception 'invalid_heading' using errcode='22023';
  end if;

  -- Client-reported speed remains a coarse sanity check.
  if new.current_speed is not null
     and (new.current_speed < 0 or new.current_speed > 100) then
    raise exception 'invalid_speed' using errcode='22023';
  end if;

  -- While continuously online, independently derive speed from the previous
  -- accepted position. This closes the path where a modified client submits a
  -- fake coordinate together with NULL/forged current_speed. Offline -> online
  -- is intentionally excluded so a driver can legitimately reconnect after
  -- travelling while the app was offline.
  if tg_op = 'UPDATE'
     and old.is_online is true
     and new.is_online is true
     and old.current_lat is not null
     and old.current_lng is not null
     and old.last_location_at is not null
     and (new.current_lat is distinct from old.current_lat
          or new.current_lng is distinct from old.current_lng) then

    v_elapsed_seconds := extract(epoch from (
      coalesce(new.last_location_at, pg_catalog.clock_timestamp()) - old.last_location_at
    ));

    -- last_location_at is server-stamped by the canonical presence RPC. A
    -- non-forward timestamp during a coordinate change is not a valid sample.
    if v_elapsed_seconds <= 0 then
      raise exception 'invalid_location_timestamp' using errcode='22023';
    end if;

    v_haversine :=
      power(sin(radians((new.current_lat - old.current_lat)::double precision) / 2), 2)
      + cos(radians(old.current_lat::double precision))
        * cos(radians(new.current_lat::double precision))
        * power(sin(radians((new.current_lng - old.current_lng)::double precision) / 2), 2);

    v_distance_m := 6371000.0 * 2.0
      * asin(sqrt(least(1.0, greatest(0.0, v_haversine))));

    -- 100 m/s (~360 km/h) is intentionally generous for GPS jitter and road
    -- operation, while still rejecting teleport-style spoofing/corruption.
    if v_distance_m / greatest(v_elapsed_seconds, 1.0) > 100.0 then
      raise exception 'implausible_location_jump' using errcode='22023';
    end if;
  end if;

  return new;
end;
$function$;

revoke execute on function private.enforce_driver_presence_telemetry() from public, anon, authenticated;
grant execute on function private.enforce_driver_presence_telemetry() to postgres, service_role;
