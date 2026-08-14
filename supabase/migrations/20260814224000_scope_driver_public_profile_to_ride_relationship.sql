-- APOIS Corridas: a driver's trust profile is not a global authenticated-user
-- directory. It is visible to the driver themself, staff with users.manage, or
-- a passenger who actually has/had a ride with that driver. This mirrors the
-- existing Storage policy for driver profile photos.

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
  v_actor_profile_id uuid;
  v_target_profile_id uuid;
begin
  if v_actor is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  select u.id into v_actor_profile_id
  from public.users u
  where u.auth_user_id=v_actor and u.deleted_at is null
  limit 1;

  select u.id into v_target_profile_id
  from public.users u
  where u.deleted_at is null
    and (u.id=_target_user_id or u.auth_user_id=_target_user_id)
  limit 1;

  if v_target_profile_id is null then
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
  where d.user_id=v_target_profile_id
    and (
      u.auth_user_id=v_actor
      or private.has_permission('users.manage')
      or (
        d.approval_status='aprovado'
        and v_actor_profile_id is not null
        and exists (
          select 1
          from public.rides r
          where r.passenger_id=v_actor_profile_id
            and r.driver_id=d.id
            and r.status in ('motorista_a_caminho','motorista_chegou','em_viagem','finalizada')
        )
      )
    )
  limit 1;
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
  v_actor_profile_id uuid;
  v_target_profile_id uuid;
  v_target_driver_id uuid;
  v_target_driver_status text;
  v_target_auth_id uuid;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  select u.id into v_actor_profile_id
  from public.users u
  where u.auth_user_id=v_actor and u.deleted_at is null
  limit 1;

  select u.id,u.auth_user_id,d.id,d.approval_status
    into v_target_profile_id,v_target_auth_id,v_target_driver_id,v_target_driver_status
  from public.users u
  join public.drivers d on d.user_id=u.id
  where u.deleted_at is null
    and (u.id=_target_user_id or u.auth_user_id=_target_user_id)
  limit 1;

  if v_target_profile_id is null then
    return null;
  end if;

  if v_target_auth_id<>v_actor
     and not private.has_permission('users.manage')
     and not (
       v_target_driver_status='aprovado'
       and v_actor_profile_id is not null
       and exists (
         select 1 from public.rides r
         where r.passenger_id=v_actor_profile_id
           and r.driver_id=v_target_driver_id
           and r.status in ('motorista_a_caminho','motorista_chegou','em_viagem','finalizada')
       )
     ) then
    return null;
  end if;

  select to_jsonb(a)-'created_at'-'updated_at'
    into v_result
  from public.driver_amenities a
  where a.user_id=v_target_profile_id;

  return coalesce(v_result,jsonb_build_object(
    'user_id',v_target_profile_id,
    'charger',false,'water',false,'candy',false,'music_on_demand',false,
    'pet_friendly',false,'large_luggage',false,'air_conditioning',false,
    'wifi',false,'child_seat',false,'quiet_ride',false
  ));
end;
$function$;
