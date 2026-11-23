-- Executed in Supabase production on 2026-11-23; retained for audit and recovery.
do $lockdown$
declare master_id uuid;
begin
 select id into master_id from auth.users where lower(email)='master@apoisbrasil.com.br';
 if master_id is null then raise exception 'ABORT: master account is missing'; end if;
 if not exists (select 1 from public.profiles p where p.user_id=master_id and p.role='administrator'::public.app_role and p.active=true) then
   raise exception 'ABORT: master Corridas admin profile is missing or inactive';
 end if;
 if (select count(*) from public.profiles where role='administrator'::public.app_role) <> 3 then
   raise exception 'ABORT: Corridas admin count changed; inspect before proceeding';
 end if;
 -- Never delete auth.users or drivers/passengers. Disable only the legacy
 -- backoffice staff profiles and replace privileged role by least-privileged.
 update public.profiles
 set role='reader'::public.app_role, active=false
 where role='administrator'::public.app_role and user_id<>master_id;
 if (select count(*) from public.profiles where role='administrator'::public.app_role) <> 1 then
   raise exception 'ABORT: Corridas must have exactly one administrator';
 end if;
end;
$lockdown$;
create unique index if not exists apois_single_administrator_profile_20261123
on public.profiles ((true)) where role='administrator'::public.app_role;
