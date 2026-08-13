alter table public.rides add column if not exists driver_rated_at timestamptz;
alter table public.rides add column if not exists passenger_rated_at timestamptz;

create or replace function public.driver_accept_ride(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_ride public.rides%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  v_profile_id := public.mobility_user_id();
  select * into v_driver
  from public.drivers
  where user_id = v_profile_id
  for update;

  if not found then raise exception 'driver_profile_missing'; end if;
  if v_driver.approval_status <> 'aprovado' then raise exception 'driver_not_approved'; end if;
  if lower(coalesce(v_driver.subscription_status,'')) not in ('active','ativa','teste') then raise exception 'driver_subscription_inactive'; end if;
  if not v_driver.is_online then raise exception 'driver_offline'; end if;

  update public.rides
  set status='motorista_a_caminho',
      driver_id=v_driver.id,
      accepted_driver_id=v_driver.id,
      accepted_at=now(),
      current_offer_driver_id=null,
      security_code=coalesce(security_code,lpad((floor(random()*10000))::int::text,4,'0')),
      driver_name=v_driver.name,
      driver_photo=v_driver.photo_url,
      driver_phone=v_driver.phone,
      driver_vehicle_model=v_driver.vehicle_model,
      driver_vehicle_color=v_driver.vehicle_color,
      driver_vehicle_plate=v_driver.vehicle_plate,
      driver_rating=v_driver.rating,
      driver_latitude=v_driver.current_lat,
      driver_longitude=v_driver.current_lng,
      driver_heading=v_driver.current_heading,
      updated_at=now()
  where id=_ride_id
    and status='procurar_motorista'
    and driver_id is null
    and v_profile_id=any(candidate_driver_ids)
    and not (v_profile_id=any(coalesce(rejected_driver_ids,'{}'::uuid[])))
    and (request_expires_at is null or request_expires_at>now())
  returning * into v_ride;

  if not found then raise exception 'ride_offer_unavailable'; end if;
  return to_jsonb(v_ride);
end;
$$;

create or replace function public.driver_finish_ride(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_ride public.rides%rowtype;
begin
  select id into v_driver_id
  from public.drivers
  where user_id=public.mobility_user_id();

  if v_driver_id is null then raise exception 'driver_profile_missing'; end if;

  update public.rides
  set status='finalizada',
      final_price=coalesce(final_price,estimated_price),
      completed_at=now(),
      updated_at=now()
  where id=_ride_id
    and driver_id=v_driver_id
    and status='em_viagem'
  returning * into v_ride;

  if not found then raise exception 'invalid_ride_transition'; end if;
  return to_jsonb(v_ride);
end;
$$;

create or replace function public.driver_rate_passenger(
  _ride_id uuid,
  _stars integer,
  _comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_ride public.rides%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if _stars is null or _stars < 1 or _stars > 5 then raise exception 'invalid_rating' using errcode='22023'; end if;

  select id into v_driver_id
  from public.drivers
  where user_id=public.mobility_user_id();
  if v_driver_id is null then raise exception 'driver_profile_missing'; end if;

  update public.rides
  set passenger_rating=_stars,
      passenger_rating_comment=nullif(left(trim(coalesce(_comment,'')),500),''),
      driver_rated_at=now(),
      updated_at=now()
  where id=_ride_id
    and driver_id=v_driver_id
    and status='finalizada'
    and driver_rated_at is null
  returning * into v_ride;

  if not found then raise exception 'rating_unavailable'; end if;
  return to_jsonb(v_ride);
end;
$$;

revoke all on function public.driver_rate_passenger(uuid,integer,text) from public;
grant execute on function public.driver_rate_passenger(uuid,integer,text) to authenticated, service_role;
