-- APOIS: permite ao motorista em viagem reservar uma próxima corrida próxima,
-- sem criar duas corridas operacionais ativas ao mesmo tempo.
alter table public.rides
  add column if not exists queued_after_ride_id uuid references public.rides(id) on delete set null,
  add column if not exists queued_at timestamptz;

insert into public.app_settings(key, value, description, updated_at)
values ('ride.next_offer_max_distance_km','5'::jsonb,'Distância máxima em km para oferecer uma próxima corrida a motorista que já está em viagem.',now())
on conflict (key) do nothing;

create unique index if not exists rides_one_queued_per_driver_idx
  on public.rides(driver_id)
  where queued_after_ride_id is not null and status='procurar_motorista' and driver_id is not null;
create index if not exists rides_queued_after_idx
  on public.rides(queued_after_ride_id, queued_at)
  where queued_after_ride_id is not null;

create or replace function public.append_nearby_busy_driver_candidates()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_radius_km numeric := 5; v_extra uuid[] := '{}'::uuid[];
begin
  if new.status <> 'procurar_motorista' or new.driver_id is not null or new.origin_lat is null or new.origin_lng is null then return new; end if;
  begin
    select coalesce((value #>> '{}')::numeric,5) into v_radius_km from public.app_settings where key='ride.next_offer_max_distance_km';
  exception when others then v_radius_km := 5; end;
  v_radius_km := greatest(0.5,least(coalesce(v_radius_km,5),20));

  select coalesce(array_agg(x.user_id),'{}'::uuid[]) into v_extra
  from (
    select d.user_id
    from public.drivers d
    where d.is_online=true
      and d.approval_status='aprovado'
      and lower(coalesce(d.subscription_status,'')) in ('active','ativa','teste')
      and d.category=new.category
      and d.current_lat is not null and d.current_lng is not null
      and d.last_location_at >= now()-interval '120 seconds'
      and not (d.user_id=any(coalesce(new.rejected_driver_ids,'{}'::uuid[])))
      and exists (select 1 from public.rides current_ride where current_ride.driver_id=d.id and current_ride.status='em_viagem')
      and not exists (select 1 from public.rides queued_ride where queued_ride.driver_id=d.id and queued_ride.status='procurar_motorista' and queued_ride.queued_after_ride_id is not null)
      and 6371*acos(least(1,greatest(-1,
        cos(radians(new.origin_lat::double precision))*cos(radians(d.current_lat::double precision))*cos(radians(d.current_lng::double precision)-radians(new.origin_lng::double precision))
        + sin(radians(new.origin_lat::double precision))*sin(radians(d.current_lat::double precision))
      ))) <= v_radius_km
    order by 6371*acos(least(1,greatest(-1,
      cos(radians(new.origin_lat::double precision))*cos(radians(d.current_lat::double precision))*cos(radians(d.current_lng::double precision)-radians(new.origin_lng::double precision))
      + sin(radians(new.origin_lat::double precision))*sin(radians(d.current_lat::double precision))
    ))) asc
    limit 5
  ) x;

  if cardinality(v_extra)>0 then
    select coalesce(array_agg(distinct candidate_id),'{}'::uuid[]) into new.candidate_driver_ids
    from unnest(coalesce(new.candidate_driver_ids,'{}'::uuid[]) || v_extra) candidate_id;
    select coalesce(array_agg(distinct offered_id),'{}'::uuid[]) into new.offered_driver_ids
    from unnest(coalesce(new.offered_driver_ids,'{}'::uuid[]) || v_extra) offered_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists rides_append_nearby_busy_candidates on public.rides;
create trigger rides_append_nearby_busy_candidates before update of candidate_driver_ids on public.rides
for each row execute function public.append_nearby_busy_driver_candidates();

create or replace function public.driver_accept_ride(_ride_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_profile_id uuid; v_driver public.drivers%rowtype; v_ride public.rides%rowtype; v_current public.rides%rowtype;
  v_radius_km numeric := 5; v_distance_km numeric;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  v_profile_id := public.mobility_user_id();
  select * into v_driver from public.drivers where user_id=v_profile_id for update;
  if not found then raise exception 'driver_profile_missing'; end if;
  if v_driver.approval_status <> 'aprovado' then raise exception 'driver_not_approved'; end if;
  if lower(coalesce(v_driver.subscription_status,'')) not in ('active','ativa','teste') then raise exception 'driver_subscription_inactive'; end if;
  if not v_driver.is_online then raise exception 'driver_offline'; end if;

  select * into v_ride from public.rides where id=_ride_id for update;
  if not found or v_ride.status<>'procurar_motorista' or v_ride.driver_id is not null
     or not (v_profile_id=any(coalesce(v_ride.candidate_driver_ids,'{}'::uuid[])))
     or (v_profile_id=any(coalesce(v_ride.rejected_driver_ids,'{}'::uuid[])))
     or (v_ride.request_expires_at is not null and v_ride.request_expires_at<=now()) then raise exception 'ride_offer_unavailable'; end if;

  select * into v_current from public.rides
  where driver_id=v_driver.id and status in ('motorista_a_caminho','motorista_chegou','em_viagem') and id<>_ride_id
  order by created_at desc limit 1 for update;

  if found and v_current.status in ('motorista_a_caminho','motorista_chegou') then raise exception 'driver_busy'; end if;

  if found and v_current.status='em_viagem' then
    if exists(select 1 from public.rides q where q.driver_id=v_driver.id and q.status='procurar_motorista' and q.queued_after_ride_id is not null and q.id<>_ride_id) then raise exception 'next_ride_already_reserved'; end if;
    if v_driver.current_lat is null or v_driver.current_lng is null or v_ride.origin_lat is null or v_ride.origin_lng is null then raise exception 'next_ride_location_unavailable'; end if;
    begin select coalesce((value #>> '{}')::numeric,5) into v_radius_km from public.app_settings where key='ride.next_offer_max_distance_km'; exception when others then v_radius_km:=5; end;
    v_radius_km:=greatest(0.5,least(coalesce(v_radius_km,5),20));
    v_distance_km:=6371*acos(least(1,greatest(-1,
      cos(radians(v_ride.origin_lat::double precision))*cos(radians(v_driver.current_lat::double precision))*cos(radians(v_driver.current_lng::double precision)-radians(v_ride.origin_lng::double precision))
      + sin(radians(v_ride.origin_lat::double precision))*sin(radians(v_driver.current_lat::double precision))
    )));
    if v_distance_km>v_radius_km then raise exception 'next_ride_not_nearby'; end if;

    update public.rides set driver_id=v_driver.id,accepted_driver_id=v_driver.id,queued_after_ride_id=v_current.id,queued_at=now(),request_expires_at=null,search_expires_at=null,current_offer_driver_id=null,
      driver_name=v_driver.name,driver_photo=v_driver.photo_url,driver_phone=v_driver.phone,driver_vehicle_model=v_driver.vehicle_model,driver_vehicle_color=v_driver.vehicle_color,driver_vehicle_plate=v_driver.vehicle_plate,driver_rating=v_driver.rating,updated_at=now()
    where id=_ride_id and status='procurar_motorista' and driver_id is null returning * into v_ride;
    if not found then raise exception 'ride_offer_unavailable'; end if;
    return to_jsonb(v_ride);
  end if;

  update public.rides set status='motorista_a_caminho',driver_id=v_driver.id,accepted_driver_id=v_driver.id,accepted_at=now(),current_offer_driver_id=null,request_expires_at=null,search_expires_at=null,
    security_code=coalesce(security_code,lpad((floor(random()*10000))::int::text,4,'0')),driver_name=v_driver.name,driver_photo=v_driver.photo_url,driver_phone=v_driver.phone,
    driver_vehicle_model=v_driver.vehicle_model,driver_vehicle_color=v_driver.vehicle_color,driver_vehicle_plate=v_driver.vehicle_plate,driver_rating=v_driver.rating,
    driver_latitude=v_driver.current_lat,driver_longitude=v_driver.current_lng,driver_heading=v_driver.current_heading,updated_at=now()
  where id=_ride_id and status='procurar_motorista' and driver_id is null returning * into v_ride;
  if not found then raise exception 'ride_offer_unavailable'; end if;
  return to_jsonb(v_ride);
end;
$function$;

create or replace function public.driver_finish_ride(_ride_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_driver public.drivers%rowtype; v_ride public.rides%rowtype; v_next public.rides%rowtype;
begin
  select * into v_driver from public.drivers where user_id=public.mobility_user_id() for update;
  if not found then raise exception 'driver_profile_missing'; end if;
  update public.rides set status='finalizada',final_price=coalesce(final_price,estimated_price),completed_at=now(),updated_at=now()
  where id=_ride_id and driver_id=v_driver.id and status='em_viagem' returning * into v_ride;
  if not found then raise exception 'invalid_ride_transition'; end if;

  select * into v_next from public.rides where driver_id=v_driver.id and accepted_driver_id=v_driver.id and queued_after_ride_id=_ride_id and status='procurar_motorista'
  order by queued_at asc nulls last,created_at asc limit 1 for update;
  if found then
    update public.rides set status='motorista_a_caminho',accepted_at=now(),queued_after_ride_id=null,request_expires_at=null,search_expires_at=null,
      security_code=coalesce(security_code,lpad((floor(random()*10000))::int::text,4,'0')),driver_latitude=v_driver.current_lat,driver_longitude=v_driver.current_lng,driver_heading=v_driver.current_heading,updated_at=now()
    where id=v_next.id;
  end if;
  return to_jsonb(v_ride);
end;
$function$;
