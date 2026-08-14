-- APOIS Corridas: restore the backend contracts already consumed by the
-- Motorista UI for the public trust profile and opt-in on-board amenities.

create table if not exists public.driver_amenities (
  user_id uuid primary key references public.users(id) on delete cascade,
  charger boolean not null default false,
  water boolean not null default false,
  candy boolean not null default false,
  music_on_demand boolean not null default false,
  pet_friendly boolean not null default false,
  large_luggage boolean not null default false,
  air_conditioning boolean not null default false,
  wifi boolean not null default false,
  child_seat boolean not null default false,
  quiet_ride boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.driver_amenities enable row level security;
revoke all on table public.driver_amenities from anon, authenticated;
grant select, insert, update, delete on table public.driver_amenities to service_role;

create or replace function apois_rpc_private.get_driver_public_profile(_target_user_id uuid)
returns table (
  user_id uuid,
  name text,
  photo_url text,
  city text,
  state text,
  category text,
  vehicle_model text,
  vehicle_color text,
  vehicle_plate text,
  vehicle_year integer,
  average_rating numeric,
  total_ratings integer,
  completed_rides integer,
  approval_status text,
  is_online boolean,
  member_since timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_profile_id uuid;
begin
  if v_actor is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  select u.id into v_profile_id
  from public.users u
  where u.deleted_at is null
    and (u.id=_target_user_id or u.auth_user_id=_target_user_id)
  limit 1;

  if v_profile_id is null then
    return;
  end if;

  return query
  select
    d.user_id,
    d.name,
    d.photo_url,
    d.city,
    d.state,
    d.category,
    d.vehicle_model,
    d.vehicle_color,
    d.vehicle_plate,
    d.vehicle_year,
    d.average_rating,
    d.total_ratings,
    d.completed_rides,
    d.approval_status,
    d.is_online,
    d.created_at
  from public.drivers d
  join public.users u on u.id=d.user_id
  where d.user_id=v_profile_id
    and (
      d.approval_status='aprovado'
      or u.auth_user_id=v_actor
      or private.has_permission('users.manage')
    )
  limit 1;
end;
$function$;

revoke execute on function apois_rpc_private.get_driver_public_profile(uuid) from public, anon, authenticated;
grant execute on function apois_rpc_private.get_driver_public_profile(uuid) to service_role;

create or replace function public.get_driver_public_profile(target_user_id uuid)
returns table (
  user_id uuid,
  name text,
  photo_url text,
  city text,
  state text,
  category text,
  vehicle_model text,
  vehicle_color text,
  vehicle_plate text,
  vehicle_year integer,
  average_rating numeric,
  total_ratings integer,
  completed_rides integer,
  approval_status text,
  is_online boolean,
  member_since timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from apois_rpc_private.get_driver_public_profile($1);
$function$;

revoke execute on function public.get_driver_public_profile(uuid) from public, anon;
grant execute on function public.get_driver_public_profile(uuid) to authenticated, service_role;

create or replace function apois_rpc_private.get_own_driver_amenities()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_profile_id uuid;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select u.id into v_profile_id from public.users u where u.auth_user_id=v_actor and u.deleted_at is null limit 1;
  if v_profile_id is null then raise exception 'profile_missing' using errcode='P0002'; end if;
  if not exists(select 1 from public.drivers d where d.user_id=v_profile_id) then raise exception 'driver_profile_missing' using errcode='P0002'; end if;

  select to_jsonb(a)-'created_at'-'updated_at' into v_result
  from public.driver_amenities a where a.user_id=v_profile_id;

  return coalesce(v_result,jsonb_build_object(
    'user_id',v_profile_id,
    'charger',false,'water',false,'candy',false,'music_on_demand',false,
    'pet_friendly',false,'large_luggage',false,'air_conditioning',false,
    'wifi',false,'child_seat',false,'quiet_ride',false
  ));
end;
$function$;

create or replace function apois_rpc_private.set_own_driver_amenities(
  _charger boolean,
  _water boolean,
  _candy boolean,
  _music_on_demand boolean,
  _pet_friendly boolean,
  _large_luggage boolean,
  _air_conditioning boolean,
  _wifi boolean,
  _child_seat boolean,
  _quiet_ride boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_profile_id uuid;
  v_row public.driver_amenities%rowtype;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select u.id into v_profile_id from public.users u where u.auth_user_id=v_actor and u.deleted_at is null limit 1;
  if v_profile_id is null then raise exception 'profile_missing' using errcode='P0002'; end if;
  if not exists(select 1 from public.drivers d where d.user_id=v_profile_id) then raise exception 'driver_profile_missing' using errcode='P0002'; end if;

  insert into public.driver_amenities(
    user_id,charger,water,candy,music_on_demand,pet_friendly,large_luggage,
    air_conditioning,wifi,child_seat,quiet_ride,updated_at
  ) values (
    v_profile_id,coalesce(_charger,false),coalesce(_water,false),coalesce(_candy,false),
    coalesce(_music_on_demand,false),coalesce(_pet_friendly,false),coalesce(_large_luggage,false),
    coalesce(_air_conditioning,false),coalesce(_wifi,false),coalesce(_child_seat,false),
    coalesce(_quiet_ride,false),now()
  )
  on conflict(user_id) do update set
    charger=excluded.charger,
    water=excluded.water,
    candy=excluded.candy,
    music_on_demand=excluded.music_on_demand,
    pet_friendly=excluded.pet_friendly,
    large_luggage=excluded.large_luggage,
    air_conditioning=excluded.air_conditioning,
    wifi=excluded.wifi,
    child_seat=excluded.child_seat,
    quiet_ride=excluded.quiet_ride,
    updated_at=now()
  returning * into v_row;

  return to_jsonb(v_row)-'created_at'-'updated_at';
end;
$function$;

create or replace function apois_rpc_private.get_driver_amenities_public(_target_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_profile_id uuid;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;

  select u.id into v_profile_id
  from public.users u
  join public.drivers d on d.user_id=u.id
  where u.deleted_at is null
    and (u.id=_target_user_id or u.auth_user_id=_target_user_id)
    and (d.approval_status='aprovado' or u.auth_user_id=v_actor or private.has_permission('users.manage'))
  limit 1;

  if v_profile_id is null then return null; end if;

  select to_jsonb(a)-'created_at'-'updated_at' into v_result
  from public.driver_amenities a where a.user_id=v_profile_id;

  return coalesce(v_result,jsonb_build_object(
    'user_id',v_profile_id,
    'charger',false,'water',false,'candy',false,'music_on_demand',false,
    'pet_friendly',false,'large_luggage',false,'air_conditioning',false,
    'wifi',false,'child_seat',false,'quiet_ride',false
  ));
end;
$function$;

revoke execute on function apois_rpc_private.get_own_driver_amenities() from public, anon, authenticated;
revoke execute on function apois_rpc_private.set_own_driver_amenities(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public, anon, authenticated;
revoke execute on function apois_rpc_private.get_driver_amenities_public(uuid) from public, anon, authenticated;
grant execute on function apois_rpc_private.get_own_driver_amenities() to service_role;
grant execute on function apois_rpc_private.set_own_driver_amenities(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to service_role;
grant execute on function apois_rpc_private.get_driver_amenities_public(uuid) to service_role;

create or replace function public.get_own_driver_amenities()
returns jsonb language sql stable security definer set search_path to ''
as $function$ select apois_rpc_private.get_own_driver_amenities(); $function$;

create or replace function public.set_own_driver_amenities(
  _charger boolean,_water boolean,_candy boolean,_music_on_demand boolean,_pet_friendly boolean,
  _large_luggage boolean,_air_conditioning boolean,_wifi boolean,_child_seat boolean,_quiet_ride boolean
)
returns jsonb language sql security definer set search_path to ''
as $function$
  select apois_rpc_private.set_own_driver_amenities($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);
$function$;

create or replace function public.get_driver_amenities_public(target_user_id uuid)
returns jsonb language sql stable security definer set search_path to ''
as $function$ select apois_rpc_private.get_driver_amenities_public($1); $function$;

revoke execute on function public.get_own_driver_amenities() from public, anon;
revoke execute on function public.set_own_driver_amenities(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public, anon;
revoke execute on function public.get_driver_amenities_public(uuid) from public, anon;
grant execute on function public.get_own_driver_amenities() to authenticated, service_role;
grant execute on function public.set_own_driver_amenities(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated, service_role;
grant execute on function public.get_driver_amenities_public(uuid) to authenticated, service_role;
