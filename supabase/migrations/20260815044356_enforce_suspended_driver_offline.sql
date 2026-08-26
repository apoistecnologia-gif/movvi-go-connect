create or replace function private.enforce_suspended_driver_offline()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.suspended_at is not null and new.is_online is true then
    raise exception 'suspended_driver_cannot_be_online' using errcode='55000';
  end if;

  return new;
end;
$function$;

revoke execute on function private.enforce_suspended_driver_offline()
  from public, anon, authenticated;
grant execute on function private.enforce_suspended_driver_offline()
  to postgres, service_role;

drop trigger if exists trg_drivers_suspended_offline_gate on public.drivers;
create trigger trg_drivers_suspended_offline_gate
before insert or update of suspended_at, is_online on public.drivers
for each row
execute function private.enforce_suspended_driver_offline();