create or replace function public.driver_set_emergency_contact_primary(_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_profile_id uuid;
  v_driver_id uuid;
  v_contact public.driver_emergency_contacts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  v_profile_id := public.mobility_user_id();
  if v_profile_id is null then
    raise exception 'profile_missing' using errcode='42501';
  end if;

  select d.id into v_driver_id
  from public.drivers d
  where d.user_id = v_profile_id;

  if v_driver_id is null then
    raise exception 'driver_profile_missing' using errcode='42501';
  end if;

  select * into v_contact
  from public.driver_emergency_contacts c
  where c.id = _contact_id
    and c.driver_id = v_driver_id
  for update;

  if not found then
    raise exception 'emergency_contact_not_found' using errcode='P0002';
  end if;

  if v_contact.is_primary is not true then
    update public.driver_emergency_contacts
    set is_primary = false,
        updated_at = now()
    where driver_id = v_driver_id
      and is_primary is true;

    update public.driver_emergency_contacts
    set is_primary = true,
        updated_at = now()
    where id = _contact_id
      and driver_id = v_driver_id
    returning * into v_contact;
  end if;

  return to_jsonb(v_contact);
end;
$function$;

revoke all on function public.driver_set_emergency_contact_primary(uuid) from public, anon;
grant execute on function public.driver_set_emergency_contact_primary(uuid) to authenticated;

create or replace function public.driver_delete_emergency_contact(_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_profile_id uuid;
  v_driver_id uuid;
  v_deleted public.driver_emergency_contacts%rowtype;
  v_promoted_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  v_profile_id := public.mobility_user_id();
  if v_profile_id is null then
    raise exception 'profile_missing' using errcode='42501';
  end if;

  select d.id into v_driver_id
  from public.drivers d
  where d.user_id = v_profile_id;

  if v_driver_id is null then
    raise exception 'driver_profile_missing' using errcode='42501';
  end if;

  delete from public.driver_emergency_contacts c
  where c.id = _contact_id
    and c.driver_id = v_driver_id
  returning * into v_deleted;

  if not found then
    raise exception 'emergency_contact_not_found' using errcode='P0002';
  end if;

  if v_deleted.is_primary is true then
    select c.id into v_promoted_id
    from public.driver_emergency_contacts c
    where c.driver_id = v_driver_id
    order by c.created_at asc, c.id asc
    limit 1
    for update;

    if v_promoted_id is not null then
      update public.driver_emergency_contacts
      set is_primary = true,
          updated_at = now()
      where id = v_promoted_id;
    end if;
  end if;

  return jsonb_build_object(
    'deleted_id', v_deleted.id,
    'deleted_was_primary', v_deleted.is_primary,
    'promoted_contact_id', v_promoted_id
  );
end;
$function$;

revoke all on function public.driver_delete_emergency_contact(uuid) from public, anon;
grant execute on function public.driver_delete_emergency_contact(uuid) to authenticated;