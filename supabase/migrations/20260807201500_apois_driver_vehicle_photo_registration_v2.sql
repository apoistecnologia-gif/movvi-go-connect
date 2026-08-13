alter table public.drivers add column if not exists vehicle_photo_url text;

create or replace function public.driver_complete_registration_v2(
  _name text,
  _phone text,
  _cpf text,
  _birth_date date,
  _city text,
  _state text,
  _category text,
  _vehicle_model text,
  _vehicle_plate text,
  _vehicle_color text,
  _vehicle_year integer,
  _selfie_path text,
  _cnh_path text,
  _cnh_back_path text,
  _vehicle_document_path text,
  _vehicle_photo_path text,
  _photo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_driver public.drivers%rowtype;
  v_category text := lower(trim(coalesce(_category, '')));
  v_prefix text := auth.uid()::text || '/';
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if v_category not in ('carros','motos','fretes','guincho','envios') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(_name,'')), '') is null then raise exception 'name_required' using errcode='22023'; end if;
  if nullif(regexp_replace(coalesce(_cpf,''),'[^0-9]','','g'), '') is null then raise exception 'cpf_required' using errcode='22023'; end if;
  if _vehicle_year is null or _vehicle_year < 1971 or _vehicle_year > extract(year from now())::int + 1 then
    raise exception 'invalid_vehicle_year' using errcode='22023';
  end if;

  if _selfie_path is null or left(_selfie_path, length(v_prefix)) <> v_prefix
     or _cnh_path is null or left(_cnh_path, length(v_prefix)) <> v_prefix
     or _cnh_back_path is null or left(_cnh_back_path, length(v_prefix)) <> v_prefix
     or _vehicle_document_path is null or left(_vehicle_document_path, length(v_prefix)) <> v_prefix
     or _vehicle_photo_path is null or left(_vehicle_photo_path, length(v_prefix)) <> v_prefix
     or (_photo_path is not null and left(_photo_path, length(v_prefix)) <> v_prefix) then
    raise exception 'invalid_document_path' using errcode='22023';
  end if;

  select * into v_user
  from public.users
  where auth_user_id = auth.uid() and deleted_at is null
  limit 1;
  if not found then raise exception 'profile_missing'; end if;

  update public.users
  set name = left(trim(_name), 160),
      phone = nullif(left(regexp_replace(coalesce(_phone,''),'[^0-9]','','g'), 15), ''),
      cpf = nullif(left(regexp_replace(coalesce(_cpf,''),'[^0-9]','','g'), 14), ''),
      birth_date = _birth_date,
      city = nullif(left(trim(coalesce(_city,'')), 120), ''),
      avatar_url = coalesce(_photo_path, _selfie_path),
      updated_at = now()
  where id = v_user.id
  returning * into v_user;

  insert into public.user_roles (user_id, role)
  values (v_user.id, 'driver')
  on conflict (user_id, role) do nothing;

  insert into public.drivers (
    user_id,name,email,phone,cpf,birth_date,city,state,category,
    vehicle_model,vehicle_plate,vehicle_color,vehicle_year,
    selfie_url,cnh_url,cnh_back_url,vehicle_document_url,vehicle_photo_url,photo_url,
    approval_status,documents_status,subscription_status,is_online,updated_at
  ) values (
    v_user.id,left(trim(_name),160),v_user.email,v_user.phone,v_user.cpf,_birth_date,
    nullif(left(trim(coalesce(_city,'')),120),''),upper(left(trim(coalesce(_state,'')),2)),v_category,
    nullif(left(trim(coalesce(_vehicle_model,'')),120),''),upper(nullif(left(trim(coalesce(_vehicle_plate,'')),10),'')),
    nullif(left(trim(coalesce(_vehicle_color,'')),60),''),_vehicle_year,
    _selfie_path,_cnh_path,_cnh_back_path,_vehicle_document_path,_vehicle_photo_path,coalesce(_photo_path,_selfie_path),
    'em_analise','pending_review','teste',false,now()
  )
  on conflict (user_id) do update set
    name=excluded.name,email=excluded.email,phone=excluded.phone,cpf=excluded.cpf,
    birth_date=excluded.birth_date,city=excluded.city,state=excluded.state,category=excluded.category,
    vehicle_model=excluded.vehicle_model,vehicle_plate=excluded.vehicle_plate,vehicle_color=excluded.vehicle_color,
    vehicle_year=excluded.vehicle_year,selfie_url=excluded.selfie_url,cnh_url=excluded.cnh_url,
    cnh_back_url=excluded.cnh_back_url,vehicle_document_url=excluded.vehicle_document_url,
    vehicle_photo_url=excluded.vehicle_photo_url,photo_url=excluded.photo_url,
    approval_status='em_analise',documents_status='pending_review',is_online=false,
    motivo_reprovacao=null,updated_at=now()
  returning * into v_driver;

  return to_jsonb(v_driver);
end;
$$;

revoke all on function public.driver_complete_registration_v2(text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text,text) from public;
grant execute on function public.driver_complete_registration_v2(text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text,text) to authenticated, service_role;
