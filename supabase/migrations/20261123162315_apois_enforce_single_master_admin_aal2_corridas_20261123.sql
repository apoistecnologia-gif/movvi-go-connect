-- Migration already applied in production; retained here for audit history.
do $enable_mfa$
declare
  master_id uuid;
  admin_total integer;
  verified_total integer;
begin
  select u.id into master_id
  from auth.users u
  where lower(u.email) = 'master@apoisbrasil.com.br';

  if master_id is null then
    raise exception 'ABORT: master Corridas account does not exist';
  end if;

  select count(*) into admin_total
  from public.profiles
  where role = 'administrator'::public.app_role;

  if admin_total <> 1 then
    raise exception 'ABORT: expected exactly one Corridas administrator, got %', admin_total;
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = master_id
      and p.role = 'administrator'::public.app_role
      and p.active = true
  ) then
    raise exception 'ABORT: master account is not the active Corridas administrator';
  end if;

  select count(*) into verified_total
  from auth.mfa_factors f
  where f.user_id = master_id
    and f.factor_type = 'totp'
    and f.status = 'verified';

  if verified_total < 1 then
    raise exception 'ABORT: master Corridas does not have a verified TOTP factor';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'has_permission'
      and pg_get_functiondef(p.oid) like '%apois_admin_mfa_ok%'
  ) then
    raise exception 'ABORT: Corridas permission helper is not MFA-aware';
  end if;

  update private.apois_admin_mfa_enforcement
  set enforce_aal2 = true, updated_at = now()
  where singleton = true;

  if not found then
    raise exception 'ABORT: MFA enforcement configuration missing';
  end if;
end;
$enable_mfa$;
