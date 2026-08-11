create or replace function public.admin_upsert_tariff_rule(
  _category_code text,
  _city text,
  _base_fare numeric,
  _min_fare numeric,
  _per_km numeric,
  _per_min numeric,
  _stop_fee numeric,
  _fixed_fee numeric,
  _dynamic_multiplier numeric,
  _helper1_fee numeric,
  _helper2_fee numeric,
  _heavy_furniture_fee numeric,
  _assembly_fee numeric,
  _packing_fee numeric,
  _difficult_access_fee numeric,
  _stair_fee numeric,
  _heavy_vehicle_fee numeric,
  _accident_fee numeric,
  _platform_fee numeric,
  _locked_wheels_fee numeric,
  _garage_fee numeric,
  _max_weight_kg numeric,
  _per_kg numeric,
  _is_active boolean
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_category_id uuid;
  v_city text := coalesce(nullif(btrim(_city), ''), 'default');
  v_before public.tariff_rules%rowtype;
  v_row public.tariff_rules%rowtype;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('users.manage') then raise exception 'forbidden' using errcode='42501'; end if;

  select id into v_category_id
  from public.ride_categories
  where code=nullif(btrim(_category_code),'');
  if v_category_id is null then raise exception 'category_not_found' using errcode='P0002'; end if;

  if coalesce(_dynamic_multiplier,0) <= 0 or
     least(
       coalesce(_base_fare,0),coalesce(_min_fare,0),coalesce(_per_km,0),coalesce(_per_min,0),
       coalesce(_stop_fee,0),coalesce(_fixed_fee,0),coalesce(_helper1_fee,0),coalesce(_helper2_fee,0),
       coalesce(_heavy_furniture_fee,0),coalesce(_assembly_fee,0),coalesce(_packing_fee,0),
       coalesce(_difficult_access_fee,0),coalesce(_stair_fee,0),coalesce(_heavy_vehicle_fee,0),
       coalesce(_accident_fee,0),coalesce(_platform_fee,0),coalesce(_locked_wheels_fee,0),
       coalesce(_garage_fee,0),coalesce(_max_weight_kg,0),coalesce(_per_kg,0)
     ) < 0
  then raise exception 'invalid_tariff_values' using errcode='22023'; end if;

  select * into v_before
  from public.tariff_rules
  where category_id=v_category_id and city=v_city
  for update;

  insert into public.tariff_rules (
    category_id,city,base_fare,min_fare,per_km,per_min,stop_fee,fixed_fee,dynamic_multiplier,
    helper1_fee,helper2_fee,heavy_furniture_fee,assembly_fee,packing_fee,difficult_access_fee,
    stair_fee,heavy_vehicle_fee,accident_fee,platform_fee,locked_wheels_fee,garage_fee,max_weight_kg,
    per_kg,is_active,updated_at
  ) values (
    v_category_id,v_city,coalesce(_base_fare,0),coalesce(_min_fare,0),coalesce(_per_km,0),coalesce(_per_min,0),
    coalesce(_stop_fee,0),coalesce(_fixed_fee,0),_dynamic_multiplier,coalesce(_helper1_fee,0),coalesce(_helper2_fee,0),
    coalesce(_heavy_furniture_fee,0),coalesce(_assembly_fee,0),coalesce(_packing_fee,0),coalesce(_difficult_access_fee,0),
    coalesce(_stair_fee,0),coalesce(_heavy_vehicle_fee,0),coalesce(_accident_fee,0),coalesce(_platform_fee,0),
    coalesce(_locked_wheels_fee,0),coalesce(_garage_fee,0),coalesce(_max_weight_kg,0),coalesce(_per_kg,0),
    coalesce(_is_active,true),now()
  )
  on conflict (category_id,city) do update set
    base_fare=excluded.base_fare,min_fare=excluded.min_fare,per_km=excluded.per_km,per_min=excluded.per_min,
    stop_fee=excluded.stop_fee,fixed_fee=excluded.fixed_fee,dynamic_multiplier=excluded.dynamic_multiplier,
    helper1_fee=excluded.helper1_fee,helper2_fee=excluded.helper2_fee,heavy_furniture_fee=excluded.heavy_furniture_fee,
    assembly_fee=excluded.assembly_fee,packing_fee=excluded.packing_fee,difficult_access_fee=excluded.difficult_access_fee,
    stair_fee=excluded.stair_fee,heavy_vehicle_fee=excluded.heavy_vehicle_fee,accident_fee=excluded.accident_fee,
    platform_fee=excluded.platform_fee,locked_wheels_fee=excluded.locked_wheels_fee,garage_fee=excluded.garage_fee,
    max_weight_kg=excluded.max_weight_kg,per_kg=excluded.per_kg,is_active=excluded.is_active,updated_at=now()
  returning * into v_row;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (
    v_actor,
    'admin.tariff_rule.upserted',
    'tariff_rule',
    v_row.id::text,
    jsonb_build_object(
      'category_code',nullif(btrim(_category_code),''),
      'city',v_city,
      'before',case when v_before.id is null then null else to_jsonb(v_before)-'id'-'created_at'-'updated_at' end,
      'after',to_jsonb(v_row)-'id'-'created_at'-'updated_at'
    )
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) from public,anon;
grant execute on function public.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) to authenticated;
