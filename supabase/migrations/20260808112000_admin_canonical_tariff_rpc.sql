-- APOIS CORRIDAS — Admin pricing contract aligned with the live canonical tariff schema.
-- IMPORTANT: this migration is prepared for validation in a development/staging branch first.
-- Do not apply directly to production during the migration audit.

create or replace function public.admin_upsert_tariff_rule(
  _category_id uuid,
  _city text,
  _patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_city text := lower(trim(coalesce(_city, 'default')));
  v_patch jsonb := coalesce(_patch, '{}'::jsonb);
  v_before public.tariff_rules%rowtype;
  v_after public.tariff_rules%rowtype;
  v_has_before boolean := false;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- Reuse the permission model already used by admin_is_authorized().
  -- A pricing-specific permission does not exist in the live RBAC catalog yet;
  -- do not invent one silently during consolidation.
  if not private.has_permission('users.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if _category_id is null or not exists (
    select 1 from public.ride_categories rc where rc.id = _category_id
  ) then
    raise exception 'invalid_category_id' using errcode = '22023';
  end if;

  if v_city = '' or length(v_city) > 120 then
    raise exception 'invalid_city' using errcode = '22023';
  end if;

  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(v_patch) as k(key)
    where k.key not in (
      'base_fare', 'min_fare', 'per_km', 'per_min', 'stop_fee', 'fixed_fee',
      'dynamic_multiplier', 'helper1_fee', 'helper2_fee', 'heavy_furniture_fee',
      'assembly_fee', 'packing_fee', 'difficult_access_fee', 'stair_fee',
      'heavy_vehicle_fee', 'accident_fee', 'platform_fee', 'locked_wheels_fee',
      'garage_fee', 'max_weight_kg', 'per_kg'
    )
  ) then
    raise exception 'invalid_tariff_field' using errcode = '22023';
  end if;

  select * into v_before
  from public.tariff_rules
  where category_id = _category_id and city = v_city
  for update;
  v_has_before := found;

  insert into public.tariff_rules (
    category_id,
    city,
    base_fare,
    min_fare,
    per_km,
    per_min,
    stop_fee,
    fixed_fee,
    dynamic_multiplier,
    helper1_fee,
    helper2_fee,
    heavy_furniture_fee,
    assembly_fee,
    packing_fee,
    difficult_access_fee,
    stair_fee,
    heavy_vehicle_fee,
    accident_fee,
    platform_fee,
    locked_wheels_fee,
    garage_fee,
    max_weight_kg,
    per_kg,
    is_active,
    valid_from,
    valid_to
  )
  values (
    _category_id,
    v_city,
    coalesce(nullif(v_patch->>'base_fare','')::numeric, case when v_has_before then v_before.base_fare else 0 end),
    coalesce(nullif(v_patch->>'min_fare','')::numeric, case when v_has_before then v_before.min_fare else 0 end),
    coalesce(nullif(v_patch->>'per_km','')::numeric, case when v_has_before then v_before.per_km else 0 end),
    coalesce(nullif(v_patch->>'per_min','')::numeric, case when v_has_before then v_before.per_min else 0 end),
    coalesce(nullif(v_patch->>'stop_fee','')::numeric, case when v_has_before then v_before.stop_fee else 0 end),
    coalesce(nullif(v_patch->>'fixed_fee','')::numeric, case when v_has_before then v_before.fixed_fee else 0 end),
    coalesce(nullif(v_patch->>'dynamic_multiplier','')::numeric, case when v_has_before then v_before.dynamic_multiplier else 1 end),
    coalesce(nullif(v_patch->>'helper1_fee','')::numeric, case when v_has_before then v_before.helper1_fee else 0 end),
    coalesce(nullif(v_patch->>'helper2_fee','')::numeric, case when v_has_before then v_before.helper2_fee else 0 end),
    coalesce(nullif(v_patch->>'heavy_furniture_fee','')::numeric, case when v_has_before then v_before.heavy_furniture_fee else 0 end),
    coalesce(nullif(v_patch->>'assembly_fee','')::numeric, case when v_has_before then v_before.assembly_fee else 0 end),
    coalesce(nullif(v_patch->>'packing_fee','')::numeric, case when v_has_before then v_before.packing_fee else 0 end),
    coalesce(nullif(v_patch->>'difficult_access_fee','')::numeric, case when v_has_before then v_before.difficult_access_fee else 0 end),
    coalesce(nullif(v_patch->>'stair_fee','')::numeric, case when v_has_before then v_before.stair_fee else 0 end),
    coalesce(nullif(v_patch->>'heavy_vehicle_fee','')::numeric, case when v_has_before then v_before.heavy_vehicle_fee else 0 end),
    coalesce(nullif(v_patch->>'accident_fee','')::numeric, case when v_has_before then v_before.accident_fee else 0 end),
    coalesce(nullif(v_patch->>'platform_fee','')::numeric, case when v_has_before then v_before.platform_fee else 0 end),
    coalesce(nullif(v_patch->>'locked_wheels_fee','')::numeric, case when v_has_before then v_before.locked_wheels_fee else 0 end),
    coalesce(nullif(v_patch->>'garage_fee','')::numeric, case when v_has_before then v_before.garage_fee else 0 end),
    coalesce(nullif(v_patch->>'max_weight_kg','')::numeric, case when v_has_before then v_before.max_weight_kg else 0 end),
    coalesce(nullif(v_patch->>'per_kg','')::numeric, case when v_has_before then v_before.per_kg else 0 end),
    case when v_has_before then v_before.is_active else true end,
    case when v_has_before then v_before.valid_from else null end,
    case when v_has_before then v_before.valid_to else null end
  )
  on conflict (category_id, city) do update set
    base_fare = excluded.base_fare,
    min_fare = excluded.min_fare,
    per_km = excluded.per_km,
    per_min = excluded.per_min,
    stop_fee = excluded.stop_fee,
    fixed_fee = excluded.fixed_fee,
    dynamic_multiplier = excluded.dynamic_multiplier,
    helper1_fee = excluded.helper1_fee,
    helper2_fee = excluded.helper2_fee,
    heavy_furniture_fee = excluded.heavy_furniture_fee,
    assembly_fee = excluded.assembly_fee,
    packing_fee = excluded.packing_fee,
    difficult_access_fee = excluded.difficult_access_fee,
    stair_fee = excluded.stair_fee,
    heavy_vehicle_fee = excluded.heavy_vehicle_fee,
    accident_fee = excluded.accident_fee,
    platform_fee = excluded.platform_fee,
    locked_wheels_fee = excluded.locked_wheels_fee,
    garage_fee = excluded.garage_fee,
    max_weight_kg = excluded.max_weight_kg,
    per_kg = excluded.per_kg,
    updated_at = now()
  returning * into v_after;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'tariff_rules.upsert',
    'tariff_rules',
    v_after.id::text,
    jsonb_build_object(
      'category_id', _category_id,
      'city', v_city,
      'before', case when v_has_before then to_jsonb(v_before) else null end,
      'after', to_jsonb(v_after)
    )
  );

  return to_jsonb(v_after);
exception
  when check_violation then
    raise exception 'invalid_tariff_value' using errcode = '22023';
  when invalid_text_representation then
    raise exception 'invalid_tariff_value' using errcode = '22023';
end;
$function$;

revoke all on function public.admin_upsert_tariff_rule(uuid, text, jsonb) from public;
grant execute on function public.admin_upsert_tariff_rule(uuid, text, jsonb) to authenticated;
