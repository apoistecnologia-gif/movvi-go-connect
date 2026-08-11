create or replace function public.admin_set_passenger_status(
  _passenger_id uuid,
  _action text,
  _reason text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.users%rowtype;
  v_after public.users%rowtype;
  v_action text := lower(btrim(coalesce(_action, '')));
  v_reason text := nullif(left(btrim(coalesce(_reason, '')), 500), '');
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('users.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_action not in ('suspend','unsuspend','block','unblock','soft_delete') then raise exception 'unsupported_passenger_action' using errcode='22023'; end if;
  if v_action in ('suspend','block','soft_delete') and v_reason is null then raise exception 'reason_required' using errcode='22023'; end if;

  select u.* into v_before
  from public.users u
  where u.id=_passenger_id
    and exists (select 1 from public.user_roles ur where ur.user_id=u.id and ur.role::text='passenger')
  for update;
  if not found then raise exception 'passenger_not_found' using errcode='P0002'; end if;
  if v_before.deleted_at is not null and v_action <> 'soft_delete' then raise exception 'passenger_deleted' using errcode='55000'; end if;

  case v_action
    when 'suspend' then
      update public.users set suspended_at=coalesce(suspended_at,now()), suspended_until=null, updated_at=now()
      where id=_passenger_id returning * into v_after;
    when 'unsuspend' then
      update public.users set suspended_at=null, suspended_until=null, updated_at=now()
      where id=_passenger_id returning * into v_after;
    when 'block' then
      update public.users set blocked_at=coalesce(blocked_at,now()), block_reason=v_reason, updated_at=now()
      where id=_passenger_id returning * into v_after;
    when 'unblock' then
      update public.users set blocked_at=null, block_reason=null, updated_at=now()
      where id=_passenger_id returning * into v_after;
    when 'soft_delete' then
      update public.users
      set deleted_at=coalesce(deleted_at,now()),
          blocked_at=coalesce(blocked_at,now()),
          block_reason=coalesce(v_reason,block_reason,'Exclusão operacional'),
          suspended_at=coalesce(suspended_at,now()),
          suspended_until=null,
          updated_at=now()
      where id=_passenger_id returning * into v_after;
  end case;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (
    v_actor,
    case v_action
      when 'suspend' then 'admin.passenger.suspended'
      when 'unsuspend' then 'admin.passenger.unsuspended'
      when 'block' then 'admin.passenger.blocked'
      when 'unblock' then 'admin.passenger.unblocked'
      when 'soft_delete' then 'admin.passenger.operationally_deleted'
    end,
    'passenger', _passenger_id::text,
    jsonb_build_object(
      'reason',v_reason,
      'before',jsonb_build_object('suspended_at',v_before.suspended_at,'suspended_until',v_before.suspended_until,'blocked_at',v_before.blocked_at,'block_reason',v_before.block_reason,'deleted_at',v_before.deleted_at),
      'after',jsonb_build_object('suspended_at',v_after.suspended_at,'suspended_until',v_after.suspended_until,'blocked_at',v_after.blocked_at,'block_reason',v_after.block_reason,'deleted_at',v_after.deleted_at),
      'auth_user_deleted',false
    )
  );

  return jsonb_build_object('id',v_after.id,'suspended_at',v_after.suspended_at,'suspended_until',v_after.suspended_until,'blocked_at',v_after.blocked_at,'block_reason',v_after.block_reason,'deleted_at',v_after.deleted_at,'reason',v_reason);
end;
$$;

revoke all on function public.admin_set_passenger_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_passenger_status(uuid,text,text) to authenticated;
