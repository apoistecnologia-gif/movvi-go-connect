-- Consolida o Admin APOIS Corridas no mesmo padrão seguro já usado por
-- admin_set_driver_approval: implementação privilegiada em schema privado e
-- wrapper público SECURITY INVOKER. Assim o navegador nunca recebe UPDATE/INSERT
-- direto nas tabelas protegidas e o Security Advisor não precisa aceitar RPC
-- SECURITY DEFINER exposta no schema public.

create schema if not exists apois_rpc_private;
grant usage on schema apois_rpc_private to authenticated;

create or replace function apois_rpc_private.admin_set_driver_suspension(
  _driver_id uuid,
  _suspended boolean,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.drivers%rowtype;
  v_after public.drivers%rowtype;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('users.manage') then raise exception 'forbidden' using errcode='42501'; end if;

  select * into v_before from public.drivers where id=_driver_id for update;
  if not found then raise exception 'driver_not_found' using errcode='P0002'; end if;

  if _suspended then
    update public.drivers
       set approval_status='suspenso', suspended_at=coalesce(suspended_at,now()), is_online=false, updated_at=now()
     where id=_driver_id returning * into v_after;
  else
    update public.drivers
       set approval_status='aprovado', suspended_at=null, updated_at=now()
     where id=_driver_id returning * into v_after;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (
    v_actor,
    case when _suspended then 'admin.driver.suspended' else 'admin.driver.unsuspended' end,
    'driver',
    _driver_id::text,
    jsonb_build_object(
      'reason',nullif(btrim(coalesce(_reason,'')),''),
      'before',jsonb_build_object('approval_status',v_before.approval_status,'suspended_at',v_before.suspended_at,'is_online',v_before.is_online),
      'after',jsonb_build_object('approval_status',v_after.approval_status,'suspended_at',v_after.suspended_at,'is_online',v_after.is_online)
    )
  );

  return to_jsonb(v_after);
end;
$$;

create or replace function apois_rpc_private.admin_set_passenger_status(
  _passenger_id uuid,
  _action text,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.users%rowtype;
  v_after public.users%rowtype;
  v_action text := lower(btrim(coalesce(_action,'')));
  v_reason text := nullif(left(btrim(coalesce(_reason,'')),500),'');
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('users.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_action not in ('suspend','unsuspend','block','unblock','soft_delete') then raise exception 'unsupported_passenger_action' using errcode='22023'; end if;
  if v_action in ('suspend','block','soft_delete') and v_reason is null then raise exception 'reason_required' using errcode='22023'; end if;

  select u.* into v_before
  from public.users u
  where u.id=_passenger_id
    and exists (select 1 from public.user_roles ur where ur.user_id=u.id and ur.role::text='passenger')
  for update;
  if not found then raise exception 'passenger_not_found' using errcode='P0002'; end if;
  if v_before.deleted_at is not null and v_action <> 'soft_delete' then raise exception 'passenger_deleted' using errcode='55000'; end if;

  case v_action
    when 'suspend' then
      update public.users set suspended_at=coalesce(suspended_at,now()), suspended_until=null, updated_at=now()
      where id=_passenger_id returning * into v_after;
    when 'unsuspend' then
      update public.users set suspended_at=null, suspended_until=null, updated_at=now()
      where id=_passenger_id returning * into v_after;
    when 'block' then
      update public.users set blocked_at=coalesce(blocked_at,now()), block_reason=v_reason, updated_at=now()
      where id=_passenger_id returning * into v_after;
    when 'unblock' then
      update public.users set blocked_at=null, block_reason=null, updated_at=now()
      where id=_passenger_id returning * into v_after;
    when 'soft_delete' then
      update public.users
      set deleted_at=coalesce(deleted_at,now()),
          blocked_at=coalesce(blocked_at,now()),
          block_reason=coalesce(v_reason,block_reason,'Exclusão operacional'),
          suspended_at=coalesce(suspended_at,now()),
          suspended_until=null,
          updated_at=now()
      where id=_passenger_id returning * into v_after;
  end case;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (
    v_actor,
    case v_action
      when 'suspend' then 'admin.passenger.suspended'
      when 'unsuspend' then 'admin.passenger.unsuspended'
      when 'block' then 'admin.passenger.blocked'
      when 'unblock' then 'admin.passenger.unblocked'
      when 'soft_delete' then 'admin.passenger.operationally_deleted'
    end,
    'passenger',
    _passenger_id::text,
    jsonb_build_object(
      'reason',v_reason,
      'before',jsonb_build_object('suspended_at',v_before.suspended_at,'suspended_until',v_before.suspended_until,'blocked_at',v_before.blocked_at,'block_reason',v_before.block_reason,'deleted_at',v_before.deleted_at),
      'after',jsonb_build_object('suspended_at',v_after.suspended_at,'suspended_until',v_after.suspended_until,'blocked_at',v_after.blocked_at,'block_reason',v_after.block_reason,'deleted_at',v_after.deleted_at),
      'auth_user_deleted',false
    )
  );

  return to_jsonb(v_after);
end;
$$;

create or replace function apois_rpc_private.admin_update_ride_category(
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
security definer
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
    v_actor,'admin.ride_category.updated','ride_category',_category_id::text,
    jsonb_build_object(
      'code',v_row.code,
      'before',jsonb_build_object('name',v_before.name,'description',v_before.description,'icon',v_before.icon,'image_url',v_before.image_url,'capacity_label',v_before.capacity_label,'eta_label',v_before.eta_label,'sort_order',v_before.sort_order,'is_active',v_before.is_active),
      'after',jsonb_build_object('name',v_row.name,'description',v_row.description,'icon',v_row.icon,'image_url',v_row.image_url,'capacity_label',v_row.capacity_label,'eta_label',v_row.eta_label,'sort_order',v_row.sort_order,'is_active',v_row.is_active)
    )
  );

  return to_jsonb(v_row);
end;
$$;

create or replace function apois_rpc_private.admin_upsert_tariff_rule(
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
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_category_id uuid;
  v_city text := coalesce(nullif(btrim(_city),''),'default');
  v_before public.tariff_rules%rowtype;
  v_row public.tariff_rules%rowtype;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('users.manage') then raise exception 'forbidden' using errcode='42501'; end if;

  select id into v_category_id from public.ride_categories where code=nullif(btrim(_category_code),'');
  if v_category_id is null then raise exception 'category_not_found' using errcode='P0002'; end if;

  if coalesce(_dynamic_multiplier,0) <= 0 or
     least(coalesce(_base_fare,0),coalesce(_min_fare,0),coalesce(_per_km,0),coalesce(_per_min,0),coalesce(_stop_fee,0),coalesce(_fixed_fee,0),coalesce(_helper1_fee,0),coalesce(_helper2_fee,0),coalesce(_heavy_furniture_fee,0),coalesce(_assembly_fee,0),coalesce(_packing_fee,0),coalesce(_difficult_access_fee,0),coalesce(_stair_fee,0),coalesce(_heavy_vehicle_fee,0),coalesce(_accident_fee,0),coalesce(_platform_fee,0),coalesce(_locked_wheels_fee,0),coalesce(_garage_fee,0),coalesce(_max_weight_kg,0),coalesce(_per_kg,0)) < 0
  then raise exception 'invalid_tariff_values' using errcode='22023'; end if;

  select * into v_before from public.tariff_rules where category_id=v_category_id and city=v_city for update;

  insert into public.tariff_rules(
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
    v_actor,'admin.tariff_rule.upserted','tariff_rule',v_row.id::text,
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

create or replace function apois_rpc_private.admin_set_staff_profile(
  _auth_user_id uuid,
  _role public.app_role,
  _active boolean,
  _display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.profiles%rowtype;
  v_after public.profiles%rowtype;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('roles.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if _auth_user_id is null or _role is null then raise exception 'invalid_staff_profile' using errcode='22023'; end if;

  select * into v_before from public.profiles where user_id=_auth_user_id for update;
  if not found then raise exception 'staff_profile_not_found' using errcode='P0002'; end if;
  if _auth_user_id=v_actor and (coalesce(_active,true)=false or _role<>v_before.role) then
    raise exception 'cannot_change_own_admin_access' using errcode='42501';
  end if;

  update public.profiles
  set role=_role,active=coalesce(_active,true),display_name=nullif(btrim(coalesce(_display_name,'')),''),updated_at=now()
  where user_id=_auth_user_id returning * into v_after;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (
    v_actor,'admin.staff_profile.updated','admin_profile',_auth_user_id::text,
    jsonb_build_object(
      'before',jsonb_build_object('role',v_before.role,'active',v_before.active,'display_name',v_before.display_name),
      'after',jsonb_build_object('role',v_after.role,'active',v_after.active,'display_name',v_after.display_name)
    )
  );

  return to_jsonb(v_after);
end;
$$;

create or replace function apois_rpc_private.admin_provision_staff(
  _auth_user_id uuid,
  _role public.app_role,
  _display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_row public.profiles%rowtype;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('roles.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if _auth_user_id is null or _role is null then raise exception 'invalid_staff_profile' using errcode='22023'; end if;
  if exists(select 1 from public.profiles where user_id=_auth_user_id) then raise exception 'staff_profile_exists' using errcode='23505'; end if;

  select email into v_email from auth.users where id=_auth_user_id;
  if v_email is null then raise exception 'auth_user_not_found' using errcode='P0002'; end if;

  insert into public.profiles(user_id,email,display_name,role,active,created_at,updated_at)
  values(_auth_user_id,v_email,nullif(btrim(coalesce(_display_name,'')),''),_role,true,now(),now())
  returning * into v_row;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_actor,'admin.staff_profile.provisioned','admin_profile',_auth_user_id::text,
    jsonb_build_object('role',v_row.role,'active',v_row.active,'display_name',v_row.display_name));

  return to_jsonb(v_row);
end;
$$;

create or replace function apois_rpc_private.admin_update_sos_alert(
  _alert_id uuid,
  _status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.sos_alerts%rowtype;
  v_after public.sos_alerts%rowtype;
  v_status text := lower(btrim(coalesce(_status,'')));
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('operations.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_status not in ('open','acknowledged','resolved','cancelled') then raise exception 'invalid_sos_status' using errcode='22023'; end if;

  select * into v_before from public.sos_alerts where id=_alert_id for update;
  if not found then raise exception 'sos_alert_not_found' using errcode='P0002'; end if;

  update public.sos_alerts set status=v_status,updated_at=now() where id=_alert_id returning * into v_after;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_actor,'admin.sos_alert.updated','sos_alert',_alert_id::text,
    jsonb_build_object('before_status',v_before.status,'after_status',v_after.status,'ride_id',v_after.ride_id,'driver_id',v_after.driver_id,'severity',v_after.severity));

  return to_jsonb(v_after);
end;
$$;

create or replace function apois_rpc_private.admin_update_support_ticket(
  _ticket_id uuid,
  _status text,
  _priority text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.passenger_support_tickets%rowtype;
  v_after public.passenger_support_tickets%rowtype;
  v_status text := lower(btrim(coalesce(_status,'')));
  v_priority text := lower(btrim(coalesce(_priority,'')));
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('support.read') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_status not in ('open','in_progress','resolved','closed') then raise exception 'invalid_support_status' using errcode='22023'; end if;
  if v_priority not in ('low','normal','high','urgent') then raise exception 'invalid_support_priority' using errcode='22023'; end if;

  select * into v_before from public.passenger_support_tickets where id=_ticket_id for update;
  if not found then raise exception 'support_ticket_not_found' using errcode='P0002'; end if;

  update public.passenger_support_tickets set status=v_status,priority=v_priority,updated_at=now()
  where id=_ticket_id returning * into v_after;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_actor,'admin.support_ticket.updated','support_ticket',_ticket_id::text,
    jsonb_build_object('protocol',v_after.protocol,'before',jsonb_build_object('status',v_before.status,'priority',v_before.priority),'after',jsonb_build_object('status',v_after.status,'priority',v_after.priority)));

  return to_jsonb(v_after);
end;
$$;

create or replace function apois_rpc_private.admin_get_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day_start timestamptz := (date_trunc('day',now() at time zone 'America/Recife') at time zone 'America/Recife');
  v_month_start timestamptz := (date_trunc('month',now() at time zone 'America/Recife') at time zone 'America/Recife');
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('metrics.read') then raise exception 'forbidden' using errcode='42501'; end if;

  select jsonb_build_object(
    'drivers',jsonb_build_object(
      'total',(select count(*) from public.drivers),
      'online',(select count(*) from public.drivers where is_online is true),
      'pending_review',(select count(*) from public.drivers where coalesce(approval_status,'') in ('em_analise','pendente','pending','pending_review') or coalesce(documents_status,'') in ('pending','pending_review','em_analise'))
    ),
    'passengers',jsonb_build_object(
      'total',(select count(distinct ur.user_id) from public.user_roles ur join public.users u on u.id=ur.user_id where ur.role::text='passenger' and u.deleted_at is null)
    ),
    'rides',jsonb_build_object(
      'active',(select count(*) from public.rides where status in ('procurar_motorista','motorista_a_caminho','motorista_chegou','em_viagem')),
      'completed_today',(select count(*) from public.rides where status='finalizada' and completed_at>=v_day_start and completed_at<v_day_start+interval '1 day'),
      'cancelled_today',(select count(*) from public.rides where status in ('cancelada_passageiro','cancelada_motorista') and cancelled_at>=v_day_start and cancelled_at<v_day_start+interval '1 day')
    ),
    'operations',jsonb_build_object(
      'open_sos',(select count(*) from public.sos_alerts where status in ('open','acknowledged')),
      'open_support',(select count(*) from public.passenger_support_tickets where lower(coalesce(status,'')) not in ('resolved','closed','cancelled','cancelado','resolvido','fechado'))
    ),
    'finance',jsonb_build_object(
      'today',jsonb_build_object(
        'gmv_cents',(select coalesce(round(sum(coalesce(passenger_charge,gross_amount))*100),0)::bigint from public.ride_settlements where status='settled' and settled_at>=v_day_start and settled_at<v_day_start+interval '1 day'),
        'driver_earnings_cents',(select coalesce(round(sum(coalesce(driver_earning,0))*100),0)::bigint from public.ride_settlements where status='settled' and settled_at>=v_day_start and settled_at<v_day_start+interval '1 day'),
        'platform_revenue_cents',(select coalesce(round(sum(coalesce(platform_fee,0))*100),0)::bigint from public.ride_settlements where status='settled' and settled_at>=v_day_start and settled_at<v_day_start+interval '1 day'),
        'provider_fees_cents',(select coalesce(round(sum(coalesce(payment_provider_fee,0))*100),0)::bigint from public.ride_settlements where status='settled' and settled_at>=v_day_start and settled_at<v_day_start+interval '1 day')
      ),
      'month',jsonb_build_object(
        'gmv_cents',(select coalesce(round(sum(coalesce(passenger_charge,gross_amount))*100),0)::bigint from public.ride_settlements where status='settled' and settled_at>=v_month_start and settled_at<v_month_start+interval '1 month'),
        'driver_earnings_cents',(select coalesce(round(sum(coalesce(driver_earning,0))*100),0)::bigint from public.ride_settlements where status='settled' and settled_at>=v_month_start and settled_at<v_month_start+interval '1 month'),
        'platform_revenue_cents',(select coalesce(round(sum(coalesce(platform_fee,0))*100),0)::bigint from public.ride_settlements where status='settled' and settled_at>=v_month_start and settled_at<v_month_start+interval '1 month'),
        'provider_fees_cents',(select coalesce(round(sum(coalesce(payment_provider_fee,0))*100),0)::bigint from public.ride_settlements where status='settled' and settled_at>=v_month_start and settled_at<v_month_start+interval '1 month')
      )
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function apois_rpc_private.admin_get_finance_summary(
  _from timestamptz,
  _to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_from timestamptz := coalesce(_from,date_trunc('month',now()));
  v_to timestamptz := coalesce(_to,now());
  v_result jsonb;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('finance.read') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_from>v_to then raise exception 'invalid_range' using errcode='22023'; end if;

  with filtered_settlements as (
    select * from public.ride_settlements where created_at between v_from and v_to
  ), filtered_withdrawals as (
    select * from public.driver_withdrawals where requested_at between v_from and v_to
  ), settlement_totals as (
    select
      coalesce(sum(passenger_charge) filter(where status='settled'),0) as gmv,
      coalesce(sum(driver_earning) filter(where status='settled'),0) as driver_earnings,
      coalesce(sum(platform_fee) filter(where status='settled'),0) as platform_revenue,
      coalesce(sum(payment_provider_fee) filter(where status='settled'),0) as provider_fees,
      coalesce(sum(refunded_amount),0) as refunds,
      count(*) filter(where status='settled') as settled_count,
      count(*) filter(where status in ('pending','awaiting_payment','processing')) as pending_count,
      count(*) filter(where status in ('failed','payment_failed')) as failed_count
    from filtered_settlements
  ), withdrawal_totals as (
    select
      coalesce(sum(amount) filter(where status in ('pending','requested','processing')),0) as pending_amount,
      coalesce(sum(amount) filter(where status in ('paid','completed')),0) as paid_amount
    from filtered_withdrawals
  ), recent_settlements as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',ride_id,'ride_id',ride_id,'driver_id',driver_id,'passenger_id',passenger_id,
      'payment_method',payment_method,'payment_status',payment_status,'status',status,
      'passenger_charge_cents',round(coalesce(passenger_charge,0)*100)::bigint,
      'driver_earning_cents',round(coalesce(driver_earning,0)*100)::bigint,
      'platform_fee_cents',round(coalesce(platform_fee,0)*100)::bigint,
      'payment_provider_fee_cents',round(coalesce(payment_provider_fee,0)*100)::bigint,
      'refunded_amount_cents',round(coalesce(refunded_amount,0)*100)::bigint,
      'created_at',created_at,'settled_at',settled_at
    ) order by created_at desc),'[]'::jsonb) as rows
    from (select * from filtered_settlements order by created_at desc limit 50) s
  ), recent_withdrawals as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'driver_id',driver_id,'amount_cents',round(coalesce(amount,0)*100)::bigint,
      'status',status,'provider',provider,'provider_transfer_id',provider_transfer_id,
      'failure_reason',failure_reason,'requested_at',requested_at,'processed_at',processed_at
    ) order by requested_at desc),'[]'::jsonb) as rows
    from (select * from filtered_withdrawals order by requested_at desc limit 50) w
  )
  select jsonb_build_object(
    'from',v_from,'to',v_to,
    'settlements',jsonb_build_object(
      'gmv_cents',round(st.gmv*100)::bigint,
      'driver_earnings_cents',round(st.driver_earnings*100)::bigint,
      'platform_revenue_cents',round(st.platform_revenue*100)::bigint,
      'provider_fees_cents',round(st.provider_fees*100)::bigint,
      'refunds_cents',round(st.refunds*100)::bigint,
      'settled_count',st.settled_count,'pending_count',st.pending_count,'failed_count',st.failed_count
    ),
    'withdrawals',jsonb_build_object('pending_cents',round(wt.pending_amount*100)::bigint,'paid_cents',round(wt.paid_amount*100)::bigint),
    'providers',jsonb_build_object('electronic_payment_provider',null,'payout_provider',null),
    'recent_settlements',rs.rows,'recent_withdrawals',rw.rows
  ) into v_result
  from settlement_totals st cross join withdrawal_totals wt cross join recent_settlements rs cross join recent_withdrawals rw;

  return v_result;
end;
$$;

-- Wrappers públicos não possuem privilégios elevados; apenas encaminham para
-- implementações privadas que revalidam auth.uid() + permission.
create or replace function public.admin_set_driver_suspension(uuid,boolean,text)
returns jsonb language sql set search_path='' as $$ select apois_rpc_private.admin_set_driver_suspension($1,$2,$3); $$;
create or replace function public.admin_set_passenger_status(uuid,text,text)
returns jsonb language sql set search_path='' as $$ select apois_rpc_private.admin_set_passenger_status($1,$2,$3); $$;
create or replace function public.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean)
returns jsonb language sql set search_path='' as $$ select apois_rpc_private.admin_update_ride_category($1,$2,$3,$4,$5,$6,$7,$8,$9); $$;
create or replace function public.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean)
returns jsonb language sql set search_path='' as $$ select apois_rpc_private.admin_upsert_tariff_rule($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24); $$;
create or replace function public.admin_set_staff_profile(uuid,public.app_role,boolean,text)
returns jsonb language sql set search_path='' as $$ select apois_rpc_private.admin_set_staff_profile($1,$2,$3,$4); $$;
create or replace function public.admin_provision_staff(uuid,public.app_role,text)
returns jsonb language sql set search_path='' as $$ select apois_rpc_private.admin_provision_staff($1,$2,$3); $$;
create or replace function public.admin_update_sos_alert(uuid,text)
returns jsonb language sql set search_path='' as $$ select apois_rpc_private.admin_update_sos_alert($1,$2); $$;
create or replace function public.admin_update_support_ticket(uuid,text,text)
returns jsonb language sql set search_path='' as $$ select apois_rpc_private.admin_update_support_ticket($1,$2,$3); $$;
create or replace function public.admin_get_dashboard_metrics()
returns jsonb language sql set search_path='' as $$ select apois_rpc_private.admin_get_dashboard_metrics(); $$;
create or replace function public.admin_get_finance_summary(timestamptz,timestamptz)
returns jsonb language sql set search_path='' as $$ select apois_rpc_private.admin_get_finance_summary($1,$2); $$;

-- O chamador precisa poder executar a implementação privada, mas ela não é
-- publicada pela API REST porque o schema privado não é exposto.
grant execute on function apois_rpc_private.admin_set_driver_suspension(uuid,boolean,text) to authenticated;
grant execute on function apois_rpc_private.admin_set_passenger_status(uuid,text,text) to authenticated;
grant execute on function apois_rpc_private.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) to authenticated;
grant execute on function apois_rpc_private.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) to authenticated;
grant execute on function apois_rpc_private.admin_set_staff_profile(uuid,public.app_role,boolean,text) to authenticated;
grant execute on function apois_rpc_private.admin_provision_staff(uuid,public.app_role,text) to authenticated;
grant execute on function apois_rpc_private.admin_update_sos_alert(uuid,text) to authenticated;
grant execute on function apois_rpc_private.admin_update_support_ticket(uuid,text,text) to authenticated;
grant execute on function apois_rpc_private.admin_get_dashboard_metrics() to authenticated;
grant execute on function apois_rpc_private.admin_get_finance_summary(timestamptz,timestamptz) to authenticated;

revoke all on function public.admin_set_driver_suspension(uuid,boolean,text) from public,anon;
revoke all on function public.admin_set_passenger_status(uuid,text,text) from public,anon;
revoke all on function public.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) from public,anon;
revoke all on function public.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) from public,anon;
revoke all on function public.admin_set_staff_profile(uuid,public.app_role,boolean,text) from public,anon;
revoke all on function public.admin_provision_staff(uuid,public.app_role,text) from public,anon;
revoke all on function public.admin_update_sos_alert(uuid,text) from public,anon;
revoke all on function public.admin_update_support_ticket(uuid,text,text) from public,anon;
revoke all on function public.admin_get_dashboard_metrics() from public,anon;
revoke all on function public.admin_get_finance_summary(timestamptz,timestamptz) from public,anon;

grant execute on function public.admin_set_driver_suspension(uuid,boolean,text) to authenticated;
grant execute on function public.admin_set_passenger_status(uuid,text,text) to authenticated;
grant execute on function public.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) to authenticated;
grant execute on function public.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) to authenticated;
grant execute on function public.admin_set_staff_profile(uuid,public.app_role,boolean,text) to authenticated;
grant execute on function public.admin_provision_staff(uuid,public.app_role,text) to authenticated;
grant execute on function public.admin_update_sos_alert(uuid,text) to authenticated;
grant execute on function public.admin_update_support_ticket(uuid,text,text) to authenticated;
grant execute on function public.admin_get_dashboard_metrics() to authenticated;
grant execute on function public.admin_get_finance_summary(timestamptz,timestamptz) to authenticated;
