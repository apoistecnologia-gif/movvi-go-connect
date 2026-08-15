create or replace function private.release_driver_pretrip_rides_for_redispatch(
  _driver_id uuid,
  _reason text default null
)
returns uuid[]
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_driver public.drivers%rowtype;
  v_profile_id uuid;
  v_released_ids uuid[] := '{}'::uuid[];
begin
  select * into v_driver
  from public.drivers
  where id = _driver_id;

  if not found then
    raise exception 'driver_not_found' using errcode = 'P0002';
  end if;

  v_profile_id := v_driver.user_id;

  with released as (
    update public.rides r
    set
      status = 'procurar_motorista',
      driver_id = null,
      accepted_driver_id = null,
      accepted_at = null,
      driver_arrived_at = null,
      started_at = null,
      queued_after_ride_id = null,
      queued_at = null,
      current_offer_driver_id = null,
      driver_name = null,
      driver_photo = null,
      driver_phone = null,
      driver_vehicle_model = null,
      driver_vehicle_color = null,
      driver_vehicle_plate = null,
      driver_rating = null,
      driver_latitude = null,
      driver_longitude = null,
      driver_heading = null,
      security_code = null,
      security_code_failed_attempts = 0,
      security_code_locked_until = null,
      security_code_last_failed_at = null,
      candidate_driver_ids = array_remove(coalesce(r.candidate_driver_ids, '{}'::uuid[]), v_profile_id),
      offered_driver_ids = '{}'::uuid[],
      rejected_driver_ids = case
        when v_profile_id = any(coalesce(r.rejected_driver_ids, '{}'::uuid[]))
          then coalesce(r.rejected_driver_ids, '{}'::uuid[])
        else array_append(coalesce(r.rejected_driver_ids, '{}'::uuid[]), v_profile_id)
      end,
      request_expires_at = null,
      search_expires_at = now() + interval '8 minutes',
      cancellation_reason = null,
      cancelled_by = null,
      cancelled_at = null,
      updated_at = now()
    where r.driver_id = _driver_id
      and (
        r.status in ('motorista_a_caminho', 'motorista_chegou')
        or (
          r.status = 'procurar_motorista'
          and r.queued_after_ride_id is not null
        )
      )
    returning r.id
  )
  select coalesce(array_agg(id), '{}'::uuid[])
  into v_released_ids
  from released;

  return v_released_ids;
end;
$$;

revoke all on function private.release_driver_pretrip_rides_for_redispatch(uuid, text) from public;

create or replace function public.admin_set_driver_operational_status(
  _driver_id uuid,
  _action text,
  _status text default null,
  _suspended boolean default null,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_action text := lower(btrim(coalesce(_action, '')));
  v_status text := lower(btrim(coalesce(_status, '')));
  v_result jsonb;
  v_released_ids uuid[] := '{}'::uuid[];
begin
  if v_auth_user_id is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if not private.has_permission('users.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_action = 'approval' then
    if v_status not in ('em_analise', 'aprovado', 'reprovado', 'bloqueado') then
      raise exception 'invalid_status' using errcode = '22023';
    end if;

    v_result := public.admin_set_driver_approval(
      _driver_id,
      v_status,
      nullif(left(btrim(coalesce(_reason, '')), 500), '')
    );

    if v_status <> 'aprovado' then
      v_released_ids := private.release_driver_pretrip_rides_for_redispatch(
        _driver_id,
        nullif(left(btrim(coalesce(_reason, '')), 500), '')
      );
    end if;
  elsif v_action = 'suspension' then
    if _suspended is null then
      raise exception 'suspended_flag_required' using errcode = '22023';
    end if;

    v_result := public.admin_set_driver_suspension(
      _driver_id,
      _suspended,
      nullif(left(btrim(coalesce(_reason, '')), 500), '')
    );

    if _suspended then
      v_released_ids := private.release_driver_pretrip_rides_for_redispatch(
        _driver_id,
        nullif(left(btrim(coalesce(_reason, '')), 500), '')
      );
    end if;
  else
    raise exception 'invalid_admin_driver_action' using errcode = '22023';
  end if;

  if cardinality(v_released_ids) > 0 then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    select
      v_auth_user_id,
      'admin.ride_released_for_redispatch',
      'ride',
      ride_id::text,
      jsonb_build_object(
        'driver_id', _driver_id,
        'admin_action', v_action,
        'driver_status', nullif(v_status, ''),
        'suspended', _suspended,
        'reason', nullif(left(btrim(coalesce(_reason, '')), 500), '')
      )
    from unnest(v_released_ids) as ride_id;
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'redispatch_ride_ids', to_jsonb(v_released_ids),
    'released_count', cardinality(v_released_ids)
  );
end;
$$;

revoke all on function public.admin_set_driver_operational_status(uuid, text, text, boolean, text) from public, anon;
grant execute on function public.admin_set_driver_operational_status(uuid, text, text, boolean, text) to authenticated;
