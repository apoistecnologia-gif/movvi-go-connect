-- APOIS Corridas: revalidate driver eligibility before promoting a queued next ride.
-- A driver must always be allowed to finish the ride already in progress, but a
-- queued ride must return to dispatch if approval, subscription or presence is
-- no longer valid when the current ride is completed.

CREATE OR REPLACE FUNCTION apois_rpc_private.driver_finish_ride(_ride_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'apois_rpc_private'
AS $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_driver public.drivers%rowtype;
  v_ride public.rides%rowtype;
  v_next public.rides%rowtype;
  v_driver_eligible boolean := false;
begin
  if v_auth_user_id is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  v_profile_id := public.mobility_user_id();
  if v_profile_id is null then
    raise exception 'driver_profile_missing';
  end if;

  select * into v_driver
  from public.drivers
  where user_id=v_profile_id
  for update;

  if not found then
    raise exception 'driver_profile_missing';
  end if;

  update public.rides
  set status='finalizada',final_price=coalesce(final_price,estimated_price),completed_at=now(),updated_at=now()
  where id=_ride_id and driver_id=v_driver.id and status='em_viagem'
  returning * into v_ride;

  if not found then
    raise exception 'invalid_ride_transition';
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (v_auth_user_id,'ride.driver_finished','ride',v_ride.id::text,
    jsonb_build_object('driver_id',v_driver.id,'driver_domain_user_id',v_profile_id,'final_price',v_ride.final_price));

  select * into v_next
  from public.rides
  where driver_id=v_driver.id and accepted_driver_id=v_driver.id and queued_after_ride_id=_ride_id
    and status='procurar_motorista'
  order by queued_at asc nulls last, created_at asc
  limit 1
  for update;

  if found then
    v_driver_eligible :=
      v_driver.approval_status = 'aprovado'
      and v_driver.subscription_status in ('ativa','active')
      and v_driver.is_online is true;

    if v_driver_eligible then
      update public.rides
      set status='motorista_a_caminho',accepted_at=now(),queued_after_ride_id=null,
          request_expires_at=null,search_expires_at=null,
          security_code=coalesce(security_code,lpad((floor(random()*10000))::int::text,4,'0')),
          driver_latitude=v_driver.current_lat,driver_longitude=v_driver.current_lng,
          driver_heading=v_driver.current_heading,updated_at=now()
      where id=v_next.id;

      insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
      values (v_auth_user_id,'ride.queued_promoted','ride',v_next.id::text,
        jsonb_build_object('driver_id',v_driver.id,'driver_domain_user_id',v_profile_id,'previous_ride_id',_ride_id));
    else
      update public.rides
      set status='procurar_motorista',
          driver_id=null,
          accepted_driver_id=null,
          accepted_at=null,
          driver_arrived_at=null,
          current_offer_driver_id=null,
          driver_name=null,
          driver_photo=null,
          driver_phone=null,
          driver_vehicle_model=null,
          driver_vehicle_color=null,
          driver_vehicle_plate=null,
          driver_rating=null,
          driver_latitude=null,
          driver_longitude=null,
          driver_heading=null,
          security_code=null,
          candidate_driver_ids=array_remove(coalesce(candidate_driver_ids,'{}'::uuid[]),v_profile_id),
          offered_driver_ids=array_remove(coalesce(offered_driver_ids,'{}'::uuid[]),v_profile_id),
          rejected_driver_ids=case
            when v_profile_id=any(coalesce(rejected_driver_ids,'{}'::uuid[]))
              then coalesce(rejected_driver_ids,'{}'::uuid[])
            else array_append(coalesce(rejected_driver_ids,'{}'::uuid[]),v_profile_id)
          end,
          request_expires_at=now(),
          search_expires_at=case
            when search_expires_at is null or search_expires_at<=now()
              then now()+interval '8 minutes'
            else search_expires_at
          end,
          queued_after_ride_id=null,
          queued_at=null,
          updated_at=now()
      where id=v_next.id;

      insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
      values (v_auth_user_id,'ride.queued_released_ineligible_driver','ride',v_next.id::text,
        jsonb_build_object(
          'driver_id',v_driver.id,
          'driver_domain_user_id',v_profile_id,
          'previous_ride_id',_ride_id,
          'approval_status',v_driver.approval_status,
          'subscription_status',v_driver.subscription_status,
          'is_online',v_driver.is_online
        ));
    end if;
  end if;

  return to_jsonb(v_ride);
end;
$function$;
