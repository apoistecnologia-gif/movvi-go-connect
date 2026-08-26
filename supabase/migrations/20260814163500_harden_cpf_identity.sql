-- CPF is an identity/fraud boundary. Existing legacy rows are left untouched;
-- every future CPF insert/change is normalized and validated server-side.

create or replace function private.is_valid_cpf(_cpf text)
returns boolean
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_digits text := regexp_replace(coalesce(_cpf,''),'[^0-9]','','g');
  v_sum integer := 0;
  v_digit1 integer;
  v_digit2 integer;
  i integer;
begin
  if length(v_digits) <> 11 then return false; end if;
  if v_digits = repeat(substr(v_digits,1,1),11) then return false; end if;

  for i in 1..9 loop
    v_sum := v_sum + substr(v_digits,i,1)::integer * (11-i);
  end loop;
  v_digit1 := (11 - (v_sum % 11)) % 10;
  if v_digit1 <> substr(v_digits,10,1)::integer then return false; end if;

  v_sum := 0;
  for i in 1..10 loop
    v_sum := v_sum + substr(v_digits,i,1)::integer * (12-i);
  end loop;
  v_digit2 := (11 - (v_sum % 11)) % 10;
  return v_digit2 = substr(v_digits,11,1)::integer;
end;
$function$;

revoke execute on function private.is_valid_cpf(text) from public, anon, authenticated;
grant execute on function private.is_valid_cpf(text) to postgres, service_role;

create or replace function private.enforce_valid_cpf()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_digits text;
begin
  if new.cpf is null or btrim(new.cpf) = '' then
    new.cpf := null;
    return new;
  end if;

  v_digits := regexp_replace(new.cpf,'[^0-9]','','g');
  if not private.is_valid_cpf(v_digits) then
    raise exception 'invalid_cpf' using errcode='22023';
  end if;

  new.cpf := v_digits;
  return new;
end;
$function$;

revoke execute on function private.enforce_valid_cpf() from public, anon, authenticated;
grant execute on function private.enforce_valid_cpf() to postgres, service_role;

drop trigger if exists trg_users_validate_cpf on public.users;
create trigger trg_users_validate_cpf
before insert or update of cpf on public.users
for each row execute function private.enforce_valid_cpf();

drop trigger if exists trg_drivers_validate_cpf on public.drivers;
create trigger trg_drivers_validate_cpf
before insert or update of cpf on public.drivers
for each row execute function private.enforce_valid_cpf();

-- There are no duplicate normalized CPFs in production at migration time.
-- Keep soft-deleted mobility identities outside the active-user uniqueness gate.
create unique index if not exists users_cpf_unique_active
  on public.users ((regexp_replace(cpf,'[^0-9]','','g')))
  where cpf is not null and btrim(cpf) <> '' and deleted_at is null;

create unique index if not exists drivers_cpf_unique
  on public.drivers ((regexp_replace(cpf,'[^0-9]','','g')))
  where cpf is not null and btrim(cpf) <> '';
