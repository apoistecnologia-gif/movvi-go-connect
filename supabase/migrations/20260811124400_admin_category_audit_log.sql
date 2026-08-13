create or replace function public.admin_update_ride_category(
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
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.ride_categories%rowtype;
  v_row public.ride_categories%rowtype;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('users.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if _category_id is null or nullif(btrim(_name),'') is null then raise exception 'invalid_category' using errcode='22023'; end if;

  select * into v_before from public.ride_categories where id=_category_id for update;
  if not found then raise exception 'category_not_found' using errcode='P0002'; end if;

  update public.ride_categories
  set name=btrim(_name),
      description=nullif(btrim(coalesce(_description,'')),''),
      icon=nullif(btrim(coalesce(_icon,'')),''),
      image_url=nullif(btrim(coalesce(_image_url,'')),''),
      capacity_label=nullif(btrim(coalesce(_capacity_label,'')),''),
      eta_label=nullif(btrim(coalesce(_eta_label,'')),''),
      sort_order=greatest(coalesce(_sort_order,0),0),
      is_active=coalesce(_is_active,true),
      updated_at=now()
  where id=_category_id
  returning * into v_row;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (
    v_actor,
    'admin.ride_category.updated',
    'ride_category',
    _category_id::text,
    jsonb_build_object(
      'code',v_row.code,
      'before',jsonb_build_object('name',v_before.name,'description',v_before.description,'icon',v_before.icon,'image_url',v_before.image_url,'capacity_label',v_before.capacity_label,'eta_label',v_before.eta_label,'sort_order',v_before.sort_order,'is_active',v_before.is_active),
      'after',jsonb_build_object('name',v_row.name,'description',v_row.description,'icon',v_row.icon,'image_url',v_row.image_url,'capacity_label',v_row.capacity_label,'eta_label',v_row.eta_label,'sort_order',v_row.sort_order,'is_active',v_row.is_active)
    )
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) from public,anon;
grant execute on function public.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) to authenticated;
