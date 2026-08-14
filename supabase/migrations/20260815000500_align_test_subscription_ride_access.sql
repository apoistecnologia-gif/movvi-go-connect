-- APOIS Corridas: `teste` is an explicit, admin-controlled homologation state.
-- The app and dispatch engine already treat it as ride-enabled, but presence,
-- acceptance and queued promotion still rejected it. Centralize the rule so an
-- explicitly granted test driver can complete the real homologation flow.

create or replace function private.driver_subscription_allows_rides(_status text)
returns boolean
language sql
immutable
security definer
set search_path to ''
as $function$
  select lower(coalesce(_status,'')) in ('active','ativa','teste');
$function$;

revoke all on function private.driver_subscription_allows_rides(text) from public,anon,authenticated;
grant execute on function private.driver_subscription_allows_rides(text) to postgres,service_role;

create or replace function apois_rpc_private.driver_set_presence(
  _online boolean,
  _lat numeric default null::numeric,
  _lng numeric default null::numeric,
  _heading numeric default null::numeric,
  _speed numeric default null::numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  v_profile_id := public.mobility_user_id();
  if v_profile_id is null then raise exception 'profile_missing'; end if;
  select * into v_driver from public.drivers where user_id=v_profile_id for update;
  if not found then raise exception 'driver_profile_missing'; end if;

  if coalesce(_online,false) then
    if v_driver.approval_status <> 'aprovado' then raise exception 'driver_not_approved'; end if;
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
$function$;

create or replace function apois_rpc_private.driver_accept_ride_candidate_legacy(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','extensions'
as $function$
declare
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_ride public.rides%rowtype;
  v_current public.rides%rowtype;
  v_radius_km numeric := 5;
  v_distance_km numeric;
  v_public_driver_name text;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;

  v_profile_id := public.mobility_user_id();
  select * into v_driver from public.drivers where user_id=v_profile_id for update;
  if not found then raise exception 'driver_profile_missing'; end if;
  if v_driver.approval_status <> 'aprovado' then raise exception 'driver_not_approved'; end if;
  if not private.driver_subscription_allows_rides(v_driver.subscription_status) then raise exception 'driver_subscription_inactive'; end if;
  if not v_driver.is_online then raise exception 'driver_offline'; end if;

  v_public_driver_name := nullif(split_part(trim(coalesce(v_driver.name,'')),' ',1),'');

  select * into v_ride from public.rides where id=_ride_id for update;
  if not found
     or v_ride.status <> 'procurar_motorista'
     or v_ride.driver_id is not null
     or not (v_profile_id=any(coalesce(v_ride.candidate_driver_ids,'{}'::uuid[])))
     or (v_profile_id=any(coalesce(v_ride.rejected_driver_ids,'{}'::uuid[])))
     or (v_ride.request_expires_at is not null and v_ride.request_expires_at<=now()) then
    raise exception 'ride_offer_unavailable';
  end if;

  select * into v_current
  from public.rides
  where driver_id=v_driver.id
    and status in ('motorista_a_caminho','motorista_chegou','em_viagem')
    and id<>_ride_id
  order by created_at desc
  limit 1
  for update;

  if found and v_current.status in ('motorista_a_caminho','motorista_chegou') then raise exception 'driver_busy'; end if;

  if found and v_current.status='em_viagem' then
    if exists(select 1 from public.rides q where q.driver_id=v_driver.id and q.status='procurar_motorista' and q.queued_after_ride_id is not null and q.id<>_ride_id) then
      raise exception 'next_ride_already_reserved';
    end if;
    if v_current.destination_lat is null or v_current.destination_lng is null or v_ride.origin_lat is null or v_ride.origin_lng is null then
      raise exception 'next_ride_location_unavailable';
    end if;
    begin
      select coalesce((value #>> '{}')::numeric,5) into v_radius_km
      from public.app_settings where key='ride.next_offer_max_distance_km';
    exception when others then v_radius_km := 5;
    end;
    v_radius_km := greatest(0.5,least(coalesce(v_radius_km,5),20));
    v_distance_km := 6371 * acos(least(1,greatest(-1,
      cos(radians(v_ride.origin_lat::double precision))
      * cos(radians(v_current.destination_lat::double precision))
      * cos(radians(v_current.destination_lng::double precision)-radians(v_ride.origin_lng::double precision))
      + sin(radians(v_ride.origin_lat::double precision))
      * sin(radians(v_current.destination_lat::double precision))
    )));
    if v_distance_km > v_radius_km then raise exception 'next_ride_not_nearby'; end if;

    update public.rides
    set driver_id=v_driver.id,accepted_driver_id=v_driver.id,queued_after_ride_id=v_current.id,queued_at=now(),
        request_expires_at=null,search_expires_at=null,current_offer_driver_id=null,
        driver_name=v_public_driver_name,driver_photo=v_driver.photo_url,driver_phone=v_driver.phone,
        driver_vehicle_model=v_driver.vehicle_model,driver_vehicle_color=v_driver.vehicle_color,
        driver_vehicle_plate=v_driver.vehicle_plate,driver_rating=v_driver.rating,
        cancellation_reason=null,cancelled_by=null,cancelled_at=null,updated_at=now()
    where id=_ride_id and status='procurar_motorista' and driver_id is null
    returning * into v_ride;
    if not found then raise exception 'ride_offer_unavailable'; end if;
    return to_jsonb(v_ride);
  end if;

  update public.rides
  set status='motorista_a_caminho',driver_id=v_driver.id,accepted_driver_id=v_driver.id,accepted_at=now(),
      current_offer_driver_id=null,request_expires_at=null,search_expires_at=null,
      security_code=coalesce(security_code,lpad((floor(random()*10000))::int::text,4,'0')),
      driver_name=v_public_driver_name,driver_photo=v_driver.photo_url,driver_phone=v_driver.phone,
      driver_vehicle_model=v_driver.vehicle_model,driver_vehicle_color=v_driver.vehicle_color,
      driver_vehicle_plate=v_driver.vehicle_plate,driver_rating=v_driver.rating,
      driver_latitude=v_driver.current_lat,driver_longitude=v_driver.current_lng,driver_heading=v_driver.current_heading,
      cancellation_reason=null,cancelled_by=null,cancelled_at=null,updated_at=now()
  where id=_ride_id and status='procurar_motorista' and driver_id is null
  returning * into v_ride;
  if not found then raise exception 'ride_offer_unavailable'; end if;
  return to_jsonb(v_ride);
end;
$function$;

create or replace function apois_rpc_private.driver_finish_ride(_ride_id uuid)
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
  v_next public.rides%rowtype;
  v_driver_eligible boolean := false;
begin
  if v_auth_user_id is null then raise exception 'unauthorized' using errcode='42501'; end if;
  v_profile_id := public.mobility_user_id();
  if v_profile_id is null then raise exception 'driver_profile_missing'; end if;
  select * into v_driver from public.drivers where user_id=v_profile_id for update;
  if not found then raise exception 'driver_profile_missing'; end if;

  update public.rides
  set status='finalizada',final_price=coalesce(final_price,estimated_price),completed_at=now(),updated_at=now()
  where id=_ride_id and driver_id=v_driver.id and status='em_viagem'
  returning * into v_ride;
  if not found then raise exception 'invalid_ride_transition'; end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_auth_user_id,'ride.driver_finished','ride',v_ride.id::text,
    jsonb_build_object('driver_id',v_driver.id,'driver_domain_user_id',v_profile_id,'final_price',v_ride.final_price));

  select * into v_next
  from public.rides
  where driver_id=v_driver.id and accepted_driver_id=v_driver.id and queued_after_ride_id=_ride_id and status='procurar_motorista'
  order by queued_at asc nulls last,created_at asc
  limit 1
  for update;

  if found then
    v_driver_eligible := v_driver.approval_status='aprovado'
      and private.driver_subscription_allows_rides(v_driver.subscription_status)
      and v_driver.is_online is true;

    if v_driver_eligible then
      update public.rides
      set status='motorista_a_caminho',accepted_at=now(),queued_after_ride_id=null,
          request_expires_at=null,search_expires_at=null,
          security_code=coalesce(security_code,lpad((floor(random()*10000))::int::text,4,'0')),
          driver_latitude=v_driver.current_lat,driver_longitude=v_driver.current_lng,
          driver_heading=v_driver.current_heading,updated_at=now()
      where id=v_next.id;
      insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
      values(v_auth_user_id,'ride.queued_promoted','ride',v_next.id::text,
        jsonb_build_object('driver_id',v_driver.id,'driver_domain_user_id',v_profile_id,'previous_ride_id',_ride_id));
    else
      update public.rides
      set status='procurar_motorista',driver_id=null,accepted_driver_id=null,accepted_at=null,driver_arrived_at=null,
          current_offer_driver_id=null,driver_name=null,driver_photo=null,driver_phone=null,
          driver_vehicle_model=null,driver_vehicle_color=null,driver_vehicle_plate=null,driver_rating=null,
          driver_latitude=null,driver_longitude=null,driver_heading=null,security_code=null,
          candidate_driver_ids=array_remove(coalesce(candidate_driver_ids,'{}'::uuid[]),v_profile_id),
          offered_driver_ids=array_remove(coalesce(offered_driver_ids,'{}'::uuid[]),v_profile_id),
          rejected_driver_ids=case when v_profile_id=any(coalesce(rejected_driver_ids,'{}'::uuid[]))
            then coalesce(rejected_driver_ids,'{}'::uuid[])
            else array_append(coalesce(rejected_driver_ids,'{}'::uuid[]),v_profile_id) end,
          request_expires_at=now(),
          search_expires_at=case when search_expires_at is null or search_expires_at<=now() then now()+interval '8 minutes' else search_expires_at end,
          queued_after_ride_id=null,queued_at=null,updated_at=now()
      where id=v_next.id;
      insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
      values(v_auth_user_id,'ride.queued_released_ineligible_driver','ride',v_next.id::text,
        jsonb_build_object('driver_id',v_driver.id,'driver_domain_user_id',v_profile_id,'previous_ride_id',_ride_id,
          'approval_status',v_driver.approval_status,'subscription_status',v_driver.subscription_status,'is_online',v_driver.is_online));
    end if;
  end if;

  return to_jsonb(v_ride);
end;
$function$;

create or replace function public.append_nearby_busy_driver_candidates()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_radius_km numeric := 5;
  v_extra uuid[] := '{}'::uuid[];
begin
  if new.status <> 'procurar_motorista' or new.driver_id is not null or new.origin_lat is null or new.origin_lng is null then return new; end if;
  begin
    select coalesce((value #>> '{}')::numeric,5) into v_radius_km from public.app_settings where key='ride.next_offer_max_distance_km';
  exception when others then v_radius_km := 5;
  end;
  v_radius_km := greatest(0.5,least(coalesce(v_radius_km,5),20));

  select coalesce(array_agg(x.user_id),'{}'::uuid[]) into v_extra
  from (
    select d.user_id
    from public.drivers d
    where d.is_online=true
      and d.approval_status='aprovado'
      and private.driver_subscription_allows_rides(d.subscription_status)
      and d.category=new.category
      and d.current_lat is not null and d.current_lng is not null
      and d.last_location_at is not null and d.last_location_at>=now()-interval '120 seconds'
      and not (d.user_id=any(coalesce(new.rejected_driver_ids,'{}'::uuid[])))
      and exists(select 1 from public.rides current_ride where current_ride.driver_id=d.id and current_ride.status='em_viagem')
      and not exists(select 1 from public.rides queued_ride where queued_ride.driver_id=d.id and queued_ride.status='procurar_motorista' and queued_ride.queued_after_ride_id is not null)
      and (6371*acos(least(1,greatest(-1,
        cos(radians(new.origin_lat::double precision))*cos(radians(d.current_lat::double precision))
        *cos(radians(d.current_lng::double precision)-radians(new.origin_lng::double precision))
        +sin(radians(new.origin_lat::double precision))*sin(radians(d.current_lat::double precision))
      ))))<=v_radius_km
    order by (6371*acos(least(1,greatest(-1,
      cos(radians(new.origin_lat::double precision))*cos(radians(d.current_lat::double precision))
      *cos(radians(d.current_lng::double precision)-radians(new.origin_lng::double precision))
      +sin(radians(new.origin_lat::double precision))*sin(radians(d.current_lat::double precision))
    )))) asc
    limit 5
  ) x;

  if cardinality(v_extra)>0 then
    select coalesce(array_agg(distinct candidate_id),'{}'::uuid[]) into new.candidate_driver_ids
    from unnest(coalesce(new.candidate_driver_ids,'{}'::uuid[])||v_extra) candidate_id;
    select coalesce(array_agg(distinct offered_id),'{}'::uuid[]) into new.offered_driver_ids
    from unnest(coalesce(new.offered_driver_ids,'{}'::uuid[])||v_extra) offered_id;
  end if;
  return new;
end;
$function$;
