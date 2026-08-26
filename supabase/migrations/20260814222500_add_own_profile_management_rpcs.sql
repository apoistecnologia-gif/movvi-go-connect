-- APOIS Corridas: authenticated clients have SELECT-only table access.
-- Route self-service profile changes through narrow RPCs so driver identity
-- edits cannot bypass the approval lifecycle and account deletion cannot occur
-- during an active ride.

create or replace function apois_rpc_private.update_own_profile(
  _name text,
  _phone text,
  _cpf text default null,
  _birth_date date default null,
  _gender text default null,
  _city text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_user public.users%rowtype;
  v_driver public.drivers%rowtype;
  v_name text := nullif(btrim(coalesce(_name,'')),'');
  v_phone text := regexp_replace(coalesce(_phone,''),'[^0-9]','','g');
  v_cpf text := nullif(regexp_replace(coalesce(_cpf,''),'[^0-9]','','g'),'');
  v_city text := nullif(btrim(coalesce(_city,'')),'');
  v_gender text := nullif(btrim(coalesce(_gender,'')),'');
  v_requires_review boolean := false;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if v_name is null or char_length(v_name) < 2 then raise exception 'invalid_name' using errcode='22023'; end if;
  if char_length(v_phone) < 10 or char_length(v_phone) > 14 then raise exception 'invalid_phone' using errcode='22023'; end if;
  if v_cpf is not null and not private.is_valid_cpf(v_cpf) then raise exception 'invalid_cpf' using errcode='22023'; end if;
  if _birth_date is not null and _birth_date > current_date then raise exception 'invalid_birth_date' using errcode='22023'; end if;
  if v_gender is not null and v_gender not in ('feminino','masculino','nao-binario','outro') then raise exception 'invalid_gender' using errcode='22023'; end if;

  select * into v_user
  from public.users u
  where u.auth_user_id=v_actor and u.deleted_at is null
  for update;
  if not found then raise exception 'profile_missing' using errcode='P0002'; end if;

  select * into v_driver
  from public.drivers d
  where d.user_id=v_user.id
  for update;

  if found then
    v_requires_review :=
      v_driver.name is distinct from v_name
      or regexp_replace(coalesce(v_driver.phone,''),'[^0-9]','','g') is distinct from v_phone
      or regexp_replace(coalesce(v_driver.cpf,''),'[^0-9]','','g') is distinct from coalesce(v_cpf,'')
      or v_driver.birth_date is distinct from _birth_date
      or coalesce(btrim(v_driver.city),'') is distinct from coalesce(v_city,'');
  end if;

  update public.users
  set name=v_name,
      phone=v_phone,
      cpf=v_cpf,
      birth_date=_birth_date,
      gender=v_gender,
      city=v_city,
      updated_at=now()
  where id=v_user.id;

  if v_driver.id is not null then
    update public.drivers
    set name=v_name,
        phone=v_phone,
        cpf=v_cpf,
        birth_date=_birth_date,
        city=v_city,
        approval_status=case when v_requires_review and approval_status='aprovado' then 'em_analise' else approval_status end,
        documents_status=case when v_requires_review and approval_status='aprovado' then 'pending_review' else documents_status end,
        approved_at=case when v_requires_review and approval_status='aprovado' then null else approved_at end,
        is_online=case when v_requires_review then false else is_online end,
        updated_at=now()
    where id=v_driver.id;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_actor,'profile.self_updated','user',v_user.id::text,jsonb_build_object('driver_profile',v_driver.id is not null,'driver_review_required',v_requires_review));

  return jsonb_build_object('ok',true,'user_id',v_user.id,'driver_review_required',v_requires_review);
end;
$function$;

create or replace function apois_rpc_private.clear_own_profile_photo()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_profile_id uuid;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select u.id into v_profile_id from public.users u where u.auth_user_id=v_actor and u.deleted_at is null for update;
  if v_profile_id is null then raise exception 'profile_missing' using errcode='P0002'; end if;
  update public.users set avatar_url=null,updated_at=now() where id=v_profile_id;
  update public.drivers set photo_url=null,updated_at=now() where user_id=v_profile_id;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function apois_rpc_private.request_own_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_profile_id uuid;
  v_driver_id uuid;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select u.id into v_profile_id from public.users u where u.auth_user_id=v_actor and u.deleted_at is null for update;
  if v_profile_id is null then raise exception 'profile_missing' using errcode='P0002'; end if;
  select d.id into v_driver_id from public.drivers d where d.user_id=v_profile_id limit 1;

  if exists(
    select 1 from public.rides r
    where (r.passenger_id=v_profile_id or (v_driver_id is not null and r.driver_id=v_driver_id))
      and r.status in ('aguardando_pagamento','solicitada','requested','buscando_motorista','searching','motorista_a_caminho','motorista_chegou','em_viagem','active','accepted','in_progress','started')
  ) then
    raise exception 'active_ride_blocks_account_deletion' using errcode='55000';
  end if;

  update public.drivers set is_online=false,updated_at=now() where user_id=v_profile_id;
  update public.users set deleted_at=now(),updated_at=now() where id=v_profile_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_actor,'profile.account_deletion_requested','user',v_profile_id::text,jsonb_build_object('driver_profile',v_driver_id is not null));

  return jsonb_build_object('ok',true);
end;
$function$;

revoke execute on function apois_rpc_private.update_own_profile(text,text,text,date,text,text) from public,anon,authenticated;
revoke execute on function apois_rpc_private.clear_own_profile_photo() from public,anon,authenticated;
revoke execute on function apois_rpc_private.request_own_account_deletion() from public,anon,authenticated;
grant execute on function apois_rpc_private.update_own_profile(text,text,text,date,text,text) to service_role;
grant execute on function apois_rpc_private.clear_own_profile_photo() to service_role;
grant execute on function apois_rpc_private.request_own_account_deletion() to service_role;

create or replace function public.update_own_profile(_name text,_phone text,_cpf text default null,_birth_date date default null,_gender text default null,_city text default null)
returns jsonb language sql security definer set search_path to '' as $function$
  select apois_rpc_private.update_own_profile($1,$2,$3,$4,$5,$6);
$function$;
create or replace function public.clear_own_profile_photo()
returns jsonb language sql security definer set search_path to '' as $function$
  select apois_rpc_private.clear_own_profile_photo();
$function$;
create or replace function public.request_own_account_deletion()
returns jsonb language sql security definer set search_path to '' as $function$
  select apois_rpc_private.request_own_account_deletion();
$function$;

revoke execute on function public.update_own_profile(text,text,text,date,text,text) from public,anon;
revoke execute on function public.clear_own_profile_photo() from public,anon;
revoke execute on function public.request_own_account_deletion() from public,anon;
grant execute on function public.update_own_profile(text,text,text,date,text,text) to authenticated,service_role;
grant execute on function public.clear_own_profile_photo() to authenticated,service_role;
grant execute on function public.request_own_account_deletion() to authenticated,service_role;
