create or replace function public.admin_provision_staff(_auth_user_id uuid, _role public.app_role, _display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_row public.profiles%rowtype;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('roles.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if _auth_user_id is null or _role is null then raise exception 'invalid_staff_profile' using errcode='22023'; end if;
  if exists (select 1 from public.profiles where user_id=_auth_user_id) then raise exception 'staff_profile_exists' using errcode='23505'; end if;

  select email into v_email from auth.users where id=_auth_user_id;
  if v_email is null then raise exception 'auth_user_not_found' using errcode='P0002'; end if;

  insert into public.profiles(user_id,email,display_name,role,active,created_at,updated_at)
  values (_auth_user_id,v_email,nullif(btrim(coalesce(_display_name,'')),''),_role,true,now(),now())
  returning * into v_row;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (
    v_actor,
    'admin.staff_profile.provisioned',
    'admin_profile',
    _auth_user_id::text,
    jsonb_build_object('role',v_row.role,'active',v_row.active,'display_name',v_row.display_name)
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_provision_staff(uuid,public.app_role,text) from public,anon;
grant execute on function public.admin_provision_staff(uuid,public.app_role,text) to authenticated;
