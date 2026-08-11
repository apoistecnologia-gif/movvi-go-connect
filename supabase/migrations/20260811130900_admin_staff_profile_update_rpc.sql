create or replace function public.admin_set_staff_profile(_auth_user_id uuid, _role public.app_role, _active boolean, _display_name text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.profiles%rowtype;
  v_after public.profiles%rowtype;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('roles.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if _auth_user_id is null or _role is null then raise exception 'invalid_staff_profile' using errcode='22023'; end if;

  select * into v_before from public.profiles where user_id=_auth_user_id for update;
  if not found then raise exception 'staff_profile_not_found' using errcode='P0002'; end if;

  if _auth_user_id=v_actor and (coalesce(_active,true)=false or _role<>v_before.role) then
    raise exception 'cannot_change_own_admin_access' using errcode='42501';
  end if;

  update public.profiles
  set role=_role,
      active=coalesce(_active,true),
      display_name=nullif(btrim(coalesce(_display_name,'')),''),
      updated_at=now()
  where user_id=_auth_user_id
  returning * into v_after;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (
    v_actor,
    'admin.staff_profile.updated',
    'admin_profile',
    _auth_user_id::text,
    jsonb_build_object(
      'before',jsonb_build_object('role',v_before.role,'active',v_before.active,'display_name',v_before.display_name),
      'after',jsonb_build_object('role',v_after.role,'active',v_after.active,'display_name',v_after.display_name)
    )
  );

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.admin_set_staff_profile(uuid,public.app_role,boolean,text) from public,anon;
grant execute on function public.admin_set_staff_profile(uuid,public.app_role,boolean,text) to authenticated;
