-- Presence telemetry is a dispatch/fraud boundary. Keep the guard deliberately
-- broad enough for nationwide Brazil operation while rejecting impossible data.

create or replace function private.enforce_driver_presence_telemetry()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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

  -- Geolocation speed is meters/second. 100 m/s (~360 km/h) is a generous
  -- upper safety bound that rejects corrupt/spoofed telemetry without harming
  -- normal road operation.
  if new.current_speed is not null
     and (new.current_speed < 0 or new.current_speed > 100) then
    raise exception 'invalid_speed' using errcode='22023';
  end if;

  return new;
end;
$function$;

revoke execute on function private.enforce_driver_presence_telemetry() from public, anon, authenticated;
grant execute on function private.enforce_driver_presence_telemetry() to postgres, service_role;

drop trigger if exists trg_drivers_validate_presence_telemetry on public.drivers;
create trigger trg_drivers_validate_presence_telemetry
before insert or update of is_online,current_lat,current_lng,current_heading,current_speed on public.drivers
for each row execute function private.enforce_driver_presence_telemetry();
