-- APOIS Corridas: once a KYC object is referenced by the driver's record,
-- the authenticated driver may no longer overwrite or delete that exact
-- object through Storage. Legitimate replacement already uploads a fresh,
-- versioned path and then atomically points the driver row to the new object.
-- This prevents changing evidence in-place after it has entered review or
-- after it has been approved.

create or replace function private.driver_evidence_object_is_referenced(
  _bucket text,
  _name text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when auth.uid() is null then false
    when split_part(coalesce(_name,''),'/',1) <> auth.uid()::text then false
    else exists (
      select 1
      from public.drivers d
      join public.users u on u.id = d.user_id
      where u.auth_user_id = auth.uid()
        and (
          (_bucket = 'driver-selfies' and d.selfie_url = _name)
          or (_bucket = 'driver-cnh' and (d.cnh_url = _name or d.cnh_back_url = _name))
          or (_bucket = 'vehicle-documents' and (d.vehicle_document_url = _name or d.vehicle_photo_url = _name))
        )
    )
  end;
$function$;

revoke all on function private.driver_evidence_object_is_referenced(text,text) from public;
grant execute on function private.driver_evidence_object_is_referenced(text,text) to authenticated, service_role;

drop policy if exists apois_driver_storage_delete_own on storage.objects;
create policy apois_driver_storage_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = any (array['driver-selfies'::text,'driver-cnh'::text,'vehicle-documents'::text,'profile-photos'::text])
  and (storage.foldername(name))[1] = auth.uid()::text
  and (
    bucket_id = 'profile-photos'
    or not private.driver_evidence_object_is_referenced(bucket_id,name)
  )
);

drop policy if exists apois_driver_storage_update_own on storage.objects;
create policy apois_driver_storage_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = any (array['driver-selfies'::text,'driver-cnh'::text,'vehicle-documents'::text,'profile-photos'::text])
  and (storage.foldername(name))[1] = auth.uid()::text
  and (
    bucket_id = 'profile-photos'
    or not private.driver_evidence_object_is_referenced(bucket_id,name)
  )
)
with check (
  bucket_id = any (array['driver-selfies'::text,'driver-cnh'::text,'vehicle-documents'::text,'profile-photos'::text])
  and (storage.foldername(name))[1] = auth.uid()::text
  and (
    bucket_id = 'profile-photos'
    or not private.driver_evidence_object_is_referenced(bucket_id,name)
  )
);
