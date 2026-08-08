-- APOIS CORRIDAS — CANONICAL BASELINE 002
-- Functions captured/normalized from the live project on 2026-08-08.

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path to '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.has_permission(required_permission text)
returns boolean language sql stable security definer set search_path to '' as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role = p.role
    where p.user_id = (select auth.uid())
      and p.active
      and rp.permission = required_permission
  );
$$;

create or replace function private.capture_content_version()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  next_version integer;
  event_kind text;
  target_id uuid;
  document jsonb;
begin
  target_id := coalesce(new.id, old.id);
  document := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.content_versions where document_id = target_id;
  event_kind := case
    when tg_op = 'INSERT' then 'create'
    when tg_op = 'DELETE' then 'delete'
    when old.status <> new.status and new.status = 'published' then 'publish'
    when old.status = 'published' and new.status <> 'published' then 'unpublish'
    when old.status <> new.status and new.status = 'scheduled' then 'schedule'
    else 'update'
  end;
  insert into public.content_versions(document_id,version_number,snapshot,change_kind,actor_id)
  values(target_id,next_version,document,event_kind,(select auth.uid()));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values((select auth.uid()),event_kind,'content_document',target_id::text,jsonb_build_object('version',next_version));
  return coalesce(new,old);
end;
$$;

create or replace function public.mobility_user_id()
returns uuid language sql stable set search_path to 'public','auth' as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.deleted_at is null
  limit 1;
$$;

create or replace function public.admin_is_authorized()
returns boolean language sql stable security definer set search_path to '' as $$
  select private.has_permission('users.manage');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'pg_catalog','public','auth' as $$
declare
  requested_role text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'role', '')));
  mobility_id uuid;
  display_name text := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuário'
  ), 160);
  normalized_phone text := nullif(left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[^0-9]', '', 'g'), 15), '');
  accepted_terms boolean := lower(coalesce(new.raw_user_meta_data ->> 'terms_accepted', 'false')) = 'true';
  accepted_privacy boolean := lower(coalesce(new.raw_user_meta_data ->> 'privacy_accepted', 'false')) = 'true';
  accepted_terms_version text := nullif(left(btrim(new.raw_user_meta_data ->> 'terms_version'), 40), '');
  accepted_privacy_version text := nullif(left(btrim(new.raw_user_meta_data ->> 'privacy_version'), 40), '');
  acceptance_source text := nullif(left(btrim(new.raw_user_meta_data ->> 'legal_acceptance_source'), 80), '');
begin
  if requested_role in ('passenger','driver') then
    if requested_role='passenger' and (
      not accepted_terms or not accepted_privacy
      or accepted_terms_version is null or accepted_privacy_version is null
      or acceptance_source is distinct from 'passenger_signup'
    ) then
      raise exception 'passenger_legal_acceptance_required' using errcode='22023';
    end if;

    insert into public.users(
      auth_user_id,name,email,phone,
      terms_accepted_at,terms_version,privacy_accepted_at,privacy_version,legal_acceptance_source
    ) values (
      new.id,display_name,nullif(lower(btrim(coalesce(new.email,''))),''),normalized_phone,
      case when accepted_terms and accepted_terms_version is not null then now() end,
      case when accepted_terms then accepted_terms_version end,
      case when accepted_privacy and accepted_privacy_version is not null then now() end,
      case when accepted_privacy then accepted_privacy_version end,
      case when accepted_terms and accepted_privacy then acceptance_source end
    )
    on conflict(auth_user_id) do update set
      name=excluded.name,
      email=excluded.email,
      phone=coalesce(excluded.phone,public.users.phone),
      terms_accepted_at=coalesce(public.users.terms_accepted_at,excluded.terms_accepted_at),
      terms_version=coalesce(excluded.terms_version,public.users.terms_version),
      privacy_accepted_at=coalesce(public.users.privacy_accepted_at,excluded.privacy_accepted_at),
      privacy_version=coalesce(excluded.privacy_version,public.users.privacy_version),
      legal_acceptance_source=coalesce(excluded.legal_acceptance_source,public.users.legal_acceptance_source),
      deleted_at=null,
      updated_at=now()
    returning id into mobility_id;

    if mobility_id is null then raise exception 'mobility_profile_not_created' using errcode='P0001'; end if;
    insert into public.user_roles(user_id,role) values(mobility_id,requested_role)
      on conflict(user_id,role) do nothing;
    if requested_role='passenger' then
      insert into public.passenger_wallets(passenger_id) values(mobility_id) on conflict(passenger_id) do nothing;
      insert into public.user_notification_preferences(user_id) values(mobility_id) on conflict(user_id) do nothing;
    end if;
  else
    -- Baseline does not grant administrator by e-mail. Admin roles must be provisioned explicitly.
    insert into public.profiles(user_id,email,display_name,role)
    values(new.id,coalesce(lower(btrim(new.email)),''),display_name,'reader'::public.app_role)
    on conflict(user_id) do update set email=excluded.email,display_name=excluded.display_name;
  end if;
  return new;
end;
$$;

create or replace function public.register_notification_token(
  _token text,_platform text,_device_id text default null,_permission_status text default 'granted'
) returns uuid language plpgsql security definer set search_path to 'pg_catalog','public','auth' as $$
declare
  profile_id uuid;
  token_id uuid;
  clean_token text := btrim(coalesce(_token,''));
  clean_platform text := lower(btrim(coalesce(_platform,'')));
  clean_device_id text := nullif(left(btrim(coalesce(_device_id,'')),200),'');
  clean_permission text := lower(btrim(coalesce(_permission_status,'granted')));
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if length(clean_token)<20 or length(clean_token)>4096 then raise exception 'invalid_notification_token' using errcode='22023'; end if;
  if clean_platform not in ('android','ios','web') then raise exception 'invalid_notification_platform' using errcode='22023'; end if;
  if clean_permission not in ('granted','provisional') then raise exception 'invalid_notification_permission' using errcode='22023'; end if;

  select profile.id into profile_id
  from public.users profile
  where profile.auth_user_id=auth.uid() and profile.deleted_at is null
  limit 1;
  if profile_id is null then raise exception 'mobility_profile_missing' using errcode='P0002'; end if;

  if clean_device_id is not null then
    update public.user_notification_tokens set is_active=false,updated_at=now()
    where platform=clean_platform and device_id=clean_device_id and token<>clean_token and is_active=true;
  end if;

  insert into public.user_notification_tokens(user_id,token,platform,device_id,permission_status,is_active,last_used_at,updated_at)
  values(profile_id,clean_token,clean_platform,clean_device_id,clean_permission,true,now(),now())
  on conflict(token) do update set
    user_id=excluded.user_id,platform=excluded.platform,device_id=excluded.device_id,
    permission_status=excluded.permission_status,is_active=true,last_used_at=now(),updated_at=now()
  returning id into token_id;
  return token_id;
end;
$$;

create or replace function public.deactivate_notification_token(_token text)
returns boolean language plpgsql security definer set search_path to 'pg_catalog','public','auth' as $$
declare profile_id uuid; affected integer:=0; clean_token text:=btrim(coalesce(_token,''));
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if clean_token='' then return false; end if;
  select id into profile_id from public.users where auth_user_id=auth.uid() and deleted_at is null limit 1;
  if profile_id is null then return false; end if;
  update public.user_notification_tokens set is_active=false,updated_at=now()
  where user_id=profile_id and token=clean_token and is_active=true;
  get diagnostics affected=row_count;
  return affected>0;
end;
$$;

create or replace function public.driver_get_profile()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_profile_id uuid; v_driver public.drivers%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  v_profile_id:=public.mobility_user_id();
  if v_profile_id is null then raise exception 'profile_missing'; end if;
  select * into v_driver from public.drivers where user_id=v_profile_id limit 1;
  if not found then return null; end if;
  return to_jsonb(v_driver);
end;
$$;

create or replace function public.driver_bootstrap_profile(_category text,_vehicle_model text,_vehicle_plate text,_vehicle_color text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_profile public.users%rowtype; v_driver public.drivers%rowtype; v_category text:=lower(trim(coalesce(_category,'')));
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if v_category not in ('carros','motos','fretes','guincho','envios') then raise exception 'invalid_category'; end if;
  select * into v_profile from public.users where auth_user_id=auth.uid() and deleted_at is null limit 1;
  if not found then raise exception 'profile_missing'; end if;
  select * into v_driver from public.drivers where user_id=v_profile.id limit 1;
  if found then return to_jsonb(v_driver); end if;
  insert into public.drivers(user_id,name,email,phone,category,vehicle_model,vehicle_plate,vehicle_color,approval_status,subscription_status,is_online,created_at,updated_at)
  values(v_profile.id,coalesce(v_profile.name,v_profile.email,'Motorista APOIS'),v_profile.email,v_profile.phone,v_category,
    nullif(trim(coalesce(_vehicle_model,'')),''),upper(nullif(trim(coalesce(_vehicle_plate,'')),'')),nullif(trim(coalesce(_vehicle_color,'')),''),
    'pendente','teste',false,now(),now()) returning * into v_driver;
  insert into public.user_roles(user_id,role) values(v_profile.id,'driver') on conflict(user_id,role) do nothing;
  return to_jsonb(v_driver);
end;
$$;

create or replace function public.driver_complete_registration_v2(
  _name text,_phone text,_cpf text,_birth_date date,_city text,_state text,_category text,
  _vehicle_model text,_vehicle_plate text,_vehicle_color text,_vehicle_year integer,
  _selfie_path text,_cnh_path text,_cnh_back_path text,_vehicle_document_path text,_vehicle_photo_path text,
  _photo_path text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_user public.users%rowtype;
  v_driver public.drivers%rowtype;
  v_category text:=lower(trim(coalesce(_category,'')));
  v_prefix text:=auth.uid()::text||'/';
  v_cpf text:=regexp_replace(coalesce(_cpf,''),'[^0-9]','','g');
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if v_category not in ('carros','motos','fretes','guincho','envios') then raise exception 'invalid_category' using errcode='22023'; end if;
  if nullif(trim(coalesce(_name,'')),'') is null then raise exception 'name_required' using errcode='22023'; end if;
  if length(v_cpf)<>11 then raise exception 'invalid_cpf' using errcode='22023'; end if;
  if _vehicle_year is null or _vehicle_year<1971 or _vehicle_year>extract(year from now())::int+1 then raise exception 'invalid_vehicle_year' using errcode='22023'; end if;
  if _selfie_path is null or left(_selfie_path,length(v_prefix))<>v_prefix
     or _cnh_path is null or left(_cnh_path,length(v_prefix))<>v_prefix
     or _cnh_back_path is null or left(_cnh_back_path,length(v_prefix))<>v_prefix
     or _vehicle_document_path is null or left(_vehicle_document_path,length(v_prefix))<>v_prefix
     or _vehicle_photo_path is null or left(_vehicle_photo_path,length(v_prefix))<>v_prefix
     or (_photo_path is not null and left(_photo_path,length(v_prefix))<>v_prefix) then
    raise exception 'invalid_document_path' using errcode='22023';
  end if;

  select * into v_user from public.users where auth_user_id=auth.uid() and deleted_at is null limit 1;
  if not found then raise exception 'profile_missing'; end if;
  update public.users set
    name=left(trim(_name),160),phone=nullif(left(regexp_replace(coalesce(_phone,''),'[^0-9]','','g'),15),''),
    cpf=v_cpf,birth_date=_birth_date,city=nullif(left(trim(coalesce(_city,'')),120),''),
    avatar_url=coalesce(_photo_path,_selfie_path),updated_at=now()
  where id=v_user.id returning * into v_user;
  insert into public.user_roles(user_id,role) values(v_user.id,'driver') on conflict(user_id,role) do nothing;

  insert into public.drivers(
    user_id,name,email,phone,cpf,birth_date,city,state,category,vehicle_model,vehicle_plate,vehicle_color,vehicle_year,
    selfie_url,cnh_url,cnh_back_url,vehicle_document_url,vehicle_photo_url,photo_url,
    approval_status,documents_status,subscription_status,is_online,updated_at
  ) values (
    v_user.id,left(trim(_name),160),v_user.email,v_user.phone,v_user.cpf,_birth_date,nullif(left(trim(coalesce(_city,'')),120),''),
    upper(left(trim(coalesce(_state,'')),2)),v_category,nullif(left(trim(coalesce(_vehicle_model,'')),120),''),
    upper(nullif(left(trim(coalesce(_vehicle_plate,'')),10),'')),nullif(left(trim(coalesce(_vehicle_color,'')),60),''),_vehicle_year,
    _selfie_path,_cnh_path,_cnh_back_path,_vehicle_document_path,_vehicle_photo_path,coalesce(_photo_path,_selfie_path),
    'em_analise','pending_review','teste',false,now()
  ) on conflict(user_id) do update set
    name=excluded.name,email=excluded.email,phone=excluded.phone,cpf=excluded.cpf,birth_date=excluded.birth_date,
    city=excluded.city,state=excluded.state,category=excluded.category,vehicle_model=excluded.vehicle_model,
    vehicle_plate=excluded.vehicle_plate,vehicle_color=excluded.vehicle_color,vehicle_year=excluded.vehicle_year,
    selfie_url=excluded.selfie_url,cnh_url=excluded.cnh_url,cnh_back_url=excluded.cnh_back_url,
    vehicle_document_url=excluded.vehicle_document_url,vehicle_photo_url=excluded.vehicle_photo_url,photo_url=excluded.photo_url,
    approval_status='em_analise',documents_status='pending_review',is_online=false,motivo_reprovacao=null,updated_at=now()
  returning * into v_driver;
  return to_jsonb(v_driver);
end;
$$;

create or replace function public.admin_set_driver_approval(_driver_id uuid,_status text,_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_driver public.drivers%rowtype; v_status text:=lower(trim(coalesce(_status,'')));
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('users.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_status not in ('em_analise','aprovado','reprovado','bloqueado') then raise exception 'invalid_status' using errcode='22023'; end if;
  if v_status='aprovado' and exists(
    select 1 from public.drivers d where d.id=_driver_id and
      (d.selfie_url is null or d.cnh_url is null or d.cnh_back_url is null or d.vehicle_document_url is null)
  ) then raise exception 'required_documents_missing' using errcode='22023'; end if;
  update public.drivers set
    approval_status=v_status,
    motivo_reprovacao=case when v_status='reprovado' then nullif(left(trim(coalesce(_reason,'')),500),'') else null end,
    documents_status=case when v_status='aprovado' then 'approved' when v_status='reprovado' then 'rejected' else documents_status end,
    approved_at=case when v_status='aprovado' then now() else approved_at end,
    blocked_at=case when v_status='bloqueado' then now() else null end,
    is_online=case when v_status='aprovado' then is_online else false end,
    updated_at=now()
  where id=_driver_id returning * into v_driver;
  if not found then raise exception 'driver_not_found'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'driver.approval.changed','driver',_driver_id::text,jsonb_build_object('status',v_status,'reason',_reason));
  return to_jsonb(v_driver);
end;
$$;

create or replace function public.driver_set_presence(_online boolean,_lat numeric default null,_lng numeric default null,_heading numeric default null,_speed numeric default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_profile_id uuid; v_driver public.drivers%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  v_profile_id:=public.mobility_user_id(); if v_profile_id is null then raise exception 'profile_missing'; end if;
  select * into v_driver from public.drivers where user_id=v_profile_id for update;
  if not found then raise exception 'driver_profile_missing'; end if;
  if v_driver.approval_status<>'aprovado' then raise exception 'driver_not_approved'; end if;
  if lower(coalesce(v_driver.subscription_status,'')) not in ('active','ativa','teste') then raise exception 'driver_subscription_inactive'; end if;
  if coalesce(_online,false) and (_lat is null or _lng is null or _lat<-90 or _lat>90 or _lng<-180 or _lng>180) then raise exception 'invalid_location'; end if;
  update public.drivers set
    is_online=coalesce(_online,false),
    current_lat=case when coalesce(_online,false) then _lat else current_lat end,
    current_lng=case when coalesce(_online,false) then _lng else current_lng end,
    current_heading=case when coalesce(_online,false) then _heading else current_heading end,
    current_speed=case when coalesce(_online,false) then _speed else current_speed end,
    last_location_at=case when coalesce(_online,false) then now() else last_location_at end,
    updated_at=now()
  where id=v_driver.id returning * into v_driver;
  return to_jsonb(v_driver);
end;
$$;

create or replace function public.driver_accept_ride(_ride_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_profile_id uuid; v_driver public.drivers%rowtype; v_ride public.rides%rowtype; v_current public.rides%rowtype;
  v_radius_km numeric:=5; v_distance_km numeric;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  v_profile_id:=public.mobility_user_id();
  select * into v_driver from public.drivers where user_id=v_profile_id for update;
  if not found then raise exception 'driver_profile_missing'; end if;
  if v_driver.approval_status<>'aprovado' then raise exception 'driver_not_approved'; end if;
  if lower(coalesce(v_driver.subscription_status,'')) not in ('active','ativa','teste') then raise exception 'driver_subscription_inactive'; end if;
  if not v_driver.is_online then raise exception 'driver_offline'; end if;
  if v_driver.last_location_at is null or v_driver.last_location_at < now()-interval '120 seconds' then raise exception 'driver_location_stale'; end if;

  select * into v_ride from public.rides where id=_ride_id for update;
  if not found or v_ride.status<>'procurar_motorista' or v_ride.driver_id is not null
    or not(v_profile_id=any(coalesce(v_ride.candidate_driver_ids,'{}'::uuid[])))
    or v_profile_id=any(coalesce(v_ride.rejected_driver_ids,'{}'::uuid[]))
    or (v_ride.request_expires_at is not null and v_ride.request_expires_at<=now())
  then raise exception 'ride_offer_unavailable'; end if;

  select * into v_current from public.rides
  where driver_id=v_driver.id and status in ('motorista_a_caminho','motorista_chegou','em_viagem') and id<>_ride_id
  order by created_at desc limit 1 for update;
  if found and v_current.status in ('motorista_a_caminho','motorista_chegou') then raise exception 'driver_busy'; end if;

  if found and v_current.status='em_viagem' then
    if exists(select 1 from public.rides q where q.driver_id=v_driver.id and q.status='procurar_motorista' and q.queued_after_ride_id is not null and q.id<>_ride_id)
      then raise exception 'next_ride_already_reserved'; end if;
    if v_current.destination_lat is null or v_current.destination_lng is null or v_ride.origin_lat is null or v_ride.origin_lng is null
      then raise exception 'next_ride_location_unavailable'; end if;
    begin
      select coalesce((value #>> '{}')::numeric,5) into v_radius_km from public.app_settings where key='ride.next_offer_max_distance_km';
    exception when others then v_radius_km:=5; end;
    v_radius_km:=greatest(0.5,least(coalesce(v_radius_km,5),20));
    v_distance_km:=6371*acos(least(1,greatest(-1,
      cos(radians(v_ride.origin_lat::double precision))*cos(radians(v_current.destination_lat::double precision))*
      cos(radians(v_current.destination_lng::double precision)-radians(v_ride.origin_lng::double precision))+
      sin(radians(v_ride.origin_lat::double precision))*sin(radians(v_current.destination_lat::double precision))
    )));
    if v_distance_km>v_radius_km then raise exception 'next_ride_not_nearby'; end if;
    update public.rides set
      driver_id=v_driver.id,accepted_driver_id=v_driver.id,queued_after_ride_id=v_current.id,queued_at=now(),
      request_expires_at=null,search_expires_at=null,current_offer_driver_id=null,
      driver_name=v_driver.name,driver_photo=v_driver.photo_url,driver_phone=v_driver.phone,
      driver_vehicle_model=v_driver.vehicle_model,driver_vehicle_color=v_driver.vehicle_color,driver_vehicle_plate=v_driver.vehicle_plate,
      driver_rating=v_driver.rating,updated_at=now()
    where id=_ride_id and status='procurar_motorista' and driver_id is null returning * into v_ride;
    if not found then raise exception 'ride_offer_unavailable'; end if;
    return to_jsonb(v_ride);
  end if;

  update public.rides set
    status='motorista_a_caminho',driver_id=v_driver.id,accepted_driver_id=v_driver.id,accepted_at=now(),
    current_offer_driver_id=null,request_expires_at=null,search_expires_at=null,
    security_code=coalesce(security_code,lpad((floor(random()*10000))::int::text,4,'0')),
    driver_name=v_driver.name,driver_photo=v_driver.photo_url,driver_phone=v_driver.phone,
    driver_vehicle_model=v_driver.vehicle_model,driver_vehicle_color=v_driver.vehicle_color,driver_vehicle_plate=v_driver.vehicle_plate,
    driver_rating=v_driver.rating,driver_latitude=v_driver.current_lat,driver_longitude=v_driver.current_lng,driver_heading=v_driver.current_heading,
    updated_at=now()
  where id=_ride_id and status='procurar_motorista' and driver_id is null returning * into v_ride;
  if not found then raise exception 'ride_offer_unavailable'; end if;
  return to_jsonb(v_ride);
end;
$$;

create or replace function public.driver_reject_ride(_ride_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_profile_id uuid; v_ride public.rides%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  v_profile_id:=public.mobility_user_id();
  update public.rides set
    rejected_driver_ids=array_append(array_remove(rejected_driver_ids,v_profile_id),v_profile_id),
    candidate_driver_ids=array_remove(candidate_driver_ids,v_profile_id),
    offered_driver_ids=array_remove(offered_driver_ids,v_profile_id),updated_at=now()
  where id=_ride_id and status='procurar_motorista' and v_profile_id=any(candidate_driver_ids) returning * into v_ride;
  if not found then raise exception 'ride_offer_unavailable'; end if;
  return to_jsonb(v_ride);
end;
$$;

create or replace function public.driver_mark_arrived(_ride_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_driver_id uuid; v_ride public.rides%rowtype;
begin
  select id into v_driver_id from public.drivers where user_id=public.mobility_user_id();
  if v_driver_id is null then raise exception 'driver_profile_missing'; end if;
  update public.rides set status='motorista_chegou',driver_arrived_at=now(),updated_at=now()
  where id=_ride_id and driver_id=v_driver_id and status='motorista_a_caminho' returning * into v_ride;
  if not found then raise exception 'invalid_ride_transition'; end if;
  return to_jsonb(v_ride);
end;
$$;

create or replace function public.driver_start_ride(_ride_id uuid,_security_code text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_driver_id uuid; v_ride public.rides%rowtype;
begin
  select id into v_driver_id from public.drivers where user_id=public.mobility_user_id();
  if v_driver_id is null then raise exception 'driver_profile_missing'; end if;
  update public.rides set status='em_viagem',started_at=now(),updated_at=now()
  where id=_ride_id and driver_id=v_driver_id and status='motorista_chegou' and security_code=trim(coalesce(_security_code,''))
  returning * into v_ride;
  if not found then raise exception 'invalid_security_code_or_transition'; end if;
  return to_jsonb(v_ride);
end;
$$;

create or replace function public.driver_finish_ride(_ride_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_driver public.drivers%rowtype; v_ride public.rides%rowtype; v_next public.rides%rowtype;
begin
  select * into v_driver from public.drivers where user_id=public.mobility_user_id() for update;
  if not found then raise exception 'driver_profile_missing'; end if;
  update public.rides set status='finalizada',final_price=coalesce(final_price,estimated_price),completed_at=now(),updated_at=now()
  where id=_ride_id and driver_id=v_driver.id and status='em_viagem' returning * into v_ride;
  if not found then raise exception 'invalid_ride_transition'; end if;
  select * into v_next from public.rides
  where driver_id=v_driver.id and accepted_driver_id=v_driver.id and queued_after_ride_id=_ride_id and status='procurar_motorista'
  order by queued_at asc nulls last,created_at asc limit 1 for update;
  if found then
    update public.rides set status='motorista_a_caminho',accepted_at=now(),queued_after_ride_id=null,
      request_expires_at=null,search_expires_at=null,
      security_code=coalesce(security_code,lpad((floor(random()*10000))::int::text,4,'0')),
      driver_latitude=v_driver.current_lat,driver_longitude=v_driver.current_lng,driver_heading=v_driver.current_heading,updated_at=now()
    where id=v_next.id;
  end if;
  return to_jsonb(v_ride);
end;
$$;

create or replace function public.driver_cancel_ride(_ride_id uuid,_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_driver_id uuid; v_ride public.rides%rowtype;
begin
  select id into v_driver_id from public.drivers where user_id=public.mobility_user_id();
  if v_driver_id is null then raise exception 'driver_profile_missing'; end if;
  update public.rides set status='cancelada_motorista',
    cancellation_reason=coalesce(nullif(left(trim(coalesce(_reason,'')),500),''),'Cancelada pelo motorista'),
    cancelled_by='driver',cancelled_at=now(),updated_at=now()
  where id=_ride_id and driver_id=v_driver_id and status in ('motorista_a_caminho','motorista_chegou') returning * into v_ride;
  if not found then raise exception 'invalid_ride_transition'; end if;
  return to_jsonb(v_ride);
end;
$$;

create or replace function public.driver_rate_passenger(_ride_id uuid,_stars integer,_comment text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_driver_id uuid; v_ride public.rides%rowtype; v_avg numeric; v_count integer;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if _stars is null or _stars<1 or _stars>5 then raise exception 'invalid_rating' using errcode='22023'; end if;
  select id into v_driver_id from public.drivers where user_id=public.mobility_user_id();
  if v_driver_id is null then raise exception 'driver_profile_missing'; end if;
  update public.rides set passenger_rating=_stars,passenger_rating_comment=nullif(left(trim(coalesce(_comment,'')),500),''),
    driver_rated_at=now(),updated_at=now()
  where id=_ride_id and driver_id=v_driver_id and status='finalizada' and driver_rated_at is null returning * into v_ride;
  if not found then raise exception 'rating_unavailable'; end if;
  select round(avg(r.passenger_rating)::numeric,2),count(*)::integer into v_avg,v_count
  from public.rides r where r.passenger_id=v_ride.passenger_id and r.passenger_rating is not null;
  update public.users set average_rating=coalesce(v_avg,5.00),total_ratings=coalesce(v_count,0),updated_at=now()
  where id=v_ride.passenger_id;
  return to_jsonb(v_ride);
end;
$$;

create or replace function public.sync_driver_presence_to_active_rides()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.current_lat is distinct from old.current_lat
     or new.current_lng is distinct from old.current_lng
     or new.current_heading is distinct from old.current_heading
     or new.last_location_at is distinct from old.last_location_at then
    update public.rides set driver_latitude=new.current_lat,driver_longitude=new.current_lng,
      driver_heading=new.current_heading,updated_at=now()
    where driver_id=new.id and status in ('motorista_a_caminho','motorista_chegou','em_viagem');
  end if;
  return new;
end;
$$;

create or replace function public.get_ride_cancellation_policy()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_free_minutes numeric; v_fee_amount numeric;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select case when (value #>> '{}') ~ '^[0-9]+([.][0-9]+)?$' then (value #>> '{}')::numeric end
    into v_free_minutes from public.app_settings where key='ride.cancellation_free_minutes';
  select case when (value #>> '{}') ~ '^[0-9]+([.][0-9]+)?$' then (value #>> '{}')::numeric end
    into v_fee_amount from public.app_settings where key='ride.cancellation_fee_amount';
  v_free_minutes:=coalesce(v_free_minutes,2); v_fee_amount:=coalesce(v_fee_amount,5);
  return jsonb_build_object('enabled',v_fee_amount>0,'free_seconds',floor(v_free_minutes*60)::integer,
    'amount',round(v_fee_amount,2),'block_after_driver_arrival',true);
end;
$$;

create or replace function public.settle_cancellation_fee(_fee_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare fee_row public.cancellation_fees%rowtype; remaining integer;
begin
  select * into fee_row from public.cancellation_fees where id=_fee_id for update;
  if not found then raise exception 'fee_not_found'; end if;
  if fee_row.is_paid or fee_row.status='paid' then return jsonb_build_object('ok',true,'already_paid',true); end if;
  update public.cancellation_fees set status='paid',is_paid=true,paid_at=coalesce(paid_at,now()),updated_at=now() where id=_fee_id;
  select count(*) into remaining from public.cancellation_fees
    where passenger_id=fee_row.passenger_id and status in ('pending','open','unpaid','processing') and is_paid=false;
  if remaining=0 then update public.passenger_wallets set is_blocked=false,blocked_reason=null,updated_at=now() where passenger_id=fee_row.passenger_id; end if;
  insert into public.notifications(user_id,title,body,data) values(
    fee_row.passenger_id,'Pagamento confirmado','A multa foi paga e sua carteira foi atualizada.',
    jsonb_build_object('category','payment','fee_id',fee_row.id,'url','/carteira'));
  return jsonb_build_object('ok',true,'already_paid',false);
end;
$$;

create or replace function public.reverse_cancellation_fee_settlement(_fee_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare fee_row public.cancellation_fees%rowtype;
begin
  select * into fee_row from public.cancellation_fees where id=_fee_id for update;
  if not found then raise exception 'fee_not_found'; end if;
  update public.cancellation_fees set status='unpaid',is_paid=false,paid_at=null,updated_at=now() where id=_fee_id;
  update public.passenger_wallets set is_blocked=true,blocked_reason='Pagamento da multa foi estornado.',updated_at=now()
  where passenger_id=fee_row.passenger_id;
  insert into public.notifications(user_id,title,body,data) values(
    fee_row.passenger_id,'Pagamento estornado','O pagamento da multa foi estornado e a carteira voltou a ficar bloqueada.',
    jsonb_build_object('category','payment','fee_id',fee_row.id,'url','/carteira'));
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.credit_driver_cancellation_fee()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_driver_id uuid; v_inserted_id uuid; v_amount numeric; v_paid boolean;
begin
  v_paid:=lower(coalesce(new.status,''))='paid' or coalesce(new.is_paid,false)=true or lower(coalesce(new.mp_payment_status,''))='approved';
  if not v_paid then return new; end if;
  if tg_op='UPDATE' and (lower(coalesce(old.status,''))='paid' or coalesce(old.is_paid,false)=true or lower(coalesce(old.mp_payment_status,''))='approved') then return new; end if;
  v_amount:=coalesce(new.amount,new.fee_amount,new.value,0); if v_amount<=0 then return new; end if;
  select r.driver_id into v_driver_id from public.rides r where r.id=new.ride_id; if v_driver_id is null then return new; end if;
  insert into public.driver_wallets(driver_id) values(v_driver_id) on conflict(driver_id) do nothing;
  insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
  values(v_driver_id,v_amount,'credit','cancellation_fee',new.id,'Multa de cancelamento paga pelo passageiro')
  on conflict(driver_id,source,source_id) do nothing returning id into v_inserted_id;
  if v_inserted_id is not null then
    update public.driver_wallets set balance=balance+v_amount,available_balance=available_balance+v_amount,updated_at=now() where driver_id=v_driver_id;
  end if;
  return new;
end;
$$;

create or replace function public.append_nearby_busy_driver_candidates()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_radius_km numeric:=5; v_extra uuid[]:='{}'::uuid[];
begin
  if new.status<>'procurar_motorista' or new.driver_id is not null or new.origin_lat is null or new.origin_lng is null then return new; end if;
  begin select coalesce((value #>> '{}')::numeric,5) into v_radius_km from public.app_settings where key='ride.next_offer_max_distance_km';
  exception when others then v_radius_km:=5; end;
  v_radius_km:=greatest(0.5,least(coalesce(v_radius_km,5),20));
  select coalesce(array_agg(x.user_id),'{}'::uuid[]) into v_extra from (
    select d.user_id from public.drivers d
    where d.is_online=true and d.approval_status='aprovado'
      and lower(coalesce(d.subscription_status,'')) in ('active','ativa','teste')
      and d.category=new.category and d.current_lat is not null and d.current_lng is not null
      and d.last_location_at is not null and d.last_location_at>=now()-interval '120 seconds'
      and not(d.user_id=any(coalesce(new.rejected_driver_ids,'{}'::uuid[])))
      and exists(select 1 from public.rides current_ride where current_ride.driver_id=d.id and current_ride.status='em_viagem')
      and not exists(select 1 from public.rides queued_ride where queued_ride.driver_id=d.id and queued_ride.status='procurar_motorista' and queued_ride.queued_after_ride_id is not null)
      and 6371*acos(least(1,greatest(-1,
        cos(radians(new.origin_lat::double precision))*cos(radians(d.current_lat::double precision))*
        cos(radians(d.current_lng::double precision)-radians(new.origin_lng::double precision))+
        sin(radians(new.origin_lat::double precision))*sin(radians(d.current_lat::double precision))
      )))<=v_radius_km
    order by 6371*acos(least(1,greatest(-1,
      cos(radians(new.origin_lat::double precision))*cos(radians(d.current_lat::double precision))*
      cos(radians(d.current_lng::double precision)-radians(new.origin_lng::double precision))+
      sin(radians(new.origin_lat::double precision))*sin(radians(d.current_lat::double precision))
    ))) asc limit 5
  ) x;
  if cardinality(v_extra)>0 then
    select coalesce(array_agg(distinct candidate_id),'{}'::uuid[]) into new.candidate_driver_ids
      from unnest(coalesce(new.candidate_driver_ids,'{}'::uuid[])||v_extra) candidate_id;
    select coalesce(array_agg(distinct offered_id),'{}'::uuid[]) into new.offered_driver_ids
      from unnest(coalesce(new.offered_driver_ids,'{}'::uuid[])||v_extra) offered_id;
  end if;
  return new;
end;
$$;
