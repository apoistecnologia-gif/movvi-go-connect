-- APOIS Corridas: canonical Driver document replacement/review cycle.
-- A replaced mandatory document always returns the Driver to review and offline.
-- Admin approval is allowed only when every required object exists in the
-- expected private bucket under the Driver's auth.uid() prefix.

CREATE OR REPLACE FUNCTION apois_rpc_private.driver_update_document(
  _slot text,
  _storage_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'storage', 'apois_rpc_private'
AS $function$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_slot text := lower(trim(coalesce(_slot, '')));
  v_path text := trim(coalesce(_storage_path, ''));
  v_bucket text;
  v_complete boolean;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;

  v_profile_id := public.mobility_user_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_missing' USING errcode = '42501';
  END IF;

  IF v_slot NOT IN ('selfie','cnh_front','cnh_back','crlv','vehicle_photo') THEN
    RAISE EXCEPTION 'invalid_document_slot' USING errcode = '22023';
  END IF;

  v_bucket := CASE v_slot
    WHEN 'selfie' THEN 'driver-selfies'
    WHEN 'cnh_front' THEN 'driver-cnh'
    WHEN 'cnh_back' THEN 'driver-cnh'
    WHEN 'crlv' THEN 'vehicle-documents'
    WHEN 'vehicle_photo' THEN 'vehicle-documents'
  END;

  IF v_path = '' OR split_part(v_path, '/', 1) <> v_auth_user_id::text THEN
    RAISE EXCEPTION 'invalid_document_path' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = v_bucket
      AND o.name = v_path
  ) THEN
    RAISE EXCEPTION 'document_object_missing' USING errcode = '22023';
  END IF;

  SELECT * INTO v_driver
  FROM public.drivers
  WHERE user_id = v_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_profile_missing' USING errcode = 'P0002';
  END IF;

  UPDATE public.drivers
  SET selfie_url = CASE WHEN v_slot = 'selfie' THEN v_path ELSE selfie_url END,
      cnh_url = CASE WHEN v_slot = 'cnh_front' THEN v_path ELSE cnh_url END,
      cnh_back_url = CASE WHEN v_slot = 'cnh_back' THEN v_path ELSE cnh_back_url END,
      vehicle_document_url = CASE WHEN v_slot = 'crlv' THEN v_path ELSE vehicle_document_url END,
      vehicle_photo_url = CASE WHEN v_slot = 'vehicle_photo' THEN v_path ELSE vehicle_photo_url END,
      documents_status = 'pending_review',
      approval_status = 'em_analise',
      approved_at = NULL,
      motivo_reprovacao = NULL,
      is_online = false,
      updated_at = now()
  WHERE id = v_driver.id
  RETURNING * INTO v_driver;

  v_complete := v_driver.selfie_url IS NOT NULL
    AND v_driver.cnh_url IS NOT NULL
    AND v_driver.cnh_back_url IS NOT NULL
    AND v_driver.vehicle_document_url IS NOT NULL
    AND v_driver.vehicle_photo_url IS NOT NULL;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_auth_user_id,
    'driver.document.replaced',
    'driver',
    v_driver.id::text,
    jsonb_build_object(
      'driver_domain_user_id', v_profile_id,
      'slot', v_slot,
      'bucket', v_bucket,
      'storage_path', v_path,
      'documents_status', v_driver.documents_status,
      'approval_status', v_driver.approval_status,
      'complete', v_complete
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'driver_id', v_driver.id,
    'slot', v_slot,
    'documents_status', v_driver.documents_status,
    'approval_status', v_driver.approval_status,
    'complete', v_complete
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.driver_update_document(
  _slot text,
  _storage_path text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT apois_rpc_private.driver_update_document($1, $2);
$function$;

REVOKE ALL ON FUNCTION apois_rpc_private.driver_update_document(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apois_rpc_private.driver_update_document(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.driver_update_document(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_update_document(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION apois_rpc_private.admin_set_driver_approval(
  _driver_id uuid,
  _status text,
  _reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'storage', 'private', 'apois_rpc_private'
AS $function$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_status text := lower(trim(coalesce(_status,'')));
  v_driver_auth_user_id uuid;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode='42501';
  END IF;
  IF NOT private.has_permission('users.manage') THEN
    RAISE EXCEPTION 'forbidden' USING errcode='42501';
  END IF;
  IF v_status NOT IN ('em_analise','aprovado','reprovado','bloqueado') THEN
    RAISE EXCEPTION 'invalid_status' USING errcode='22023';
  END IF;

  SELECT d.*, u.auth_user_id
  INTO v_driver, v_driver_auth_user_id
  FROM public.drivers d
  JOIN public.users u ON u.id = d.user_id
  WHERE d.id = _driver_id
  FOR UPDATE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_not_found' USING errcode='P0002';
  END IF;

  IF v_status = 'aprovado' THEN
    IF v_driver.selfie_url IS NULL
       OR split_part(v_driver.selfie_url,'/',1) <> v_driver_auth_user_id::text
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
         WHERE o.bucket_id='driver-selfies' AND o.name=v_driver.selfie_url
       ) THEN
      v_missing := array_append(v_missing, 'selfie');
    END IF;

    IF v_driver.cnh_url IS NULL
       OR split_part(v_driver.cnh_url,'/',1) <> v_driver_auth_user_id::text
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
         WHERE o.bucket_id='driver-cnh' AND o.name=v_driver.cnh_url
       ) THEN
      v_missing := array_append(v_missing, 'cnh_front');
    END IF;

    IF v_driver.cnh_back_url IS NULL
       OR split_part(v_driver.cnh_back_url,'/',1) <> v_driver_auth_user_id::text
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
         WHERE o.bucket_id='driver-cnh' AND o.name=v_driver.cnh_back_url
       ) THEN
      v_missing := array_append(v_missing, 'cnh_back');
    END IF;

    IF v_driver.vehicle_document_url IS NULL
       OR split_part(v_driver.vehicle_document_url,'/',1) <> v_driver_auth_user_id::text
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
         WHERE o.bucket_id='vehicle-documents' AND o.name=v_driver.vehicle_document_url
       ) THEN
      v_missing := array_append(v_missing, 'crlv');
    END IF;

    IF v_driver.vehicle_photo_url IS NULL
       OR split_part(v_driver.vehicle_photo_url,'/',1) <> v_driver_auth_user_id::text
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
         WHERE o.bucket_id='vehicle-documents' AND o.name=v_driver.vehicle_photo_url
       ) THEN
      v_missing := array_append(v_missing, 'vehicle_photo');
    END IF;

    IF cardinality(v_missing) > 0 THEN
      RAISE EXCEPTION 'driver_documents_incomplete:%', array_to_string(v_missing, ',')
        USING errcode='55000';
    END IF;
  END IF;

  UPDATE public.drivers
  SET approval_status=v_status,
      motivo_reprovacao=CASE
        WHEN v_status='reprovado' THEN nullif(left(trim(coalesce(_reason,'')),500),'')
        ELSE NULL
      END,
      documents_status=CASE
        WHEN v_status='aprovado' THEN 'approved'
        WHEN v_status='reprovado' THEN 'rejected'
        WHEN v_status='em_analise' THEN 'pending_review'
        ELSE documents_status
      END,
      approved_at=CASE WHEN v_status='aprovado' THEN now() ELSE NULL END,
      blocked_at=CASE WHEN v_status='bloqueado' THEN now() ELSE NULL END,
      is_online=CASE WHEN v_status='aprovado' THEN is_online ELSE false END,
      updated_at=now()
  WHERE id=_driver_id
  RETURNING * INTO v_driver;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_auth_user_id,
    'admin.driver.approval_status_changed',
    'driver',
    _driver_id::text,
    jsonb_build_object(
      'status', v_status,
      'reason', nullif(left(trim(coalesce(_reason,'')),500),''),
      'documents_status', v_driver.documents_status
    )
  );

  RETURN to_jsonb(v_driver);
END;
$function$;

ALTER FUNCTION public.admin_set_driver_approval(uuid, text, text) SECURITY DEFINER;
REVOKE ALL ON FUNCTION apois_rpc_private.admin_set_driver_approval(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apois_rpc_private.admin_set_driver_approval(uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_set_driver_approval(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_driver_approval(uuid, text, text) TO authenticated, service_role;
