-- Homologação física APOIS Corridas — segurança de multa, redispatch e privacidade.
-- Não altera APOIS Entregas.

create or replace function public.apois_lock_passenger_ride_financial_gate(_passenger_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if _passenger_id is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('apois:ride-financial-gate:' || _passenger_id::text, 0));
end;
$$;

create or replace function public.apois_lock_cancellation_fee_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.apois_lock_passenger_ride_financial_gate(coalesce(new.passenger_id, old.passenger_id));
  return new;
end;
$$;

drop trigger if exists trg_apois_lock_cancellation_fee_change on public.cancellation_fees;
create trigger trg_apois_lock_cancellation_fee_change
before insert or update of passenger_id, is_paid, paid_at, status
on public.cancellation_fees
for each row execute function public.apois_lock_cancellation_fee_change();

create or replace function public.apois_enforce_passenger_ride_financial_gate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.apois_lock_passenger_ride_financial_gate(new.passenger_id);

  if exists (
    select 1
    from public.cancellation_fees cf
    where cf.passenger_id = new.passenger_id
      and cf.is_paid is not true
      and cf.paid_at is null
      and lower(coalesce(cf.status, 'pending')) not in (
        'paid', 'pago', 'cancelled', 'canceled', 'cancelada',
        'waived', 'forgiven', 'perdoada'
      )
  ) then
    raise exception 'passenger_cancellation_fee_pending' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apois_enforce_passenger_ride_financial_gate on public.rides;
create trigger trg_apois_enforce_passenger_ride_financial_gate
before insert or update of passenger_id
on public.rides
for each row execute function public.apois_enforce_passenger_ride_financial_gate();

create index if not exists cancellation_fees_passenger_pending_idx
on public.cancellation_fees (passenger_id)
where is_paid is not true and paid_at is null;

create or replace function public.driver_cancel_ride(_ride_id uuid, _reason text default null::text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_ride public.rides%rowtype;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  v_profile_id := public.mobility_user_id();
  select * into v_driver
  from public.drivers
  where user_id = v_profile_id
  for update;

  if not found then
    raise exception 'driver_profile_missing';
  end if;

  v_reason := left(trim(coalesce(_reason, '')), 500);
  if length(v_reason) < 3 then
    raise exception 'driver_cancel_reason_required';
  end if;

  select * into v_ride
  from public.rides
  where id = _ride_id
  for update;

  if not found
     or v_ride.driver_id <> v_driver.id
     or v_ride.status not in ('motorista_a_caminho', 'motorista_chegou') then
    raise exception 'invalid_ride_transition';
  end if;

  update public.rides
  set status = 'procurar_motorista',
      driver_id = null,
      accepted_driver_id = null,
      accepted_at = null,
      driver_arrived_at = null,
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
      candidate_driver_ids = array_remove(coalesce(candidate_driver_ids, '{}'::uuid[]), v_profile_id),
      offered_driver_ids = array_remove(coalesce(offered_driver_ids, '{}'::uuid[]), v_profile_id),
      rejected_driver_ids = array_append(
        array_remove(coalesce(rejected_driver_ids, '{}'::uuid[]), v_profile_id),
        v_profile_id
      ),
      request_expires_at = now(),
      search_expires_at = case
        when search_expires_at is null or search_expires_at <= now() then now() + interval '8 minutes'
        else search_expires_at
      end,
      cancellation_reason = v_reason,
      cancelled_by = 'driver',
      cancelled_at = now(),
      updated_at = now()
  where id = _ride_id
  returning * into v_ride;

  return to_jsonb(v_ride);
end;
$$;

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
  v_current public.rides%rowtype;
  v_radius_km numeric := 5;
  v_distance_km numeric;
  v_public_driver_name text;
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

  v_public_driver_name := nullif(split_part(trim(coalesce(v_driver.name, '')), ' ', 1), '');

  select * into v_ride
  from public.rides
  where id=_ride_id
  for update;

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

  if found and v_current.status in ('motorista_a_caminho','motorista_chegou') then
    raise exception 'driver_busy';
  end if;

  if found and v_current.status='em_viagem' then
    if exists (
      select 1 from public.rides q
      where q.driver_id=v_driver.id
        and q.status='procurar_motorista'
        and q.queued_after_ride_id is not null
        and q.id<>_ride_id
    ) then
      raise exception 'next_ride_already_reserved';
    end if;

    if v_current.destination_lat is null or v_current.destination_lng is null
       or v_ride.origin_lat is null or v_ride.origin_lng is null then
      raise exception 'next_ride_location_unavailable';
    end if;

    begin
      select coalesce((value #>> '{}')::numeric,5)
        into v_radius_km
      from public.app_settings
      where key='ride.next_offer_max_distance_km';
    exception when others then
      v_radius_km := 5;
    end;
    v_radius_km := greatest(0.5, least(coalesce(v_radius_km,5),20));

    v_distance_km := 6371 * acos(
      least(1, greatest(-1,
        cos(radians(v_ride.origin_lat::double precision))
        * cos(radians(v_current.destination_lat::double precision))
        * cos(radians(v_current.destination_lng::double precision) - radians(v_ride.origin_lng::double precision))
        + sin(radians(v_ride.origin_lat::double precision))
        * sin(radians(v_current.destination_lat::double precision))
      ))
    );

    if v_distance_km > v_radius_km then
      raise exception 'next_ride_not_nearby';
    end if;

    update public.rides
    set driver_id=v_driver.id,
        accepted_driver_id=v_driver.id,
        queued_after_ride_id=v_current.id,
        queued_at=now(),
        request_expires_at=null,
        search_expires_at=null,
        current_offer_driver_id=null,
        driver_name=v_public_driver_name,
        driver_photo=v_driver.photo_url,
        driver_phone=v_driver.phone,
        driver_vehicle_model=v_driver.vehicle_model,
        driver_vehicle_color=v_driver.vehicle_color,
        driver_vehicle_plate=v_driver.vehicle_plate,
        driver_rating=v_driver.rating,
        cancellation_reason=null,
        cancelled_by=null,
        cancelled_at=null,
        updated_at=now()
    where id=_ride_id
      and status='procurar_motorista'
      and driver_id is null
    returning * into v_ride;

    if not found then raise exception 'ride_offer_unavailable'; end if;
    return to_jsonb(v_ride);
  end if;

  update public.rides
  set status='motorista_a_caminho',
      driver_id=v_driver.id,
      accepted_driver_id=v_driver.id,
      accepted_at=now(),
      current_offer_driver_id=null,
      request_expires_at=null,
      search_expires_at=null,
      security_code=coalesce(security_code,lpad((floor(random()*10000))::int::text,4,'0')),
      driver_name=v_public_driver_name,
      driver_photo=v_driver.photo_url,
      driver_phone=v_driver.phone,
      driver_vehicle_model=v_driver.vehicle_model,
      driver_vehicle_color=v_driver.vehicle_color,
      driver_vehicle_plate=v_driver.vehicle_plate,
      driver_rating=v_driver.rating,
      driver_latitude=v_driver.current_lat,
      driver_longitude=v_driver.current_lng,
      driver_heading=v_driver.current_heading,
      cancellation_reason=null,
      cancelled_by=null,
      cancelled_at=null,
      updated_at=now()
  where id=_ride_id
    and status='procurar_motorista'
    and driver_id is null
  returning * into v_ride;

  if not found then raise exception 'ride_offer_unavailable'; end if;
  return to_jsonb(v_ride);
end;
$$;

revoke all on function public.apois_lock_passenger_ride_financial_gate(uuid) from public;
revoke all on function public.apois_lock_cancellation_fee_change() from public;
revoke all on function public.apois_enforce_passenger_ride_financial_gate() from public;
