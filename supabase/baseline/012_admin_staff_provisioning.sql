-- APOIS CORRIDAS — CANONICAL BASELINE 012
-- Phase 8 continuation: explicit staff provisioning in public.profiles.
-- Fresh-database baseline only. Do not execute ad-hoc on production.

create or replace function public.admin_provision_staff(
  _auth_user_id uuid,
  _role public.app_role,
  _display_name text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_auth auth.users%rowtype;
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('roles.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if _auth_user_id is null then raise exception 'invalid_staff_user' using errcode='22023'; end if;

  select * into v_auth from auth.users where id=_auth_user_id limit 1;
  if not found then raise exception 'auth_user_not_found' using errcode='P0002'; end if;

  insert into public.profiles(user_id,email,display_name,role,active)
  values(
    v_auth.id,
    coalesce(lower(btrim(v_auth.email)),''),
    coalesce(
      nullif(left(btrim(coalesce(_display_name,'')),160),''),
      nullif(left(btrim(coalesce(v_auth.raw_user_meta_data->>'name','')),160),''),
      split_part(coalesce(v_auth.email,''),'@',1),
      'Equipe APOIS'
    ),
    _role,
    true
  )
  on conflict(user_id) do update set
    email=excluded.email,
    display_name=coalesce(excluded.display_name,public.profiles.display_name),
    role=excluded.role,
    active=true,
    updated_at=now()
  returning * into v_profile;

  perform private.admin_audit(
    'admin.staff.provisioned','staff_profile',v_profile.user_id::text,
    jsonb_build_object('role',v_profile.role,'active',v_profile.active)
  );

  return jsonb_build_object(
    'user_id',v_profile.user_id,
    'email',v_profile.email,
    'display_name',v_profile.display_name,
    'role',v_profile.role,
    'active',v_profile.active,
    'updated_at',v_profile.updated_at
  );
end;
$$;

revoke all on function public.admin_provision_staff(uuid,public.app_role,text) from public,anon;
grant execute on function public.admin_provision_staff(uuid,public.app_role,text) to authenticated;
