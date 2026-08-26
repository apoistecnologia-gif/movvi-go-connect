create or replace function public.driver_rate_passenger(_ride_id uuid, _stars integer, _comment text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_driver_id uuid;
  v_ride public.rides%rowtype;
  v_avg numeric;
  v_count integer;
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

  select round(avg(r.passenger_rating)::numeric, 2), count(*)::integer
  into v_avg, v_count
  from public.rides r
  where r.passenger_id=v_ride.passenger_id
    and r.passenger_rating is not null;

  update public.users
  set average_rating=coalesce(v_avg, 5.00),
      total_ratings=coalesce(v_count, 0),
      updated_at=now()
  where id=v_ride.passenger_id;

  return to_jsonb(v_ride);
end;
$function$;

with stats as (
  select passenger_id,
         round(avg(passenger_rating)::numeric, 2) as avg_rating,
         count(*)::integer as rating_count
  from public.rides
  where passenger_rating is not null
  group by passenger_id
)
update public.users u
set average_rating=stats.avg_rating,
    total_ratings=stats.rating_count,
    updated_at=now()
from stats
where u.id=stats.passenger_id;

update public.users
set average_rating=5.00
where average_rating is null and coalesce(total_ratings,0)=0;
