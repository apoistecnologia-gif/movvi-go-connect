BEGIN;

DROP POLICY IF EXISTS tariff_rules_admin_all ON public.tariff_rules;
CREATE POLICY tariff_rules_admin_all
ON public.tariff_rules
FOR ALL
TO authenticated
USING (private.has_permission('users.manage'))
WITH CHECK (private.has_permission('users.manage'));

CREATE OR REPLACE FUNCTION public.admin_upsert_tariff_rule(
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
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_category_id uuid;
  v_city text := coalesce(nullif(btrim(_city), ''), 'default');
  v_row public.tariff_rules%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF NOT private.has_permission('users.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT id INTO v_category_id
  FROM public.ride_categories
  WHERE code = nullif(btrim(_category_code), '');
  IF v_category_id IS NULL THEN RAISE EXCEPTION 'category_not_found' USING ERRCODE='P0002'; END IF;

  IF coalesce(_dynamic_multiplier, 0) <= 0 OR
     least(coalesce(_base_fare,0),coalesce(_min_fare,0),coalesce(_per_km,0),coalesce(_per_min,0),coalesce(_stop_fee,0),coalesce(_fixed_fee,0),coalesce(_helper1_fee,0),coalesce(_helper2_fee,0),coalesce(_heavy_furniture_fee,0),coalesce(_assembly_fee,0),coalesce(_packing_fee,0),coalesce(_difficult_access_fee,0),coalesce(_stair_fee,0),coalesce(_heavy_vehicle_fee,0),coalesce(_accident_fee,0),coalesce(_platform_fee,0),coalesce(_locked_wheels_fee,0),coalesce(_garage_fee,0),coalesce(_max_weight_kg,0),coalesce(_per_kg,0)) < 0
  THEN RAISE EXCEPTION 'invalid_tariff_values' USING ERRCODE='22023'; END IF;

  INSERT INTO public.tariff_rules (
    category_id,city,base_fare,min_fare,per_km,per_min,stop_fee,fixed_fee,dynamic_multiplier,
    helper1_fee,helper2_fee,heavy_furniture_fee,assembly_fee,packing_fee,difficult_access_fee,
    stair_fee,heavy_vehicle_fee,accident_fee,platform_fee,locked_wheels_fee,garage_fee,max_weight_kg,
    per_kg,is_active,updated_at
  ) VALUES (
    v_category_id,v_city,coalesce(_base_fare,0),coalesce(_min_fare,0),coalesce(_per_km,0),coalesce(_per_min,0),
    coalesce(_stop_fee,0),coalesce(_fixed_fee,0),_dynamic_multiplier,coalesce(_helper1_fee,0),coalesce(_helper2_fee,0),
    coalesce(_heavy_furniture_fee,0),coalesce(_assembly_fee,0),coalesce(_packing_fee,0),coalesce(_difficult_access_fee,0),
    coalesce(_stair_fee,0),coalesce(_heavy_vehicle_fee,0),coalesce(_accident_fee,0),coalesce(_platform_fee,0),
    coalesce(_locked_wheels_fee,0),coalesce(_garage_fee,0),coalesce(_max_weight_kg,0),coalesce(_per_kg,0),
    coalesce(_is_active,true),now()
  )
  ON CONFLICT (category_id, city) DO UPDATE SET
    base_fare=excluded.base_fare,min_fare=excluded.min_fare,per_km=excluded.per_km,per_min=excluded.per_min,
    stop_fee=excluded.stop_fee,fixed_fee=excluded.fixed_fee,dynamic_multiplier=excluded.dynamic_multiplier,
    helper1_fee=excluded.helper1_fee,helper2_fee=excluded.helper2_fee,heavy_furniture_fee=excluded.heavy_furniture_fee,
    assembly_fee=excluded.assembly_fee,packing_fee=excluded.packing_fee,difficult_access_fee=excluded.difficult_access_fee,
    stair_fee=excluded.stair_fee,heavy_vehicle_fee=excluded.heavy_vehicle_fee,accident_fee=excluded.accident_fee,
    platform_fee=excluded.platform_fee,locked_wheels_fee=excluded.locked_wheels_fee,garage_fee=excluded.garage_fee,
    max_weight_kg=excluded.max_weight_kg,per_kg=excluded.per_kg,is_active=excluded.is_active,updated_at=now()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) TO authenticated, service_role;

COMMIT;
