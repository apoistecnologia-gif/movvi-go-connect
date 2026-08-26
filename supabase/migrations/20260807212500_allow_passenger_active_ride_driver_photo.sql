drop policy if exists apois_passenger_select_ride_driver_photo on storage.objects;
create policy apois_passenger_select_ride_driver_photo
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and exists (
    select 1
    from public.users du
    join public.drivers d on d.user_id = du.id
    join public.rides r on r.driver_id = d.id
    where du.auth_user_id::text = (storage.foldername(storage.objects.name))[1]
      and r.passenger_id = public.mobility_user_id()
      and r.status in ('motorista_a_caminho','motorista_chegou','em_viagem','finalizada')
  )
);
