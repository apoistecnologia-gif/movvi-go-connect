-- APOIS Corridas: replacing KYC evidence must never let the driver escape an
-- administrative suspension/block. Normal onboarding/review states return to
-- em_analise; suspended/blocked accounts remain in their administrative state.

create or replace function apois_rpc_private.driver_update_document(
  _slot text,
  _storage_path text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'storage', 'apois_rpc_private'
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_slot text := lower(trim(coalesce(_slot, '')));
  v_path text := trim(coalesce(_storage_path, ''));
  v_bucket text;
  v_complete boolean;
  v_next_approval_status text;
begin
  if v_auth_user_id is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  v_profile_id := public.mobility_user_id();
  if v_profile_id is null then
    raise exception 'profile_missing' using errcode='42501';
  end if;

  if v_slot not in ('selfie','cnh_front','cnh_back','crlv','vehicle_photo') then
    raise exception 'invalid_document_slot' using errcode='22023';
  end if;

  v_bucket := case v_slot
    when 'selfie' then 'driver-selfies'
    when 'cnh_front' then 'driver-cnh'
    when 'cnh_back' then 'driver-cnh'
    when 'crlv' then 'vehicle-documents'
    when 'vehicle_photo' then 'vehicle-documents'
  end;

  if v_path='' or split_part(v_path,'/',1)<>v_auth_user_id::text then
    raise exception 'invalid_document_path' using errcode='22023';
  end if;

  if not exists(
    select 1 from storage.objects o
    where o.bucket_id=v_bucket and o.name=v_path
  ) then
    raise exception 'document_object_missing' using errcode='22023';
  end if;

  select * into v_driver
  from public.drivers
  where user_id=v_profile_id
  for update;

  if not found then
    raise exception 'driver_profile_missing' using errcode='P0002';
  end if;

  v_next_approval_status := case
    when v_driver.approval_status in ('suspenso','bloqueado') then v_driver.approval_status
    else 'em_analise'
  end;

  update public.drivers
  set selfie_url=case when v_slot='selfie' then v_path else selfie_url end,
      cnh_url=case when v_slot='cnh_front' then v_path else cnh_url end,
      cnh_back_url=case when v_slot='cnh_back' then v_path else cnh_back_url end,
      vehicle_document_url=case when v_slot='crlv' then v_path else vehicle_document_url end,
      vehicle_photo_url=case when v_slot='vehicle_photo' then v_path else vehicle_photo_url end,
      documents_status='pending_review',
      approval_status=v_next_approval_status,
      approved_at=case
        when v_next_approval_status='em_analise' then null
        else approved_at
      end,
      motivo_reprovacao=case
        when v_next_approval_status='em_analise' then null
        else motivo_reprovacao
      end,
      is_online=false,
      updated_at=now()
  where id=v_driver.id
  returning * into v_driver;

  v_complete :=
    v_driver.selfie_url is not null
    and v_driver.cnh_url is not null
    and v_driver.cnh_back_url is not null
    and v_driver.vehicle_document_url is not null
    and v_driver.vehicle_photo_url is not null;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    v_auth_user_id,
    'driver.document.replaced',
    'driver',
    v_driver.id::text,
    jsonb_build_object(
      'driver_domain_user_id',v_profile_id,
      'slot',v_slot,
      'bucket',v_bucket,
      'storage_path',v_path,
      'documents_status',v_driver.documents_status,
      'approval_status',v_driver.approval_status,
      'complete',v_complete
    )
  );

  return jsonb_build_object(
    'ok',true,
    'driver_id',v_driver.id,
    'slot',v_slot,
    'documents_status',v_driver.documents_status,
    'approval_status',v_driver.approval_status,
    'complete',v_complete
  );
end;
$function$;
