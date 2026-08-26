drop policy if exists rides_driver_read_relevant on public.rides;
create policy rides_driver_read_relevant
on public.rides
for select
to authenticated
using (
  public.mobility_user_id() = any(candidate_driver_ids)
  or exists (
    select 1
    from public.drivers d
    where d.user_id = public.mobility_user_id()
      and (d.id = rides.driver_id or d.id = rides.accepted_driver_id)
  )
);
