-- APOIS Corridas: suspension must not become a KYC approval bypass.
-- Only an already-approved driver may enter suspension, and reactivation
-- requires the same identity/document integrity expected by normal approval.

CREATE OR REPLACE FUNCTION apois_rpc_private.admin_set_driver_suspension(
  _driver_id uuid,
  _suspended boolean,
  _reason text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_before public.drivers%rowtype;
  v_after public.drivers%rowtype;
  v_driver_auth_user_id uuid;
  v_missing text[] := array[]::text[];
begin
  if v_auth_user_id is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not private.has_permission('users.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_before
  from public.drivers
  where id = _driver_id
  for update;
  if not found then raise exception 'driver_not_found' using errcode = 'P0002'; end if;

  if _suspended then
    if v_before.approval_status not in ('aprovado','suspenso') then
      raise exception 'invalid_driver_suspension_state' using errcode = '55000';
    end if;

    update public.drivers
       set approval_status = 'suspenso',
           suspended_at = coalesce(suspended_at, now()),
           is_online = false,
           updated_at = now()
     where id = _driver_id
     returning * into v_after;
  else
    if v_before.approval_status <> 'suspenso' then
      raise exception 'driver_not_suspended' using errcode = '55000';
    end if;

    select u.auth_user_id
      into v_driver_auth_user_id
    from public.users u
    where u.id = v_before.user_id;

    if v_driver_auth_user_id is null then
      raise exception 'driver_auth_identity_missing' using errcode = '55000';
    end if;

    if v_before.cpf is null or not private.is_valid_cpf(v_before.cpf) then
      raise exception 'driver_identity_invalid:cpf' using errcode = '55000';
    end if;
    if v_before.birth_date is null or v_before.birth_date > (current_date - interval '18 years')::date then
      raise exception 'driver_identity_invalid:birth_date' using errcode = '55000';
    end if;

    if v_before.selfie_url is null
       or split_part(v_before.selfie_url,'/',1) <> v_driver_auth_user_id::text
       or not exists(select 1 from storage.objects o where o.bucket_id='driver-selfies' and o.name=v_before.selfie_url)
      then v_missing := array_append(v_missing,'selfie'); end if;
    if v_before.cnh_url is null
       or split_part(v_before.cnh_url,'/',1) <> v_driver_auth_user_id::text
       or not exists(select 1 from storage.objects o where o.bucket_id='driver-cnh' and o.name=v_before.cnh_url)
      then v_missing := array_append(v_missing,'cnh_front'); end if;
    if v_before.cnh_back_url is null
       or split_part(v_before.cnh_back_url,'/',1) <> v_driver_auth_user_id::text
       or not exists(select 1 from storage.objects o where o.bucket_id='driver-cnh' and o.name=v_before.cnh_back_url)
      then v_missing := array_append(v_missing,'cnh_back'); end if;
    if v_before.vehicle_document_url is null
       or split_part(v_before.vehicle_document_url,'/',1) <> v_driver_auth_user_id::text
       or not exists(select 1 from storage.objects o where o.bucket_id='vehicle-documents' and o.name=v_before.vehicle_document_url)
      then v_missing := array_append(v_missing,'crlv'); end if;
    if v_before.vehicle_photo_url is null
       or split_part(v_before.vehicle_photo_url,'/',1) <> v_driver_auth_user_id::text
       or not exists(select 1 from storage.objects o where o.bucket_id='vehicle-documents' and o.name=v_before.vehicle_photo_url)
      then v_missing := array_append(v_missing,'vehicle_photo'); end if;

    if cardinality(v_missing) > 0 then
      raise exception 'driver_documents_incomplete:%', array_to_string(v_missing,',') using errcode = '55000';
    end if;

    update public.drivers
       set approval_status = 'aprovado',
           documents_status = 'approved',
           approved_at = coalesce(approved_at, now()),
           suspended_at = null,
           is_online = false,
           updated_at = now()
     where id = _driver_id
     returning * into v_after;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (
    v_auth_user_id,
    'admin.driver.suspension_changed',
    'driver',
    _driver_id::text,
    jsonb_build_object(
      'suspended', _suspended,
      'reason', nullif(left(btrim(coalesce(_reason,'')),500),''),
      'previous_status', v_before.approval_status,
      'new_status', v_after.approval_status
    )
  );

  return jsonb_build_object(
    'id', v_after.id,
    'approval_status', v_after.approval_status,
    'suspended_at', v_after.suspended_at,
    'is_online', v_after.is_online,
    'reason', nullif(left(btrim(coalesce(_reason,'')),500),'')
  );
end;
$function$;
