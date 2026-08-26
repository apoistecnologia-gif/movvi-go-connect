create or replace function public.admin_set_driver_suspension(_driver_id uuid, _suspended boolean, _reason text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before public.drivers%rowtype;
  v_after public.drivers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not private.has_permission('users.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_before from public.drivers where id = _driver_id for update;
  if not found then raise exception 'driver_not_found' using errcode = 'P0002'; end if;

  if _suspended then
    update public.drivers
       set approval_status = 'suspenso',
           suspended_at = coalesce(suspended_at, now()),
           is_online = false,
           updated_at = now()
     where id = _driver_id
     returning * into v_after;
  else
    update public.drivers
       set approval_status = 'aprovado',
           suspended_at = null,
           updated_at = now()
     where id = _driver_id
     returning * into v_after;
  end if;

  return jsonb_build_object(
    'id', v_after.id,
    'approval_status', v_after.approval_status,
    'suspended_at', v_after.suspended_at,
    'is_online', v_after.is_online,
    'reason', nullif(btrim(_reason), '')
  );
end;
$$;

revoke all on function public.admin_set_driver_suspension(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_driver_suspension(uuid, boolean, text) to authenticated;
