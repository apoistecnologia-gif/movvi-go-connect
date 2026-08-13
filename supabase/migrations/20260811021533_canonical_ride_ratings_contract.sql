-- Canonical, directional, server-authorized ride ratings for APOIS CORRIDAS.
-- Existing rides rating columns remain compatibility mirrors for current clients.

create table public.ride_ratings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  direction text not null,
  rater_user_id uuid not null references public.users(id),
  ratee_user_id uuid not null references public.users(id),
  rating smallint not null,
  comment text,
  created_at timestamptz not null default now(),
  constraint ride_ratings_direction_check check (direction in ('passenger_to_driver', 'driver_to_passenger')),
  constraint ride_ratings_value_check check (rating between 1 and 5),
  constraint ride_ratings_comment_length_check check (comment is null or char_length(comment) <= 500),
  constraint ride_ratings_distinct_users_check check (rater_user_id <> ratee_user_id),
  constraint ride_ratings_one_per_direction unique (ride_id, direction)
);

create index ride_ratings_ratee_direction_idx
  on public.ride_ratings (ratee_user_id, direction, created_at desc);
create index ride_ratings_rater_idx
  on public.ride_ratings (rater_user_id, created_at desc);

alter table public.ride_ratings enable row level security;
revoke all on table public.ride_ratings from public, anon, authenticated;
grant select on table public.ride_ratings to authenticated;
grant all on table public.ride_ratings to service_role;

create policy ride_ratings_participant_select
  on public.ride_ratings
  for select
  to authenticated
  using (
    rater_user_id = public.mobility_user_id()
    or ratee_user_id = public.mobility_user_id()
  );

-- Backfill only real directional reviews between distinct ride participants.
-- rides.driver_rating is an aggregate snapshot and is deliberately ignored.
insert into public.ride_ratings (
  ride_id, direction, rater_user_id, ratee_user_id, rating, comment, created_at
)
select
  r.id,
  'passenger_to_driver',
  r.passenger_id,
  d.user_id,
  r.passenger_rating::smallint,
  nullif(left(trim(coalesce(r.passenger_rating_comment, '')), 500), ''),
  coalesce(r.passenger_rated_at, r.completed_at, r.updated_at, r.created_at, now())
from public.rides r
join public.drivers d on d.id = r.driver_id
where r.status = 'finalizada'
  and r.passenger_rating is not null
  and r.passenger_id is not null
  and d.user_id is not null
  and r.passenger_id <> d.user_id
on conflict (ride_id, direction) do nothing;

insert into public.ride_ratings (
  ride_id, direction, rater_user_id, ratee_user_id, rating, comment, created_at
)
select
  r.id,
  'driver_to_passenger',
  d.user_id,
  r.passenger_id,
  r.driver_to_passenger_rating::smallint,
  nullif(left(trim(coalesce(r.driver_to_passenger_comment, '')), 500), ''),
  coalesce(r.driver_rated_at, r.completed_at, r.updated_at, r.created_at, now())
from public.rides r
join public.drivers d on d.id = r.driver_id
where r.status = 'finalizada'
  and r.driver_to_passenger_rating is not null
  and r.passenger_id is not null
  and d.user_id is not null
  and r.passenger_id <> d.user_id
on conflict (ride_id, direction) do nothing;

-- Rebuild aggregates from the canonical review table, removing phantom/default
-- ratings that have no real review behind them.
with agg as (
  select ratee_user_id, round(avg(rating)::numeric, 2) as average_rating, count(*)::integer as rating_count
  from public.ride_ratings
  where direction = 'passenger_to_driver'
  group by ratee_user_id
)
update public.drivers d
set rating = agg.average_rating,
    total_ratings = agg.rating_count,
    updated_at = now()
from agg
where agg.ratee_user_id = d.user_id;

update public.drivers d
set rating = null,
    total_ratings = 0,
    updated_at = now()
where not exists (
  select 1 from public.ride_ratings rr
  where rr.direction = 'passenger_to_driver' and rr.ratee_user_id = d.user_id
);

with agg as (
  select ratee_user_id, round(avg(rating)::numeric, 2) as average_rating, count(*)::integer as rating_count
  from public.ride_ratings
  where direction = 'driver_to_passenger'
  group by ratee_user_id
)
update public.users u
set average_rating = agg.average_rating,
    total_ratings = agg.rating_count,
    updated_at = now()
from agg
where agg.ratee_user_id = u.id;

update public.users u
set average_rating = null,
    total_ratings = 0,
    updated_at = now()
where not exists (
  select 1 from public.ride_ratings rr
  where rr.direction = 'driver_to_passenger' and rr.ratee_user_id = u.id
);

update public.rides r
set driver_rating = d.rating
from public.drivers d
where r.driver_id = d.id
  and r.driver_rating is distinct from d.rating;

create or replace function apois_rpc_private.rate_passenger_ride(
  _ride_id uuid,
  _rating integer,
  _comment text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_passenger_id uuid := public.mobility_user_id();
  v_ride public.rides%rowtype;
  v_driver_user_id uuid;
  v_existing public.ride_ratings%rowtype;
  v_inserted public.ride_ratings%rowtype;
  v_average numeric;
  v_count integer;
  v_comment text;
begin
  if auth.uid() is null or v_passenger_id is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if _rating is null or _rating < 1 or _rating > 5 then
    raise exception 'rating_out_of_range' using errcode = '22023';
  end if;

  v_comment := nullif(left(trim(coalesce(_comment, '')), 500), '');

  select * into v_ride
  from public.rides
  where id = _ride_id and passenger_id = v_passenger_id
  for update;

  if not found then raise exception 'ride_not_found'; end if;
  if v_ride.status <> 'finalizada' then raise exception 'ride_not_completed'; end if;
  if v_ride.driver_id is null then raise exception 'ride_driver_missing'; end if;

  select d.user_id into v_driver_user_id
  from public.drivers d
  where d.id = v_ride.driver_id;

  if v_driver_user_id is null then raise exception 'ride_driver_missing'; end if;
  if v_driver_user_id = v_passenger_id then raise exception 'ride_rating_participants_invalid'; end if;

  insert into public.ride_ratings (ride_id, direction, rater_user_id, ratee_user_id, rating, comment)
  values (_ride_id, 'passenger_to_driver', v_passenger_id, v_driver_user_id, _rating::smallint, v_comment)
  on conflict (ride_id, direction) do nothing
  returning * into v_inserted;

  if v_inserted.id is null then
    select * into v_existing
    from public.ride_ratings
    where ride_id = _ride_id and direction = 'passenger_to_driver';

    if v_existing.id is null
       or v_existing.rater_user_id <> v_passenger_id
       or v_existing.ratee_user_id <> v_driver_user_id
       or v_existing.rating <> _rating
       or v_existing.comment is distinct from v_comment then
      raise exception 'ride_already_rated';
    end if;
  else
    update public.rides
    set passenger_rating = v_inserted.rating,
        passenger_rating_comment = v_inserted.comment,
        passenger_rated_at = v_inserted.created_at,
        updated_at = now()
    where id = _ride_id;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values (
      v_passenger_id,
      'ride.rating.passenger_to_driver',
      'ride',
      _ride_id::text,
      jsonb_build_object('rating', v_inserted.rating, 'driver_id', v_ride.driver_id, 'comment_saved', v_inserted.comment is not null)
    );
  end if;

  select case when count(*) > 0 then round(avg(rr.rating)::numeric, 2) else null end, count(*)::integer
  into v_average, v_count
  from public.ride_ratings rr
  where rr.direction = 'passenger_to_driver' and rr.ratee_user_id = v_driver_user_id;

  update public.drivers
  set rating = v_average, total_ratings = v_count, updated_at = now()
  where id = v_ride.driver_id;

  update public.rides
  set driver_rating = v_average
  where driver_id = v_ride.driver_id and driver_rating is distinct from v_average;

  return jsonb_build_object(
    'ok', true, 'ride_id', _ride_id, 'rating', _rating,
    'comment_saved', v_comment is not null,
    'driver_average_rating', v_average,
    'driver_ratings_count', v_count,
    'idempotent', v_inserted.id is null
  );
end;
$function$;

create or replace function apois_rpc_private.driver_rate_passenger(
  _ride_id uuid,
  _stars integer,
  _comment text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_driver_id uuid;
  v_user_id uuid := public.mobility_user_id();
  v_ride public.rides%rowtype;
  v_existing public.ride_ratings%rowtype;
  v_inserted public.ride_ratings%rowtype;
  v_average numeric;
  v_count integer;
  v_comment text;
begin
  if auth.uid() is null or v_user_id is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if _stars is null or _stars < 1 or _stars > 5 then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;

  select d.id into v_driver_id
  from public.drivers d
  where d.user_id = v_user_id;

  if v_driver_id is null then raise exception 'driver_profile_missing'; end if;
  v_comment := nullif(left(trim(coalesce(_comment, '')), 500), '');

  select * into v_ride
  from public.rides
  where id = _ride_id and driver_id = v_driver_id
  for update;

  if not found or v_ride.status <> 'finalizada' then raise exception 'rating_unavailable'; end if;
  if v_ride.passenger_id = v_user_id then raise exception 'rating_unavailable'; end if;

  insert into public.ride_ratings (ride_id, direction, rater_user_id, ratee_user_id, rating, comment)
  values (_ride_id, 'driver_to_passenger', v_user_id, v_ride.passenger_id, _stars::smallint, v_comment)
  on conflict (ride_id, direction) do nothing
  returning * into v_inserted;

  if v_inserted.id is null then
    select * into v_existing
    from public.ride_ratings
    where ride_id = _ride_id and direction = 'driver_to_passenger';

    if v_existing.id is null
       or v_existing.rater_user_id <> v_user_id
       or v_existing.ratee_user_id <> v_ride.passenger_id
       or v_existing.rating <> _stars
       or v_existing.comment is distinct from v_comment then
      raise exception 'rating_unavailable';
    end if;
  else
    update public.rides
    set driver_to_passenger_rating = v_inserted.rating,
        driver_to_passenger_comment = v_inserted.comment,
        driver_rated_at = v_inserted.created_at,
        updated_at = now()
    where id = _ride_id;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values (
      v_user_id,
      'ride.rating.driver_to_passenger',
      'ride',
      _ride_id::text,
      jsonb_build_object('rating', v_inserted.rating, 'passenger_id', v_ride.passenger_id, 'comment_saved', v_inserted.comment is not null)
    );
  end if;

  select case when count(*) > 0 then round(avg(rr.rating)::numeric, 2) else null end, count(*)::integer
  into v_average, v_count
  from public.ride_ratings rr
  where rr.direction = 'driver_to_passenger' and rr.ratee_user_id = v_ride.passenger_id;

  update public.users
  set average_rating = v_average, total_ratings = v_count, updated_at = now()
  where id = v_ride.passenger_id;

  return jsonb_build_object(
    'ok', true, 'ride_id', _ride_id, 'rating', _stars,
    'comment_saved', v_comment is not null,
    'passenger_average_rating', v_average,
    'passenger_ratings_count', v_count,
    'idempotent', v_inserted.id is null
  );
end;
$function$;

revoke all on function apois_rpc_private.rate_passenger_ride(uuid, integer, text) from public, anon;
grant execute on function apois_rpc_private.rate_passenger_ride(uuid, integer, text) to authenticated, service_role;
revoke all on function apois_rpc_private.driver_rate_passenger(uuid, integer, text) from public, anon;
grant execute on function apois_rpc_private.driver_rate_passenger(uuid, integer, text) to authenticated, service_role;
