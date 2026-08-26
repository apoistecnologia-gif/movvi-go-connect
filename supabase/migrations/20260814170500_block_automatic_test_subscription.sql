-- Production registrations must not silently gain an operational "teste"
-- subscription. Existing explicitly-created test drivers are preserved.
-- New driver profiles start pending and must be activated by the canonical
-- payment/webhook flow before the online/dispatch gate accepts them.

create or replace function private.normalize_new_driver_subscription()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if lower(coalesce(new.subscription_status,'')) = 'teste' then
    new.subscription_status := 'pending';
  end if;
  return new;
end;
$function$;

revoke execute on function private.normalize_new_driver_subscription() from public, anon, authenticated;
grant execute on function private.normalize_new_driver_subscription() to postgres, service_role;

drop trigger if exists trg_drivers_normalize_new_subscription on public.drivers;
create trigger trg_drivers_normalize_new_subscription
before insert on public.drivers
for each row execute function private.normalize_new_driver_subscription();
