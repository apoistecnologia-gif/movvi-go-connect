#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 <<'SQL'
-- Deterministic identities used only by the ephemeral CI database.
insert into auth.users(id,email,raw_user_meta_data) values
  (
    '11111111-1111-4111-8111-111111111111',
    'passenger-phase8@example.test',
    jsonb_build_object(
      'role','passenger','name','Passageiro Fase 8','phone','87999990001',
      'terms_accepted','true','privacy_accepted','true',
      'terms_version','ci','privacy_version','ci','legal_acceptance_source','passenger_signup'
    )
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'driver-phase8@example.test',
    jsonb_build_object('role','driver','name','Motorista Fase 8','phone','87999990002')
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'admin-phase8@example.test',
    jsonb_build_object('name','Admin Fase 8')
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'support-phase8@example.test',
    jsonb_build_object('name','Suporte Fase 8')
  );

-- Bootstrap one explicit administrator. Staff authorization belongs to
-- profiles/app_role/role_permissions; mobility user_roles is not used here.
update public.profiles
set role='administrator'::public.app_role, active=true
where user_id='33333333-3333-4333-8333-333333333333';

-- A passenger mobility role must never imply Admin access.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
begin
  if public.admin_is_authorized() then
    raise exception 'passenger unexpectedly authorized as admin';
  end if;
end $$;

-- The same passenger must not be able to invoke a privileged mutation.
do $$
declare v_category uuid;
begin
  select id into v_category from public.ride_categories where code='carros';
  begin
    perform public.admin_update_ride_category(
      v_category,'Não deve salvar',null,null,null,null,null,10,true
    );
    raise exception 'passenger admin mutation unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- Switch the emulated JWT to the explicit staff administrator.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$
declare v_context jsonb;
begin
  if not public.admin_is_authorized() then
    raise exception 'administrator was not authorized';
  end if;

  v_context:=public.admin_get_access_context();
  if v_context #>> '{role}' <> 'administrator' then
    raise exception 'wrong admin role in access context: %',v_context;
  end if;
  if not (v_context->'permissions') ? 'drivers.manage' then
    raise exception 'drivers.manage missing from admin permissions: %',v_context;
  end if;
  if not public.admin_has_permission('finance.read') then
    raise exception 'finance.read missing for administrator';
  end if;
end $$;

-- Provision and update staff through the canonical staff plane.
do $$
declare v_staff jsonb;
begin
  v_staff:=public.admin_provision_staff(
    '44444444-4444-4444-8444-444444444444',
    'support'::public.app_role,
    'Equipe Suporte CI'
  );
  if v_staff #>> '{role}' <> 'support' or (v_staff #>> '{active}')::boolean is not true then
    raise exception 'support provisioning failed: %',v_staff;
  end if;

  v_staff:=public.admin_set_staff_profile(
    '44444444-4444-4444-8444-444444444444',
    'reader'::public.app_role,
    true,
    'Leitura CI'
  );
  if v_staff #>> '{role}' <> 'reader' then
    raise exception 'staff role update failed: %',v_staff;
  end if;
end $$;

-- Category contract: fixed code, editable presentation/availability only.
do $$
declare v_category_id uuid; v_category jsonb;
begin
  select id into v_category_id from public.ride_categories where code='carros';
  v_category:=public.admin_update_ride_category(
    v_category_id,
    'Carro APOIS',
    'Categoria canônica de carros',
    'Car',
    null,
    'Até 4 passageiros',
    'ETA calculado',
    10,
    true
  );
  if v_category #>> '{code}' <> 'carros' or v_category #>> '{name}' <> 'Carro APOIS' then
    raise exception 'canonical category update failed: %',v_category;
  end if;
  if (select count(*) from public.ride_categories) <> 5 then
    raise exception 'category domain changed unexpectedly';
  end if;
end $$;

-- Tariff contract: one typed row for category/city, no arbitrary key/value rule.
do $$
declare v_rule jsonb;
begin
  v_rule:=public.admin_upsert_tariff_rule(
    _category_code=>'carros',
    _city=>'Petrolina',
    _base_fare=>5.00,
    _min_fare=>8.00,
    _per_km=>2.25,
    _per_min=>0.30,
    _stop_fee=>1.50,
    _fixed_fee=>0.00,
    _dynamic_multiplier=>1.00,
    _helper1_fee=>0.00,
    _helper2_fee=>0.00,
    _heavy_furniture_fee=>0.00,
    _assembly_fee=>0.00,
    _packing_fee=>0.00,
    _difficult_access_fee=>0.00,
    _stair_fee=>0.00,
    _heavy_vehicle_fee=>0.00,
    _accident_fee=>0.00,
    _platform_fee=>0.00,
    _locked_wheels_fee=>0.00,
    _garage_fee=>0.00,
    _max_weight_kg=>0.00,
    _per_kg=>0.00,
    _is_active=>true
  );
  if v_rule #>> '{city}' <> 'Petrolina' then
    raise exception 'canonical tariff city mismatch: %',v_rule;
  end if;
  if (v_rule #>> '{per_km}')::numeric <> 2.25 then
    raise exception 'canonical tariff per_km mismatch: %',v_rule;
  end if;
end $$;

-- Create a real Driver entity for moderation and ride fixtures.
do $$
declare v_user_id uuid; v_driver_id uuid; v_driver jsonb;
begin
  select id into v_user_id
  from public.users
  where auth_user_id='22222222-2222-4222-8222-222222222222';

  insert into public.drivers(
    user_id,name,email,phone,category,vehicle_model,vehicle_plate,vehicle_color,
    approval_status,documents_status,subscription_status,is_online
  ) values(
    v_user_id,'Motorista Fase 8','driver-phase8@example.test','87999990002','carros',
    'Teste CI','ABC1D23','Preto','em_analise','pending_review','teste',false
  ) returning id into v_driver_id;

  v_driver:=public.admin_set_driver_approval(v_driver_id,'aprovado',null);
  if v_driver #>> '{approval_status}' <> 'aprovado' or v_driver #>> '{documents_status}' <> 'approved' then
    raise exception 'driver approval failed: %',v_driver;
  end if;

  v_driver:=public.admin_set_driver_suspension(v_driver_id,true,'Teste de suspensão da Fase 8');
  if (v_driver #>> '{suspended_at}') is null then
    raise exception 'driver suspension failed: %',v_driver;
  end if;

  v_driver:=public.admin_set_driver_suspension(v_driver_id,false,null);
  if (v_driver #>> '{suspended_at}') is not null then
    raise exception 'driver unsuspension failed: %',v_driver;
  end if;
end $$;

-- Passenger moderation uses operational soft state, never a direct hard DELETE.
do $$
declare v_passenger_id uuid; v_result jsonb;
begin
  select id into v_passenger_id
  from public.users
  where auth_user_id='11111111-1111-4111-8111-111111111111';

  v_result:=public.admin_set_passenger_status(v_passenger_id,'block','Teste de bloqueio da Fase 8');
  if (v_result #>> '{blocked_at}') is null then
    raise exception 'passenger block failed: %',v_result;
  end if;

  v_result:=public.admin_set_passenger_status(v_passenger_id,'unblock',null);
  if (v_result #>> '{blocked_at}') is not null then
    raise exception 'passenger unblock failed: %',v_result;
  end if;
end $$;

-- Create operational and financial fixtures under the canonical identity model.
do $$
declare
  v_passenger_id uuid;
  v_driver_id uuid;
  v_active_ride uuid;
  v_completed_ride uuid;
  v_sos uuid;
  v_ticket uuid;
  v_result jsonb;
begin
  select id into v_passenger_id
  from public.users
  where auth_user_id='11111111-1111-4111-8111-111111111111';
  select d.id into v_driver_id
  from public.drivers d
  join public.users u on u.id=d.user_id
  where u.auth_user_id='22222222-2222-4222-8222-222222222222';

  insert into public.rides(
    passenger_id,driver_id,accepted_driver_id,category,status,
    origin,destination,origin_name,destination_name,
    origin_lat,origin_lng,destination_lat,destination_lng,
    estimated_price,final_price,payment_method,request_key,accepted_at
  ) values(
    v_passenger_id,v_driver_id,v_driver_id,'carros','motorista_a_caminho',
    jsonb_build_object('lat',-9.389,'lng',-40.503),
    jsonb_build_object('lat',-9.420,'lng',-40.500),
    'Origem operacional','Destino operacional',
    -9.389,-40.503,-9.420,-40.500,
    20.00,null,'cash','55555555-5555-4555-8555-555555555555',now()
  ) returning id into v_active_ride;

  insert into public.sos_alerts(user_id,driver_id,ride_id,lat,lng,message,severity,status)
  values(v_passenger_id,v_driver_id,v_active_ride,-9.390,-40.502,'SOS CI','critical','open')
  returning id into v_sos;

  v_result:=public.admin_update_sos_alert(v_sos,'acknowledged');
  if v_result #>> '{status}' <> 'acknowledged' then
    raise exception 'SOS acknowledge failed: %',v_result;
  end if;
  v_result:=public.admin_update_sos_alert(v_sos,'resolved');
  if v_result #>> '{status}' <> 'resolved' then
    raise exception 'SOS resolve failed: %',v_result;
  end if;

  insert into public.passenger_support_tickets(
    protocol,passenger_id,ride_id,category,subject,message,status,priority
  ) values(
    'CI-P8-0001',v_passenger_id,v_active_ride,'ride_issue','Teste suporte','Mensagem de teste','open','normal'
  ) returning id into v_ticket;

  v_result:=public.admin_update_support_ticket(v_ticket,'in_progress','urgent');
  if v_result #>> '{status}' <> 'in_progress' or v_result #>> '{priority}' <> 'urgent' then
    raise exception 'support update failed: %',v_result;
  end if;

  insert into public.rides(
    passenger_id,driver_id,accepted_driver_id,category,status,
    origin,destination,origin_name,destination_name,
    origin_lat,origin_lng,destination_lat,destination_lng,
    estimated_price,final_price,payment_method,request_key,
    accepted_at,driver_arrived_at,started_at,completed_at
  ) values(
    v_passenger_id,v_driver_id,v_driver_id,'carros','finalizada',
    jsonb_build_object('lat',-9.389,'lng',-40.503),
    jsonb_build_object('lat',-9.420,'lng',-40.500),
    'Origem financeira','Destino financeiro',
    -9.389,-40.503,-9.420,-40.500,
    25.00,25.00,'cash','66666666-6666-4666-8666-666666666666',
    now()-interval '30 minutes',now()-interval '25 minutes',now()-interval '20 minutes',now()-interval '5 minutes'
  ) returning id into v_completed_ride;

  insert into public.ride_settlements(
    ride_id,passenger_id,driver_id,
    gross_amount_cents,discount_amount_cents,passenger_charge_cents,
    platform_fee_cents,driver_earning_cents,payment_provider_fee_cents,
    cash_amount_cents,wallet_amount_cents,refunded_amount_cents,
    payment_method,payment_status,status,settled_at
  ) values(
    v_completed_ride,v_passenger_id,v_driver_id,
    2500,0,2500,
    0,2500,100,
    2500,0,0,
    'cash','paid','settled',now()
  );

  insert into public.driver_withdrawals(
    driver_id,amount,status,idempotency_key,amount_cents
  ) values(
    v_driver_id,5.00,'pending','77777777-7777-4777-8777-777777777777',500
  );
end $$;

-- Dashboard semantics must distinguish GMV/driver earning/APOIS revenue.
do $$
declare v_metrics jsonb;
begin
  v_metrics:=public.admin_get_dashboard_metrics();
  if (v_metrics #>> '{finance,today,gmv_cents}')::bigint <> 2500 then
    raise exception 'dashboard GMV mismatch: %',v_metrics;
  end if;
  if (v_metrics #>> '{finance,today,driver_earnings_cents}')::bigint <> 2500 then
    raise exception 'dashboard driver earnings mismatch: %',v_metrics;
  end if;
  if (v_metrics #>> '{finance,today,platform_revenue_cents}')::bigint <> 0 then
    raise exception 'dashboard platform revenue must be zero under current rule: %',v_metrics;
  end if;
  if (v_metrics #>> '{rides,active}')::integer <> 1 then
    raise exception 'dashboard active ride count mismatch: %',v_metrics;
  end if;
end $$;

-- Finance summary must be settlement-backed and express money in integer cents.
do $$
declare v_finance jsonb;
begin
  v_finance:=public.admin_get_finance_summary(now()-interval '1 day',now()+interval '1 minute');
  if (v_finance #>> '{settlements,gmv_cents}')::bigint <> 2500 then
    raise exception 'finance GMV mismatch: %',v_finance;
  end if;
  if (v_finance #>> '{settlements,driver_earnings_cents}')::bigint <> 2500 then
    raise exception 'finance driver earnings mismatch: %',v_finance;
  end if;
  if (v_finance #>> '{settlements,platform_revenue_cents}')::bigint <> 0 then
    raise exception 'finance APOIS revenue mismatch: %',v_finance;
  end if;
  if (v_finance #>> '{settlements,provider_fees_cents}')::bigint <> 100 then
    raise exception 'finance provider fees mismatch: %',v_finance;
  end if;
  if (v_finance #>> '{withdrawals,pending_cents}')::bigint <> 500 then
    raise exception 'finance pending withdrawal mismatch: %',v_finance;
  end if;
end $$;

-- Critical mutations must have server-side audit events.
do $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.audit_logs
  where actor_id='33333333-3333-4333-8333-333333333333'
    and action like 'admin.%';
  if v_count < 8 then
    raise exception 'too few canonical admin audit events: %',v_count;
  end if;
end $$;

-- Finally prove that operational deletion is soft and preserves Auth identity.
do $$
declare v_passenger_id uuid; v_result jsonb;
begin
  select id into v_passenger_id
  from public.users
  where auth_user_id='11111111-1111-4111-8111-111111111111';

  v_result:=public.admin_set_passenger_status(
    v_passenger_id,'soft_delete','Teste de exclusão operacional da Fase 8'
  );
  if (v_result #>> '{deleted_at}') is null then
    raise exception 'passenger soft delete did not set deleted_at: %',v_result;
  end if;
  if not exists(select 1 from auth.users where id='11111111-1111-4111-8111-111111111111') then
    raise exception 'soft delete incorrectly removed auth identity';
  end if;
end $$;
SQL

echo "APOIS_ADMIN_PHASE8_DB_OK"
