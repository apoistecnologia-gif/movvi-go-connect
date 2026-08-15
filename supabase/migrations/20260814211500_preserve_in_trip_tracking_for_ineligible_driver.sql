-- APOIS Corridas — preservar segurança da viagem em andamento.
--
-- Um motorista que se torne inelegível durante `em_viagem` continua podendo
-- enviar telemetria até finalizar a corrida atual, mas permanece offline e não
-- recebe/aceita novas corridas. Fora de uma viagem ativa, o bloqueio continua
-- imediato.

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
declare
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_active_in_trip boolean := false;
  v_operationally_eligible boolean := false;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;

  v_profile_id := public.mobility_user_id();
  if v_profile_id is null then raise exception 'profile_missing'; end if;

  select * into v_driver
  from public.drivers
  where user_id = v_profile_id
  for update;
  if not found then raise exception 'driver_profile_missing'; end if;

  select exists(
    select 1
    from public.rides r
    where r.driver_id = v_driver.id
      and r.status = 'em_viagem'
  ) into v_active_in_trip;

  v_operationally_eligible :=
    v_driver.approval_status = 'aprovado'
    and v_driver.suspended_at is null
    and private.driver_subscription_allows_rides(v_driver.subscription_status);

  if coalesce(_online,false) then
    if not v_operationally_eligible and not v_active_in_trip then
      if v_driver.approval_status <> 'aprovado' then raise exception 'driver_not_approved'; end if;
      if v_driver.suspended_at is not null then raise exception 'driver_suspended'; end if;
      if not private.driver_subscription_allows_rides(v_driver.subscription_status) then raise exception 'driver_subscription_inactive'; end if;
      raise exception 'driver_not_eligible';
    end if;

    if v_operationally_eligible
       and not coalesce(v_driver.is_online,false)
       and not private.driver_kyc_is_ready(v_driver.id) then
      raise exception 'driver_kyc_incomplete' using errcode='42501';
    end if;

    if _lat is null or _lng is null or _lat < -90 or _lat > 90 or _lng < -180 or _lng > 180 then
      raise exception 'invalid_location';
    end if;
  end if;

  update public.drivers
  set is_online = case
        when coalesce(_online,false) and v_operationally_eligible then true
        else false
      end,
      current_lat = case when coalesce(_online,false) then _lat else current_lat end,
      current_lng = case when coalesce(_online,false) then _lng else current_lng end,
      current_heading = case when coalesce(_online,false) then _heading else current_heading end,
      current_speed = case when coalesce(_online,false) then _speed else current_speed end,
      last_location_at = case when coalesce(_online,false) then now() else last_location_at end,
      updated_at = now()
  where id = v_driver.id
  returning * into v_driver;

  return to_jsonb(v_driver) || jsonb_build_object(
    'tracking_active_ride', v_active_in_trip,
    'operationally_eligible', v_operationally_eligible
  );
end;
$$;

create or replace function apois_rpc_private.driver_finish_ride(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'apois_rpc_private'
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_ride public.rides%rowtype;
  v_next public.rides%rowtype;
  v_driver_eligible boolean := false;
begin
  if v_auth_user_id is null then raise exception 'unauthorized' using errcode='42501'; end if;

  v_profile_id := public.mobility_user_id();
  if v_profile_id is null then raise exception 'driver_profile_missing'; end if;

  select * into v_driver
  from public.drivers
  where user_id = v_profile_id
  for update;
  if not found then raise exception 'driver_profile_missing'; end if;

  update public.rides
  set status='finalizada',
      final_price=coalesce(final_price,estimated_price),
      completed_at=now(),
      updated_at=now()
  where id=_ride_id
    and driver_id=v_driver.id
    and status='em_viagem'
  returning * into v_ride;
  if not found then raise exception 'invalid_ride_transition'; end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    v_auth_user_id,
    'ride.driver_finished',
    'ride',
    v_ride.id::text,
    jsonb_build_object(
      'driver_id',v_driver.id,
      'driver_domain_user_id',v_profile_id,
      'final_price',v_ride.final_price
    )
  );

  select * into v_next
  from public.rides
  where driver_id=v_driver.id
    and accepted_driver_id=v_driver.id
    and queued_after_ride_id=_ride_id
    and status='procurar_motorista'
  order by queued_at asc nulls last,created_at asc
  limit 1
  for update;

  if found then
    v_driver_eligible :=
      v_driver.approval_status='aprovado'
      and v_driver.suspended_at is null
      and private.driver_subscription_allows_rides(v_driver.subscription_status)
      and v_driver.is_online is true;

    if v_driver_eligible then
      update public.rides
      set status='motorista_a_caminho',
          accepted_at=now(),
          queued_after_ride_id=null,
          request_expires_at=null,
          search_expires_at=null,
          security_code=coalesce(security_code,lpad((floor(random()*10000))::int::text,4,'0')),
          driver_latitude=v_driver.current_lat,
          driver_longitude=v_driver.current_lng,
          driver_heading=v_driver.current_heading,
          updated_at=now()
      where id=v_next.id;

      insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
      values(
        v_auth_user_id,
        'ride.queued_promoted',
        'ride',
        v_next.id::text,
        jsonb_build_object(
          'driver_id',v_driver.id,
          'driver_domain_user_id',v_profile_id,
          'previous_ride_id',_ride_id
        )
      );
    else
      update public.rides
      set status='procurar_motorista',
          driver_id=null,
          accepted_driver_id=null,
          accepted_at=null,
          driver_arrived_at=null,
          current_offer_driver_id=null,
          driver_name=null,
          driver_photo=null,
          driver_phone=null,
          driver_vehicle_model=null,
          driver_vehicle_color=null,
          driver_vehicle_plate=null,
          driver_rating=null,
          driver_latitude=null,
          driver_longitude=null,
          driver_heading=null,
          security_code=null,
          candidate_driver_ids=array_remove(coalesce(candidate_driver_ids,'{}'::uuid[]),v_profile_id),
          offered_driver_ids=array_remove(coalesce(offered_driver_ids,'{}'::uuid[]),v_profile_id),
          rejected_driver_ids=case
            when v_profile_id=any(coalesce(rejected_driver_ids,'{}'::uuid[])) then coalesce(rejected_driver_ids,'{}'::uuid[])
            else array_append(coalesce(rejected_driver_ids,'{}'::uuid[]),v_profile_id)
          end,
          request_expires_at=now(),
          search_expires_at=case
            when search_expires_at is null or search_expires_at<=now() then now()+interval '8 minutes'
            else search_expires_at
          end,
          queued_after_ride_id=null,
          queued_at=null,
          updated_at=now()
      where id=v_next.id;

      insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
      values(
        v_auth_user_id,
        'ride.queued_released_ineligible_driver',
        'ride',
        v_next.id::text,
        jsonb_build_object(
          'driver_id',v_driver.id,
          'driver_domain_user_id',v_profile_id,
          'previous_ride_id',_ride_id,
          'approval_status',v_driver.approval_status,
          'subscription_status',v_driver.subscription_status,
          'suspended_at',v_driver.suspended_at,
          'is_online',v_driver.is_online
        )
      );
    end if;
  end if;

  return to_jsonb(v_ride);
end;
$$;
