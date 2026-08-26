-- APOIS Corridas: make KYC document integrity a table-level invariant.
-- This protects every registration/reupload path, including legacy RPCs, from
-- persisting cross-bucket paths or a PDF masquerading as a vehicle photo.

create or replace function private.enforce_driver_document_objects()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_auth_user_id uuid;
begin
  select u.auth_user_id
    into v_auth_user_id
  from public.users u
  where u.id = new.user_id;

  if v_auth_user_id is null then
    raise exception 'driver_auth_identity_missing' using errcode='55000';
  end if;

  if new.selfie_url is not null and (
       split_part(new.selfie_url,'/',1) <> v_auth_user_id::text
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id='driver-selfies'
           and o.name=new.selfie_url
           and coalesce(o.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp')
       )
     ) then
    raise exception 'invalid_driver_document:selfie' using errcode='22023';
  end if;

  if new.cnh_url is not null and (
       split_part(new.cnh_url,'/',1) <> v_auth_user_id::text
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id='driver-cnh'
           and o.name=new.cnh_url
           and coalesce(o.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp','application/pdf')
       )
     ) then
    raise exception 'invalid_driver_document:cnh_front' using errcode='22023';
  end if;

  if new.cnh_back_url is not null and (
       split_part(new.cnh_back_url,'/',1) <> v_auth_user_id::text
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id='driver-cnh'
           and o.name=new.cnh_back_url
           and coalesce(o.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp','application/pdf')
       )
     ) then
    raise exception 'invalid_driver_document:cnh_back' using errcode='22023';
  end if;

  if new.vehicle_document_url is not null and (
       split_part(new.vehicle_document_url,'/',1) <> v_auth_user_id::text
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id='vehicle-documents'
           and o.name=new.vehicle_document_url
           and coalesce(o.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp','application/pdf')
       )
     ) then
    raise exception 'invalid_driver_document:crlv' using errcode='22023';
  end if;

  if new.vehicle_photo_url is not null and (
       split_part(new.vehicle_photo_url,'/',1) <> v_auth_user_id::text
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id='vehicle-documents'
           and o.name=new.vehicle_photo_url
           and coalesce(o.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp')
       )
     ) then
    raise exception 'invalid_driver_document:vehicle_photo' using errcode='22023';
  end if;

  return new;
end;
$function$;

revoke execute on function private.enforce_driver_document_objects() from public, anon, authenticated;
grant execute on function private.enforce_driver_document_objects() to postgres, service_role;

drop trigger if exists trg_drivers_validate_document_objects on public.drivers;
create trigger trg_drivers_validate_document_objects
before insert or update of user_id,selfie_url,cnh_url,cnh_back_url,vehicle_document_url,vehicle_photo_url
on public.drivers
for each row execute function private.enforce_driver_document_objects();
