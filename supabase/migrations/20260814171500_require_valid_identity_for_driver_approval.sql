create or replace function apois_rpc_private.admin_set_driver_approval(_driver_id uuid, _status text, _reason text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','storage','private','apois_rpc_private'
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_status text := lower(trim(coalesce(_status,'')));
  v_driver_auth_user_id uuid;
  v_missing text[] := array[]::text[];
begin
  if v_auth_user_id is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('users.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_status not in ('em_analise','aprovado','reprovado','bloqueado') then raise exception 'invalid_status' using errcode='22023'; end if;

  select * into v_driver from public.drivers where id=_driver_id for update;
  if not found then raise exception 'driver_not_found' using errcode='P0002'; end if;
  select u.auth_user_id into v_driver_auth_user_id from public.users u where u.id=v_driver.user_id;
  if v_driver_auth_user_id is null then raise exception 'driver_auth_identity_missing' using errcode='55000'; end if;

  if v_status='aprovado' then
    if v_driver.cpf is null or not private.is_valid_cpf(v_driver.cpf) then
      raise exception 'driver_identity_invalid:cpf' using errcode='55000';
    end if;
    if v_driver.birth_date is null or v_driver.birth_date > (current_date - interval '18 years')::date then
      raise exception 'driver_identity_invalid:birth_date' using errcode='55000';
    end if;

    if v_driver.selfie_url is null or split_part(v_driver.selfie_url,'/',1)<>v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='driver-selfies' and o.name=v_driver.selfie_url) then v_missing:=array_append(v_missing,'selfie'); end if;
    if v_driver.cnh_url is null or split_part(v_driver.cnh_url,'/',1)<>v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='driver-cnh' and o.name=v_driver.cnh_url) then v_missing:=array_append(v_missing,'cnh_front'); end if;
    if v_driver.cnh_back_url is null or split_part(v_driver.cnh_back_url,'/',1)<>v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='driver-cnh' and o.name=v_driver.cnh_back_url) then v_missing:=array_append(v_missing,'cnh_back'); end if;
    if v_driver.vehicle_document_url is null or split_part(v_driver.vehicle_document_url,'/',1)<>v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='vehicle-documents' and o.name=v_driver.vehicle_document_url) then v_missing:=array_append(v_missing,'crlv'); end if;
    if v_driver.vehicle_photo_url is null or split_part(v_driver.vehicle_photo_url,'/',1)<>v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='vehicle-documents' and o.name=v_driver.vehicle_photo_url) then v_missing:=array_append(v_missing,'vehicle_photo'); end if;
    if cardinality(v_missing)>0 then raise exception 'driver_documents_incomplete:%',array_to_string(v_missing,',') using errcode='55000'; end if;
  end if;

  update public.drivers
  set approval_status=v_status,
      motivo_reprovacao=case when v_status='reprovado' then nullif(left(trim(coalesce(_reason,'')),500),'') else null end,
      documents_status=case when v_status='aprovado' then 'approved' when v_status='reprovado' then 'rejected' when v_status='em_analise' then 'pending_review' else documents_status end,
      approved_at=case when v_status='aprovado' then now() else null end,
      blocked_at=case when v_status='bloqueado' then now() else null end,
      is_online=case when v_status='aprovado' then is_online else false end,
      updated_at=now()
  where id=_driver_id returning * into v_driver;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_auth_user_id,'admin.driver.approval_status_changed','driver',_driver_id::text,jsonb_build_object('status',v_status,'reason',nullif(left(trim(coalesce(_reason,'')),500),''),'documents_status',v_driver.documents_status));
  return to_jsonb(v_driver);
end;
$function$;

revoke execute on function apois_rpc_private.admin_set_driver_approval(uuid,text,text) from public, anon, authenticated;
grant execute on function apois_rpc_private.admin_set_driver_approval(uuid,text,text) to postgres, service_role;
