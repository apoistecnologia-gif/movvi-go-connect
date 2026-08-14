-- APOIS Corridas: a driver may only classify the passenger as a no-show after
-- actually reaching the pickup and waiting the configured grace period.
-- Default keeps the existing two-minute tolerance while remaining configurable.

insert into public.app_settings(key,value)
values ('ride.driver_no_show_wait_minutes','2'::jsonb)
on conflict(key) do nothing;

create or replace function apois_rpc_private.driver_cancel_ride(
  _ride_id uuid,
  _reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','apois_rpc_private'
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_ride public.rides%rowtype;
  v_reason text;
  v_reason_norm text;
  v_is_no_show boolean := false;
  v_no_show_wait_minutes numeric := 2;
begin
  if v_auth_user_id is null then raise exception 'unauthorized' using errcode='42501'; end if;
  v_profile_id := public.mobility_user_id();
  if v_profile_id is null then raise exception 'unauthorized' using errcode='42501'; end if;

  select * into v_driver
  from public.drivers
  where user_id=v_profile_id
  for update;
  if not found then raise exception 'driver_profile_missing'; end if;

  v_reason := left(trim(coalesce(_reason,'')),500);
  if length(v_reason)<3 then raise exception 'driver_cancel_reason_required'; end if;
  v_reason_norm := lower(v_reason);
  v_is_no_show :=
    v_reason_norm like '%não apareceu%'
    or v_reason_norm like '%nao apareceu%'
    or v_reason_norm like '%não compareceu%'
    or v_reason_norm like '%nao compareceu%'
    or v_reason_norm like '%no-show%'
    or v_reason_norm like '%no show%';

  select * into v_ride
  from public.rides
  where id=_ride_id
  for update;

  if not found
     or v_ride.driver_id<>v_driver.id
     or v_ride.status not in ('motorista_a_caminho','motorista_chegou') then
    raise exception 'invalid_ride_transition';
  end if;

  if v_is_no_show then
    if v_ride.status<>'motorista_chegou' or v_ride.driver_arrived_at is null then
      raise exception 'no_show_requires_driver_arrival' using errcode='55000';
    end if;

    begin
      select greatest(0,least(coalesce((value #>> '{}')::numeric,2),30))
        into v_no_show_wait_minutes
      from public.app_settings
      where key='ride.driver_no_show_wait_minutes';
    exception when others then
      v_no_show_wait_minutes := 2;
    end;

    if now() < v_ride.driver_arrived_at + make_interval(secs => ceil(v_no_show_wait_minutes*60)::integer) then
      raise exception 'driver_no_show_wait_not_elapsed' using errcode='55000';
    end if;

    update public.rides
    set status='cancelada_motorista',
        cancellation_reason=v_reason,
        cancelled_by='driver',
        cancelled_at=now(),
        updated_at=now()
    where id=_ride_id
    returning * into v_ride;

    insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values(
      v_auth_user_id,
      'ride.driver_no_show_cancelled',
      'ride',
      _ride_id::text,
      jsonb_build_object(
        'driver_id',v_driver.id,
        'driver_domain_user_id',v_profile_id,
        'payment_method',v_ride.payment_method,
        'payment_status',v_ride.payment_status,
        'reason',v_reason,
        'wait_minutes',v_no_show_wait_minutes,
        'arrived_at',v_ride.driver_arrived_at
      )
    );
    return to_jsonb(v_ride);
  end if;

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
      cancellation_reason=v_reason,
      cancelled_by='driver',
      cancelled_at=now(),
      updated_at=now()
  where id=_ride_id
  returning * into v_ride;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_auth_user_id,'ride.driver_cancelled_for_redispatch','ride',_ride_id::text,
    jsonb_build_object('driver_id',v_driver.id,'driver_domain_user_id',v_profile_id,'reason',v_reason,'new_status',v_ride.status));

  return to_jsonb(v_ride);
end;
$function$;
