-- APOIS CORRIDAS: separate the two rating directions without repurposing
-- rides.driver_rating, which is driver snapshot metadata captured for the ride.

alter table public.rides
  add column if not exists driver_to_passenger_rating smallint,
  add column if not exists driver_to_passenger_comment text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rides_driver_to_passenger_rating_check'
      and conrelid = 'public.rides'::regclass
  ) then
    alter table public.rides
      add constraint rides_driver_to_passenger_rating_check
      check (driver_to_passenger_rating is null or driver_to_passenger_rating between 1 and 5);
  end if;
end;
$$;

-- Compatibility for any legacy row that can be unambiguously identified as
-- driver -> passenger. At migration time production had no such row, but this
-- keeps the migration safe if a concurrent legacy rating arrives before apply.
update public.rides
set driver_to_passenger_rating = passenger_rating::smallint,
    driver_to_passenger_comment = passenger_rating_comment,
    passenger_rating = null,
    passenger_rating_comment = null,
    updated_at = now()
where driver_rated_at is not null
  and passenger_rated_at is null
  and passenger_rating is not null
  and driver_to_passenger_rating is null;

create or replace function public.driver_rate_passenger(
  _ride_id uuid,
  _stars integer,
  _comment text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_user_id uuid := public.mobility_user_id();
  v_ride public.rides%rowtype;
  v_avg numeric;
  v_count integer;
  v_comment text;
begin
  if auth.uid() is null or v_user_id is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if _stars is null or _stars < 1 or _stars > 5 then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;

  select d.id
    into v_driver_id
  from public.drivers d
  where d.user_id = v_user_id;

  if v_driver_id is null then
    raise exception 'driver_profile_missing';
  end if;

  v_comment := nullif(left(trim(coalesce(_comment, '')), 500), '');

  update public.rides
  set driver_to_passenger_rating = _stars::smallint,
      driver_to_passenger_comment = v_comment,
      driver_rated_at = now(),
      updated_at = now()
  where id = _ride_id
    and driver_id = v_driver_id
    and status = 'finalizada'
    and driver_rated_at is null
    and driver_to_passenger_rating is null
  returning * into v_ride;

  if not found then
    raise exception 'rating_unavailable';
  end if;

  select round(avg(r.driver_to_passenger_rating)::numeric, 2), count(*)::integer
    into v_avg, v_count
  from public.rides r
  where r.passenger_id = v_ride.passenger_id
    and r.driver_to_passenger_rating is not null;

  update public.users
  set average_rating = coalesce(v_avg, 5.00),
      total_ratings = coalesce(v_count, 0),
      updated_at = now()
  where id = v_ride.passenger_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'ride.rating.driver_to_passenger',
    'ride',
    _ride_id::text,
    jsonb_build_object(
      'rating', _stars,
      'passenger_id', v_ride.passenger_id,
      'comment_saved', v_comment is not null
    )
  );

  -- Preserve the legacy return shape (ride JSON) while never exposing a PIN.
  return to_jsonb(v_ride) - 'security_code';
end;
$$;

revoke all on function public.driver_rate_passenger(uuid, integer, text) from public, anon;
grant execute on function public.driver_rate_passenger(uuid, integer, text) to authenticated;

create or replace function public.rate_passenger_ride(
  _ride_id uuid,
  _rating integer,
  _comment text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger_id uuid;
  v_ride public.rides%rowtype;
  v_average numeric;
  v_count bigint;
  v_comment text;
begin
  v_passenger_id := public.mobility_user_id();
  if auth.uid() is null or v_passenger_id is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if _rating is null or _rating < 1 or _rating > 5 then
    raise exception 'rating_out_of_range' using errcode = '22023';
  end if;

  v_comment := nullif(left(trim(coalesce(_comment, '')), 500), '');

  select * into v_ride
  from public.rides
  where id = _ride_id
    and passenger_id = v_passenger_id
  for update;

  if not found then
    raise exception 'ride_not_found';
  end if;
  if v_ride.status <> 'finalizada' then
    raise exception 'ride_not_completed';
  end if;
  if v_ride.driver_id is null then
    raise exception 'ride_driver_missing';
  end if;
  if v_ride.passenger_rated_at is not null or v_ride.passenger_rating is not null then
    raise exception 'ride_already_rated';
  end if;

  update public.rides
  set passenger_rating = _rating,
      passenger_rating_comment = v_comment,
      passenger_rated_at = now(),
      updated_at = now()
  where id = _ride_id
    and passenger_id = v_passenger_id
    and passenger_rated_at is null
    and passenger_rating is null;

  if not found then
    raise exception 'ride_already_rated';
  end if;

  select round(avg(passenger_rating)::numeric, 2), count(*)
    into v_average, v_count
  from public.rides
  where driver_id = v_ride.driver_id
    and status = 'finalizada'
    and passenger_rating is not null
    and passenger_rated_at is not null;

  update public.drivers
  set rating = v_average,
      total_ratings = v_count::integer,
      updated_at = now()
  where id = v_ride.driver_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    v_passenger_id,
    'ride.rating.passenger_to_driver',
    'ride',
    _ride_id::text,
    jsonb_build_object(
      'rating', _rating,
      'driver_id', v_ride.driver_id,
      'comment_saved', v_comment is not null
    )
  );

  return jsonb_build_object(
    'ok', true,
    'ride_id', _ride_id,
    'rating', _rating,
    'comment_saved', v_comment is not null,
    'driver_average_rating', v_average,
    'driver_ratings_count', v_count
  );
end;
$$;

revoke all on function public.rate_passenger_ride(uuid, integer, text) from public, anon;
grant execute on function public.rate_passenger_ride(uuid, integer, text) to authenticated;
