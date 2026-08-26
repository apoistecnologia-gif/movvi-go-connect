-- Motoristas precisam ter data de nascimento válida e idade mínima de 18 anos.
-- A produção não possui motoristas sem data ou menores de idade no momento.

create or replace function private.enforce_driver_birth_date()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.birth_date is null then
    raise exception 'birth_date_required' using errcode='22023';
  end if;
  if new.birth_date > current_date then
    raise exception 'invalid_birth_date' using errcode='22023';
  end if;
  if new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'driver_must_be_adult' using errcode='22023';
  end if;
  return new;
end;
$function$;

revoke execute on function private.enforce_driver_birth_date() from public, anon, authenticated;
grant execute on function private.enforce_driver_birth_date() to postgres, service_role;

drop trigger if exists trg_drivers_validate_birth_date on public.drivers;
create trigger trg_drivers_validate_birth_date
before insert or update of birth_date on public.drivers
for each row execute function private.enforce_driver_birth_date();
