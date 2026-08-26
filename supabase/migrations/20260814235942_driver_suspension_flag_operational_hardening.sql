create or replace function apois_rpc_private.admin_set_driver_suspension(
  _driver_id uuid,
  _suspended boolean,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_before public.drivers%rowtype;
  v_after public.drivers%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  if not private.has_permission('users.manage') then
    raise exception 'forbidden' using errcode='42501';
  end if;

  select * into v_before from public.drivers where id=_driver_id for update;
  if not found then raise exception 'driver_not_found' using errcode='P0002'; end if;

  if _suspended then
    if v_before.approval_status <> 'aprovado' and v_before.suspended_at is null then
      raise exception 'invalid_driver_suspension_state' using errcode='55000';
    end if;

    update public.drivers
    set suspended_at=coalesce(suspended_at,now()),
        is_online=false,
        updated_at=now()
    where id=_driver_id
    returning * into v_after;
  else
    if v_before.suspended_at is null then
      raise exception 'driver_not_suspended' using errcode='55000';
    end if;

    if v_before.approval_status='aprovado' and not private.driver_kyc_is_ready(_driver_id) then
      raise exception 'driver_kyc_incomplete' using errcode='55000';
    end if;

    update public.drivers
    set suspended_at=null,
        is_online=false,
        updated_at=now()
    where id=_driver_id
    returning * into v_after;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    v_auth_user_id,
    'admin.driver.suspension_changed',
    'driver',
    _driver_id::text,
    jsonb_build_object(
      'suspended',_suspended,
      'reason',nullif(left(btrim(coalesce(_reason,'')),500),''),
      'approval_status',v_after.approval_status,
      'previous_suspended_at',v_before.suspended_at,
      'new_suspended_at',v_after.suspended_at
    )
  );

  return jsonb_build_object(
    'id',v_after.id,
    'approval_status',v_after.approval_status,
    'suspended_at',v_after.suspended_at,
    'is_online',v_after.is_online,
    'reason',nullif(left(btrim(coalesce(_reason,'')),500),'')
  );
end;
$$;

create or replace function private.enforce_driver_operational_stage_transition()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare v_driver public.drivers%rowtype;
begin
  if new.status is not distinct from old.status or new.status not in ('motorista_a_caminho','motorista_chegou','em_viagem') then return new; end if;
  if new.driver_id is null then raise exception 'driver_required_for_ride_stage' using errcode='55000'; end if;
  select * into v_driver from public.drivers d where d.id=new.driver_id;
  if not found then raise exception 'driver_profile_missing' using errcode='55000'; end if;
  if v_driver.approval_status <> 'aprovado' then raise exception 'driver_not_approved' using errcode='55000'; end if;
  if v_driver.suspended_at is not null then raise exception 'driver_suspended' using errcode='55000'; end if;
  if not private.driver_subscription_allows_rides(v_driver.subscription_status) then raise exception 'driver_subscription_inactive' using errcode='55000'; end if;
  if v_driver.is_online is not true then raise exception 'driver_offline' using errcode='55000'; end if;
  return new;
end;
$$;

create or replace function apois_rpc_private.driver_set_presence(
  _online boolean,
  _lat numeric default null,
  _lng numeric default null,
  _heading numeric default null,
  _speed numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_profile_id uuid; v_driver public.drivers%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  v_profile_id:=public.mobility_user_id();
  if v_profile_id is null then raise exception 'profile_missing'; end if;
  select * into v_driver from public.drivers where user_id=v_profile_id for update;
  if not found then raise exception 'driver_profile_missing'; end if;
  if coalesce(_online,false) then
    if v_driver.approval_status<>'aprovado' then raise exception 'driver_not_approved'; end if;
    if v_driver.suspended_at is not null then raise exception 'driver_suspended'; end if;
    if not private.driver_subscription_allows_rides(v_driver.subscription_status) then raise exception 'driver_subscription_inactive'; end if;
    if not coalesce(v_driver.is_online,false) and not private.driver_kyc_is_ready(v_driver.id) then raise exception 'driver_kyc_incomplete' using errcode='42501'; end if;
    if _lat is null or _lng is null or _lat < -90 or _lat > 90 or _lng < -180 or _lng > 180 then raise exception 'invalid_location'; end if;
  end if;
  update public.drivers
  set is_online=coalesce(_online,false),
      current_lat=case when coalesce(_online,false) then _lat else current_lat end,
      current_lng=case when coalesce(_online,false) then _lng else current_lng end,
      current_heading=case when coalesce(_online,false) then _heading else current_heading end,
      current_speed=case when coalesce(_online,false) then _speed else current_speed end,
      last_location_at=case when coalesce(_online,false) then now() else last_location_at end,
      updated_at=now()
  where id=v_driver.id
  returning * into v_driver;
  return to_jsonb(v_driver);
end;
$$;
