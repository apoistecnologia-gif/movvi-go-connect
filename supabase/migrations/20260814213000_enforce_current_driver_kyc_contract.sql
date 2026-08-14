-- APOIS Corridas: only the current registration contract (v3) may be called
-- by an authenticated client. Legacy registration RPCs do not contain the
-- address/income contract required by the current driver onboarding.
--
-- A reusable server-only readiness gate is also applied when a driver enters
-- the online state and when an administrator approves/reinstates a driver.

create or replace function private.driver_kyc_is_ready(_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.drivers d
    join public.users u on u.id = d.user_id
    where d.id = _driver_id
      and u.auth_user_id is not null
      and nullif(btrim(coalesce(d.name,'')),'') is not null
      and nullif(btrim(coalesce(d.email,'')),'') is not null
      and length(regexp_replace(coalesce(d.phone,''),'[^0-9]','','g')) >= 10
      and d.cpf is not null
      and private.is_valid_cpf(d.cpf)
      and d.birth_date is not null
      and d.birth_date <= (current_date - interval '18 years')::date
      and nullif(btrim(coalesce(d.city,'')),'') is not null
      and length(btrim(coalesce(d.state,''))) = 2
      and nullif(btrim(coalesce(d.address,'')),'') is not null
      and nullif(btrim(coalesce(d.address_number,'')),'') is not null
      and nullif(btrim(coalesce(d.province,'')),'') is not null
      and length(regexp_replace(coalesce(d.postal_code,''),'[^0-9]','','g')) = 8
      and d.declared_monthly_income is not null
      and d.declared_monthly_income > 0
      and d.category in ('carros','motos','fretes','guincho','envios')
      and nullif(btrim(coalesce(d.vehicle_model,'')),'') is not null
      and length(btrim(coalesce(d.vehicle_plate,''))) >= 6
      and nullif(btrim(coalesce(d.vehicle_color,'')),'') is not null
      and d.vehicle_year is not null
      and d.vehicle_year >= 1971
      and d.vehicle_year <= extract(year from now())::int + 1
      and d.selfie_url is not null
      and split_part(d.selfie_url,'/',1) = u.auth_user_id::text
      and exists (
        select 1 from storage.objects o
        where o.bucket_id='driver-selfies'
          and o.name=d.selfie_url
          and coalesce(o.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp')
      )
      and d.cnh_url is not null
      and split_part(d.cnh_url,'/',1) = u.auth_user_id::text
      and exists (
        select 1 from storage.objects o
        where o.bucket_id='driver-cnh'
          and o.name=d.cnh_url
          and coalesce(o.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp','application/pdf')
      )
      and d.cnh_back_url is not null
      and split_part(d.cnh_back_url,'/',1) = u.auth_user_id::text
      and exists (
        select 1 from storage.objects o
        where o.bucket_id='driver-cnh'
          and o.name=d.cnh_back_url
          and coalesce(o.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp','application/pdf')
      )
      and d.vehicle_document_url is not null
      and split_part(d.vehicle_document_url,'/',1) = u.auth_user_id::text
      and exists (
        select 1 from storage.objects o
        where o.bucket_id='vehicle-documents'
          and o.name=d.vehicle_document_url
          and coalesce(o.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp','application/pdf')
      )
      and d.vehicle_photo_url is not null
      and split_part(d.vehicle_photo_url,'/',1) = u.auth_user_id::text
      and exists (
        select 1 from storage.objects o
        where o.bucket_id='vehicle-documents'
          and o.name=d.vehicle_photo_url
          and coalesce(o.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp')
      )
  );
$function$;

revoke all on function private.driver_kyc_is_ready(uuid) from public, anon, authenticated;
grant execute on function private.driver_kyc_is_ready(uuid) to postgres, service_role;

-- Legacy client registration contracts are retained for schema/history
-- compatibility but are no longer callable by untrusted clients.
revoke execute on function public.driver_complete_registration(
  text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.driver_complete_registration(
  text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text
) to service_role;

revoke execute on function public.driver_complete_registration_v2(
  text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.driver_complete_registration_v2(
  text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text,text
) to service_role;

revoke execute on function apois_rpc_private.driver_complete_registration(
  text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function apois_rpc_private.driver_complete_registration(
  text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text
) to service_role;

revoke execute on function apois_rpc_private.driver_complete_registration_v2(
  text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function apois_rpc_private.driver_complete_registration_v2(
  text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text,text
) to service_role;

create or replace function apois_rpc_private.driver_set_presence(
  _online boolean,
  _lat numeric default null::numeric,
  _lng numeric default null::numeric,
  _heading numeric default null::numeric,
  _speed numeric default null::numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  v_profile_id := public.mobility_user_id();
  if v_profile_id is null then
    raise exception 'profile_missing';
  end if;

  select * into v_driver
  from public.drivers
  where user_id = v_profile_id
  for update;

  if not found then
    raise exception 'driver_profile_missing';
  end if;

  if coalesce(_online, false) then
    if v_driver.approval_status <> 'aprovado' then
      raise exception 'driver_not_approved';
    end if;

    if lower(coalesce(v_driver.subscription_status, '')) not in ('active', 'ativa') then
      raise exception 'driver_subscription_inactive';
    end if;

    -- Full KYC is checked when entering online. Existing online location pings
    -- remain lightweight because referenced evidence is immutable in Storage.
    if not coalesce(v_driver.is_online,false)
       and not private.driver_kyc_is_ready(v_driver.id) then
      raise exception 'driver_kyc_incomplete' using errcode='42501';
    end if;

    if _lat is null or _lng is null
       or _lat < -90 or _lat > 90
       or _lng < -180 or _lng > 180 then
      raise exception 'invalid_location';
    end if;
  end if;

  update public.drivers
  set
    is_online = coalesce(_online, false),
    current_lat = case when coalesce(_online, false) then _lat else current_lat end,
    current_lng = case when coalesce(_online, false) then _lng else current_lng end,
    current_heading = case when coalesce(_online, false) then _heading else current_heading end,
    current_speed = case when coalesce(_online, false) then _speed else current_speed end,
    last_location_at = case when coalesce(_online, false) then now() else last_location_at end,
    updated_at = now()
  where id = v_driver.id
  returning * into v_driver;

  return to_jsonb(v_driver);
end;
$function$;

create or replace function apois_rpc_private.admin_set_driver_approval(
  _driver_id uuid,
  _status text,
  _reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'storage', 'private', 'apois_rpc_private'
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

  if v_driver.approval_status='suspenso' and v_status='aprovado' then
    raise exception 'driver_suspension_requires_unsuspend_flow' using errcode='42501';
  end if;

  select u.auth_user_id into v_driver_auth_user_id from public.users u where u.id=v_driver.user_id;
  if v_driver_auth_user_id is null then raise exception 'driver_auth_identity_missing' using errcode='55000'; end if;

  if v_status='aprovado' then
    if not private.driver_kyc_is_ready(_driver_id) then
      raise exception 'driver_kyc_incomplete' using errcode='55000';
    end if;
    if v_driver.cpf is null or not private.is_valid_cpf(v_driver.cpf) then raise exception 'driver_identity_invalid:cpf' using errcode='55000'; end if;
    if v_driver.birth_date is null or v_driver.birth_date > (current_date - interval '18 years')::date then raise exception 'driver_identity_invalid:birth_date' using errcode='55000'; end if;
    if v_driver.selfie_url is null or split_part(v_driver.selfie_url,'/',1)<>v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='driver-selfies' and o.name=v_driver.selfie_url) then v_missing:=array_append(v_missing,'selfie'); end if;
    if v_driver.cnh_url is null or split_part(v_driver.cnh_url,'/',1)<>v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='driver-cnh' and o.name=v_driver.cnh_url) then v_missing:=array_append(v_missing,'cnh_front'); end if;
    if v_driver.cnh_back_url is null or split_part(v_driver.cnh_back_url,'/',1)<>v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='driver-cnh' and o.name=v_driver.cnh_back_url) then v_missing:=array_append(v_missing,'cnh_back'); end if;
    if v_driver.vehicle_document_url is null or split_part(v_driver.vehicle_document_url,'/',1)<>v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='vehicle-documents' and o.name=v_driver.vehicle_document_url) then v_missing:=array_append(v_missing,'crlv'); end if;
    if v_driver.vehicle_photo_url is null or split_part(v_driver.vehicle_photo_url,'/',1)<>v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='vehicle-documents' and o.name=v_driver.vehicle_photo_url) then v_missing:=array_append(v_missing,'vehicle_photo'); end if;
    if cardinality(v_missing)>0 then raise exception 'driver_documents_incomplete:%',array_to_string(v_missing,',') using errcode='55000'; end if;
  end if;

  update public.drivers set approval_status=v_status,motivo_reprovacao=case when v_status='reprovado' then nullif(left(trim(coalesce(_reason,'')),500),'') else null end,documents_status=case when v_status='aprovado' then 'approved' when v_status='reprovado' then 'rejected' when v_status='em_analise' then 'pending_review' else documents_status end,approved_at=case when v_status='aprovado' then now() else null end,blocked_at=case when v_status='bloqueado' then now() else null end,is_online=case when v_status='aprovado' then is_online else false end,updated_at=now() where id=_driver_id returning * into v_driver;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(v_auth_user_id,'admin.driver.approval_status_changed','driver',_driver_id::text,jsonb_build_object('status',v_status,'reason',nullif(left(trim(coalesce(_reason,'')),500),''),'documents_status',v_driver.documents_status));
  return to_jsonb(v_driver);
end;
$function$;

create or replace function apois_rpc_private.admin_set_driver_suspension(
  _driver_id uuid,
  _suspended boolean,
  _reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_before public.drivers%rowtype;
  v_after public.drivers%rowtype;
  v_driver_auth_user_id uuid;
  v_missing text[] := array[]::text[];
begin
  if v_auth_user_id is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if not private.has_permission('users.manage') then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_before from public.drivers where id = _driver_id for update;
  if not found then raise exception 'driver_not_found' using errcode = 'P0002'; end if;

  if _suspended then
    if v_before.approval_status not in ('aprovado','suspenso') then raise exception 'invalid_driver_suspension_state' using errcode = '55000'; end if;
    update public.drivers set approval_status='suspenso',suspended_at=coalesce(suspended_at,now()),is_online=false,updated_at=now() where id=_driver_id returning * into v_after;
  else
    if v_before.approval_status <> 'suspenso' then raise exception 'driver_not_suspended' using errcode = '55000'; end if;
    if not private.driver_kyc_is_ready(_driver_id) then raise exception 'driver_kyc_incomplete' using errcode='55000'; end if;

    select u.auth_user_id into v_driver_auth_user_id from public.users u where u.id=v_before.user_id;
    if v_driver_auth_user_id is null then raise exception 'driver_auth_identity_missing' using errcode = '55000'; end if;
    if v_before.cpf is null or not private.is_valid_cpf(v_before.cpf) then raise exception 'driver_identity_invalid:cpf' using errcode = '55000'; end if;
    if v_before.birth_date is null or v_before.birth_date > (current_date - interval '18 years')::date then raise exception 'driver_identity_invalid:birth_date' using errcode = '55000'; end if;
    if v_before.selfie_url is null or split_part(v_before.selfie_url,'/',1) <> v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='driver-selfies' and o.name=v_before.selfie_url) then v_missing := array_append(v_missing,'selfie'); end if;
    if v_before.cnh_url is null or split_part(v_before.cnh_url,'/',1) <> v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='driver-cnh' and o.name=v_before.cnh_url) then v_missing := array_append(v_missing,'cnh_front'); end if;
    if v_before.cnh_back_url is null or split_part(v_before.cnh_back_url,'/',1) <> v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='driver-cnh' and o.name=v_before.cnh_back_url) then v_missing := array_append(v_missing,'cnh_back'); end if;
    if v_before.vehicle_document_url is null or split_part(v_before.vehicle_document_url,'/',1) <> v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='vehicle-documents' and o.name=v_before.vehicle_document_url) then v_missing := array_append(v_missing,'crlv'); end if;
    if v_before.vehicle_photo_url is null or split_part(v_before.vehicle_photo_url,'/',1) <> v_driver_auth_user_id::text or not exists(select 1 from storage.objects o where o.bucket_id='vehicle-documents' and o.name=v_before.vehicle_photo_url) then v_missing := array_append(v_missing,'vehicle_photo'); end if;
    if cardinality(v_missing) > 0 then raise exception 'driver_documents_incomplete:%', array_to_string(v_missing,',') using errcode = '55000'; end if;

    update public.drivers set approval_status='aprovado',documents_status='approved',approved_at=coalesce(approved_at,now()),suspended_at=null,is_online=false,updated_at=now() where id=_driver_id returning * into v_after;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(v_auth_user_id,'admin.driver.suspension_changed','driver',_driver_id::text,jsonb_build_object('suspended',_suspended,'reason',nullif(left(btrim(coalesce(_reason,'')),500),''),'previous_status',v_before.approval_status,'new_status',v_after.approval_status));
  return jsonb_build_object('id',v_after.id,'approval_status',v_after.approval_status,'suspended_at',v_after.suspended_at,'is_online',v_after.is_online,'reason',nullif(left(btrim(coalesce(_reason,'')),500),''));
end;
$function$;
