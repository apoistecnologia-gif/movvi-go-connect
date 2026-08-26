-- APOIS Corridas: a public ride-share link is for live-trip safety only.
-- Once the ride leaves a shareable active state, the anonymous endpoint must
-- stop returning route/driver data even if the UUID token TTL has not elapsed.

create or replace function private.revoke_share_token_when_ride_not_active()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status is distinct from old.status
     and new.share_token is not null
     and new.status not in ('motorista_a_caminho','motorista_chegou','em_viagem') then
    new.share_revoked_at := coalesce(new.share_revoked_at, pg_catalog.now());
  end if;
  return new;
end;
$function$;

revoke execute on function private.revoke_share_token_when_ride_not_active() from public,anon,authenticated;
grant execute on function private.revoke_share_token_when_ride_not_active() to postgres,service_role;

drop trigger if exists trg_rides_revoke_share_on_terminal_state on public.rides;
create trigger trg_rides_revoke_share_on_terminal_state
before update of status on public.rides
for each row execute function private.revoke_share_token_when_ride_not_active();

create or replace function apois_rpc_private.get_shared_passenger_ride(_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ride public.rides%rowtype;
begin
  select * into v_ride
  from public.rides
  where share_token = _token
    and share_revoked_at is null
    and share_expires_at is not null
    and share_expires_at > now()
    and status in ('motorista_a_caminho','motorista_chegou','em_viagem')
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','shared_ride_not_found');
  end if;

  return jsonb_build_object(
    'ok',true,
    'ride',jsonb_build_object(
      'status',v_ride.status,
      'category',v_ride.category,
      'origin_name',v_ride.origin_name,
      'destination_name',v_ride.destination_name,
      'driver_name',v_ride.driver_name,
      'driver_vehicle_model',v_ride.driver_vehicle_model,
      'driver_vehicle_color',v_ride.driver_vehicle_color,
      'driver_vehicle_plate',v_ride.driver_vehicle_plate,
      'driver_latitude',v_ride.driver_latitude,
      'driver_longitude',v_ride.driver_longitude,
      'driver_heading',v_ride.driver_heading,
      'created_at',v_ride.created_at,
      'accepted_at',v_ride.accepted_at,
      'driver_arrived_at',v_ride.driver_arrived_at,
      'started_at',v_ride.started_at,
      'completed_at',v_ride.completed_at,
      'updated_at',v_ride.updated_at
    )
  );
end;
$function$;
