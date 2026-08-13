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
  if v_actor is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not private.has_permission('users.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_action not in ('suspend', 'unsuspend') then
    raise exception 'unsupported_passenger_action' using errcode = '22023';
  end if;
  if v_action = 'suspend' and v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select u.* into v_before
  from public.users u
  where u.id = _passenger_id
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = u.id and ur.role::text = 'passenger'
    )
  for update;

  if not found then
    raise exception 'passenger_not_found' using errcode = 'P0002';
  end if;
  if v_before.deleted_at is not null then
    raise exception 'passenger_deleted' using errcode = '55000';
  end if;

  if v_action = 'suspend' then
    update public.users
       set suspended_at = coalesce(suspended_at, now()),
           suspended_until = null,
           updated_at = now()
     where id = _passenger_id
     returning * into v_after;
  else
    update public.users
       set suspended_at = null,
           suspended_until = null,
           updated_at = now()
     where id = _passenger_id
     returning * into v_after;
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    case when v_action = 'suspend' then 'admin.passenger.suspended' else 'admin.passenger.unsuspended' end,
    'passenger',
    _passenger_id::text,
    jsonb_build_object(
      'reason', v_reason,
      'before', jsonb_build_object(
        'suspended_at', v_before.suspended_at,
        'suspended_until', v_before.suspended_until,
        'blocked_at', v_before.blocked_at,
        'deleted_at', v_before.deleted_at
      ),
      'after', jsonb_build_object(
        'suspended_at', v_after.suspended_at,
        'suspended_until', v_after.suspended_until,
        'blocked_at', v_after.blocked_at,
        'deleted_at', v_after.deleted_at
      )
    )
  );

  return jsonb_build_object(
    'id', v_after.id,
    'suspended_at', v_after.suspended_at,
    'suspended_until', v_after.suspended_until,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.admin_set_passenger_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_passenger_status(uuid, text, text) to authenticated;

create or replace function public.apois_enforce_passenger_operational_status_gate()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  v_user public.users%rowtype;
begin
  select * into v_user
  from public.users
  where id = new.passenger_id;

  if not found then
    raise exception 'passenger_not_found' using errcode = 'P0002';
  end if;

  if v_user.deleted_at is not null then
    raise exception 'passenger_account_deleted' using errcode = '42501';
  end if;

  if v_user.suspended_at is not null
     and (v_user.suspended_until is null or v_user.suspended_until > now()) then
    raise exception 'passenger_account_suspended' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.apois_enforce_passenger_operational_status_gate() from public, anon, authenticated;

drop trigger if exists trg_apois_enforce_passenger_operational_status_gate on public.rides;
create trigger trg_apois_enforce_passenger_operational_status_gate
before insert or update of passenger_id on public.rides
for each row execute function public.apois_enforce_passenger_operational_status_gate();
