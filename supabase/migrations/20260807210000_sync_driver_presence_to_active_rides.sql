create or replace function public.sync_driver_presence_to_active_rides()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.current_lat is distinct from old.current_lat
     or new.current_lng is distinct from old.current_lng
     or new.current_heading is distinct from old.current_heading
     or new.last_location_at is distinct from old.last_location_at then
    update public.rides
    set driver_latitude = new.current_lat,
        driver_longitude = new.current_lng,
        driver_heading = new.current_heading,
        updated_at = now()
    where driver_id = new.id
      and status in ('motorista_a_caminho','motorista_chegou','em_viagem');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_driver_presence_to_active_rides on public.drivers;
create trigger trg_sync_driver_presence_to_active_rides
after update of current_lat,current_lng,current_heading,last_location_at on public.drivers
for each row execute function public.sync_driver_presence_to_active_rides();
