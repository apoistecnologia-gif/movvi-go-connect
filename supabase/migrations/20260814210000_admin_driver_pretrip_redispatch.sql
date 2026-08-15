-- APOIS Corridas — segurança administrativa do motorista.
--
-- Quando um admin bloqueia/reprova/devolve para análise ou suspende um
-- motorista, somente corridas ainda não iniciadas são liberadas para novo
-- dispatch. Corridas em `em_viagem` permanecem com o motorista atual.

create or replace function private.release_driver_pretrip_rides_for_redispatch(
  _driver_id uuid,
  _reason text default null
)
returns uuid[]
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_driver public.drivers%rowtype;
  v_profile_id uuid;
  v_released_ids uuid[] := '{}'::uuid[];
begin
  select * into v_driver
  from public.drivers
  where id = _driver_id;

  if not found then
    raise exception 'driver_not_found' using errcode = 'P0002';
  end if;

  v_profile_id := v_driver.user_id;

  with released as (
    update public.rides r
    set
      status = 'procurar_motorista',
      driver_id = null,
      accepted_driver_id = null,
      accepted_at = null,
      driver_arrived_at = null,
      started_at = null,
      queued_after_ride_id = null,
      queued_at = null,
      current_offer_driver_id = null,
      driver_name = null,
      driver_photo = null,
      driver_phone = null,
      driver_vehicle_model = null,
      driver_vehicle_color = null,
      driver_vehicle_plate = null,
      driver_rating = null,
      driver_latitude = null,
      driver_longitude = null,
      driver_heading = null,
      security_code = null,
      security_code_failed_attempts = 0,
      security_code_locked_until = null,
      security_code_last_failed_at = null,
      candidate_driver_ids = array_remove(coalesce(r.candidate_driver_ids, '{}'::uuid[]), v_profile_id),
      offered_driver_ids = '{}'::uuid[],
      rejected_driver_ids = case
        when v_profile_id = any(coalesce(r.rejected_driver_ids, '{}'::uuid[]))
          then coalesce(r.rejected_driver_ids, '{}'::uuid[])
        else array_append(coalesce(r.rejected_driver_ids, '{}'::uuid[]), v_profile_id)
      end,
      request_expires_at = null,
      search_expires_at = now() + interval '8 minutes',
      cancellation_reason = null,
      cancelled_by = null,
      cancelled_at = null,
      updated_at = now()
    where r.driver_id = _driver_id
      and (
        r.status in ('motorista_a_caminho', 'motorista_chegou')
        or (
          r.status = 'procurar_motorista'
          and r.queued_after_ride_id is not null
        )
      )
    returning r.id
  )
  select coalesce(array_agg(id), '{}'::uuid[])
  into v_released_ids
  from released;

  return v_released_ids;
end;
$$;

revoke all on function private.release_driver_pretrip_rides_for_redispatch(uuid, text) from public;

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

create or replace function public.admin_set_driver_operational_status(
  _driver_id uuid,
  _action text,
  _status text default null,
  _suspended boolean default null,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_action text := lower(btrim(coalesce(_action, '')));
  v_status text := lower(btrim(coalesce(_status, '')));
  v_result jsonb;
  v_released_ids uuid[] := '{}'::uuid[];
begin
  if v_auth_user_id is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if not private.has_permission('users.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_action = 'approval' then
    if v_status not in ('em_analise', 'aprovado', 'reprovado', 'bloqueado') then
      raise exception 'invalid_status' using errcode = '22023';
    end if;

    v_result := public.admin_set_driver_approval(
      _driver_id,
      v_status,
      nullif(left(btrim(coalesce(_reason, '')), 500), '')
    );

    if v_status <> 'aprovado' then
      v_released_ids := private.release_driver_pretrip_rides_for_redispatch(
        _driver_id,
        nullif(left(btrim(coalesce(_reason, '')), 500), '')
      );
    end if;
  elsif v_action = 'suspension' then
    if _suspended is null then
      raise exception 'suspended_flag_required' using errcode = '22023';
    end if;

    v_result := public.admin_set_driver_suspension(
      _driver_id,
      _suspended,
      nullif(left(btrim(coalesce(_reason, '')), 500), '')
    );

    if _suspended then
      v_released_ids := private.release_driver_pretrip_rides_for_redispatch(
        _driver_id,
        nullif(left(btrim(coalesce(_reason, '')), 500), '')
      );
    end if;
  else
    raise exception 'invalid_admin_driver_action' using errcode = '22023';
  end if;

  if cardinality(v_released_ids) > 0 then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    select
      v_auth_user_id,
      'admin.ride_released_for_redispatch',
      'ride',
      ride_id::text,
      jsonb_build_object(
        'driver_id', _driver_id,
        'admin_action', v_action,
        'driver_status', nullif(v_status, ''),
        'suspended', _suspended,
        'reason', nullif(left(btrim(coalesce(_reason, '')), 500), '')
      )
    from unnest(v_released_ids) as ride_id;
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'redispatch_ride_ids', to_jsonb(v_released_ids),
    'released_count', cardinality(v_released_ids)
  );
end;
$$;

revoke all on function public.admin_set_driver_operational_status(uuid, text, text, boolean, text) from public, anon;
grant execute on function public.admin_set_driver_operational_status(uuid, text, text, boolean, text) to authenticated;

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

create or replace function apois_rpc_private.driver_accept_ride_candidate_legacy(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $$
declare v_profile_id uuid; v_driver public.drivers%rowtype; v_ride public.rides%rowtype; v_current public.rides%rowtype; v_radius_km numeric:=5; v_distance_km numeric; v_public_driver_name text;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  v_profile_id:=public.mobility_user_id();
  select * into v_driver from public.drivers where user_id=v_profile_id for update;
  if not found then raise exception 'driver_profile_missing'; end if;
  if v_driver.approval_status<>'aprovado' then raise exception 'driver_not_approved'; end if;
  if v_driver.suspended_at is not null then raise exception 'driver_suspended'; end if;
  if not private.driver_subscription_allows_rides(v_driver.subscription_status) then raise exception 'driver_subscription_inactive'; end if;
  if not v_driver.is_online then raise exception 'driver_offline'; end if;
  v_public_driver_name:=nullif(split_part(trim(coalesce(v_driver.name,'')),' ',1),'');
  select * into v_ride from public.rides where id=_ride_id for update;
  if not found or v_ride.status<>'procurar_motorista' or v_ride.driver_id is not null or not (v_profile_id=any(coalesce(v_ride.candidate_driver_ids,'{}'::uuid[]))) or (v_profile_id=any(coalesce(v_ride.rejected_driver_ids,'{}'::uuid[]))) or (v_ride.request_expires_at is not null and v_ride.request_expires_at<=now()) then raise exception 'ride_offer_unavailable'; end if;
  select * into v_current from public.rides where driver_id=v_driver.id and status in ('motorista_a_caminho','motorista_chegou','em_viagem') and id<>_ride_id order by created_at desc limit 1 for update;
  if found and v_current.status in ('motorista_a_caminho','motorista_chegou') then raise exception 'driver_busy'; end if;
  if found and v_current.status='em_viagem' then
    if exists(select 1 from public.rides q where q.driver_id=v_driver.id and q.status='procurar_motorista' and q.queued_after_ride_id is not null and q.id<>_ride_id) then raise exception 'next_ride_already_reserved'; end if;
    if v_current.destination_lat is null or v_current.destination_lng is null or v_ride.origin_lat is null or v_ride.origin_lng is null then raise exception 'next_ride_location_unavailable'; end if;
    begin select coalesce((value #>> '{}')::numeric,5) into v_radius_km from public.app_settings where key='ride.next_offer_max_distance_km'; exception when others then v_radius_km:=5; end;
    v_radius_km:=greatest(0.5,least(coalesce(v_radius_km,5),20));
    v_distance_km:=6371*acos(least(1,greatest(-1,cos(radians(v_ride.origin_lat::double precision))*cos(radians(v_current.destination_lat::double precision))*cos(radians(v_current.destination_lng::double precision)-radians(v_ride.origin_lng::double precision))+sin(radians(v_ride.origin_lat::double precision))*sin(radians(v_current.destination_lat::double precision)))));
    if v_distance_km>v_radius_km then raise exception 'next_ride_not_nearby'; end if;
    update public.rides set driver_id=v_driver.id,accepted_driver_id=v_driver.id,queued_after_ride_id=v_current.id,queued_at=now(),request_expires_at=null,search_expires_at=null,current_offer_driver_id=null,driver_name=v_public_driver_name,driver_photo=v_driver.photo_url,driver_phone=v_driver.phone,driver_vehicle_model=v_driver.vehicle_model,driver_vehicle_color=v_driver.vehicle_color,driver_vehicle_plate=v_driver.vehicle_plate,driver_rating=v_driver.rating,cancellation_reason=null,cancelled_by=null,cancelled_at=null,updated_at=now() where id=_ride_id and status='procurar_motorista' and driver_id is null returning * into v_ride;
    if not found then raise exception 'ride_offer_unavailable'; end if;
    return to_jsonb(v_ride);
  end if;
  update public.rides set status='motorista_a_caminho',driver_id=v_driver.id,accepted_driver_id=v_driver.id,accepted_at=now(),current_offer_driver_id=null,request_expires_at=null,search_expires_at=null,security_code=coalesce(security_code,lpad((floor(random()*10000))::int::text,4,'0')),driver_name=v_public_driver_name,driver_photo=v_driver.photo_url,driver_phone=v_driver.phone,driver_vehicle_model=v_driver.vehicle_model,driver_vehicle_color=v_driver.vehicle_color,driver_vehicle_plate=v_driver.vehicle_plate,driver_rating=v_driver.rating,driver_latitude=v_driver.current_lat,driver_longitude=v_driver.current_lng,driver_heading=v_driver.current_heading,cancellation_reason=null,cancelled_by=null,cancelled_at=null,updated_at=now() where id=_ride_id and status='procurar_motorista' and driver_id is null returning * into v_ride;
  if not found then raise exception 'ride_offer_unavailable'; end if;
  return to_jsonb(v_ride);
end;
$$;
