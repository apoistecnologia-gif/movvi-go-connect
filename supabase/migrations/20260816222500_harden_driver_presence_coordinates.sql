-- APOIS Corridas: o servidor é a autoridade da presença do motorista.
-- Evita transformar coordenadas globais/0,0 em GPS "recente" elegível para dispatch.
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
as $function$
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

    -- Operação APOIS Corridas é nacional/Brasil. Não aceite 0,0 ou GPS de outro
    -- país como presença válida: dispatch usa last_location_at como freshness.
    if _lat is null or _lng is null
       or _lat::text = 'NaN' or _lng::text = 'NaN'
       or _lat < -34 or _lat > 6
       or _lng < -74 or _lng > -32 then
      raise exception 'invalid_location';
    end if;

    if _heading is not null and (
      _heading::text = 'NaN' or _heading < 0 or _heading >= 360
    ) then
      raise exception 'invalid_heading';
    end if;

    if _speed is not null and (
      _speed::text = 'NaN' or _speed < 0
    ) then
      raise exception 'invalid_speed';
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
$function$;
