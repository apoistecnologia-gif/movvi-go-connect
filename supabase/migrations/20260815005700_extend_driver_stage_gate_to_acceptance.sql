-- APOIS Corridas: enforce the same driver eligibility invariant when a ride is
-- assigned/accepted, not only on arrival/start. RPCs still perform their own
-- checks; this is the table-boundary backstop for every write path.

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
     or new.status not in ('motorista_a_caminho','motorista_chegou','em_viagem') then
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
