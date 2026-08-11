BEGIN;

DROP POLICY IF EXISTS ride_categories_admin_all ON public.ride_categories;
CREATE POLICY ride_categories_admin_all
ON public.ride_categories
FOR ALL
TO authenticated
USING (private.has_permission('users.manage'))
WITH CHECK (private.has_permission('users.manage'));

CREATE OR REPLACE FUNCTION public.admin_update_ride_category(
  _category_id uuid,
  _name text,
  _description text,
  _icon text,
  _image_url text,
  _capacity_label text,
  _eta_label text,
  _sort_order integer,
  _is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_row public.ride_categories%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  IF NOT private.has_permission('users.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _category_id IS NULL OR nullif(btrim(_name), '') IS NULL THEN
    RAISE EXCEPTION 'invalid_category' USING ERRCODE='22023';
  END IF;

  UPDATE public.ride_categories
  SET name = btrim(_name),
      description = nullif(btrim(coalesce(_description, '')), ''),
      icon = nullif(btrim(coalesce(_icon, '')), ''),
      image_url = nullif(btrim(coalesce(_image_url, '')), ''),
      capacity_label = nullif(btrim(coalesce(_capacity_label, '')), ''),
      eta_label = nullif(btrim(coalesce(_eta_label, '')), ''),
      sort_order = greatest(coalesce(_sort_order, 0), 0),
      is_active = coalesce(_is_active, true),
      updated_at = now()
  WHERE id = _category_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'category_not_found' USING ERRCODE='P0002';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) TO authenticated, service_role;

COMMIT;
