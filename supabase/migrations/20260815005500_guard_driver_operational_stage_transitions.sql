-- APOIS Corridas: eligibility is not only an acceptance-time property.
-- A driver can be suspended, blocked, go offline, or lose subscription between
-- accepting a ride and marking arrival / starting it. Enforce the operational
-- gate at the table boundary for every transition into those pre-trip stages.

create or replace function private.enforce_driver_operational_stage_transition()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_driver public.drivers%rowtype;
begin
  if new.status is not distinct from old.status
     or new.status not in ('motorista_chegou','em_viagem') then
    return new;
  end if;

  if new.driver_id is null then
    raise exception 'driver_required_for_ride_stage' using errcode='55000';
  end if;

  select * into v_driver
  from public.drivers d
  where d.id=new.driver_id;

  if not found then
    raise exception 'driver_profile_missing' using errcode='55000';
  end if;

  if v_driver.approval_status <> 'aprovado' then
    raise exception 'driver_not_approved' using errcode='55000';
  end if;

  if not private.driver_subscription_allows_rides(v_driver.subscription_status) then
    raise exception 'driver_subscription_inactive' using errcode='55000';
  end if;

  if v_driver.is_online is not true then
    raise exception 'driver_offline' using errcode='55000';
  end if;

  return new;
end;
$function$;

revoke execute on function private.enforce_driver_operational_stage_transition()
  from public,anon,authenticated;
grant execute on function private.enforce_driver_operational_stage_transition()
  to postgres,service_role;

drop trigger if exists trg_rides_driver_operational_stage_gate on public.rides;
create trigger trg_rides_driver_operational_stage_gate
before update of status,driver_id on public.rides
for each row
execute function private.enforce_driver_operational_stage_transition();
