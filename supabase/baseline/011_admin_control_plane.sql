-- APOIS CORRIDAS — CANONICAL BASELINE 011
-- Phase 8: Admin RBAC, operational control plane, metrics and audit.
-- Fresh-database baseline only. Do not execute ad-hoc on production.

-- -----------------------------------------------------------------------------
-- Permissions
-- Keep the existing app_role enum stable in this phase. Functional access is
-- expressed by permissions, not by mobility user_roles or frontend checks.
-- -----------------------------------------------------------------------------
insert into public.role_permissions(role,permission) values
  ('administrator','metrics.read'),
  ('administrator','rides.read'),
  ('administrator','rides.manage'),
  ('administrator','drivers.read'),
  ('administrator','drivers.manage'),
  ('administrator','passengers.read'),
  ('administrator','passengers.manage'),
  ('administrator','pricing.read'),
  ('administrator','pricing.manage'),
  ('administrator','finance.read'),
  ('administrator','finance.manage'),
  ('administrator','operations.read'),
  ('administrator','operations.manage'),
  ('administrator','support.read'),
  ('administrator','support.manage'),
  ('administrator','notifications.send'),
  ('administrator','roles.manage'),
  ('administrator','settings.manage'),
  ('support','metrics.read'),
  ('support','rides.read'),
  ('support','drivers.read'),
  ('support','passengers.read'),
  ('support','operations.read'),
  ('support','operations.manage'),
  ('support','support.read'),
  ('support','support.manage'),
  ('reader','metrics.read'),
  ('reader','rides.read'),
  ('reader','drivers.read'),
  ('reader','passengers.read'),
  ('reader','operations.read')
on conflict(role,permission) do nothing;

-- -----------------------------------------------------------------------------
-- Canonical Admin access helpers
-- -----------------------------------------------------------------------------
create or replace function public.admin_is_authorized()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select private.has_permission('admin.access');
$$;

create or replace function public.admin_has_permission(_permission text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select
    nullif(btrim(coalesce(_permission,'')),'') is not null
    and private.has_permission(btrim(_permission));
$$;

create or replace function public.admin_get_access_context()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_permissions jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_profile
  from public.profiles
  where user_id=auth.uid()
  limit 1;

  if not found or not v_profile.active or not private.has_permission('admin.access') then
    raise exception 'forbidden' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(rp.permission order by rp.permission),'[]'::jsonb)
  into v_permissions
  from public.role_permissions rp
  where rp.role=v_profile.role;

  return jsonb_build_object(
    'authorized',true,
    'role',v_profile.role,
    'display_name',v_profile.display_name,
    'email',v_profile.email,
    'permissions',v_permissions
  );
end;
$$;

revoke all on function public.admin_is_authorized() from public,anon;
grant execute on function public.admin_is_authorized() to authenticated;
revoke all on function public.admin_has_permission(text) from public,anon;
grant execute on function public.admin_has_permission(text) to authenticated;
revoke all on function public.admin_get_access_context() from public,anon;
grant execute on function public.admin_get_access_context() to authenticated;

-- Internal audit primitive. Critical mutations below write audit in the same
-- server-side operation rather than relying on a best-effort browser INSERT.
create or replace function private.admin_audit(
  _action text,
  _entity_type text,
  _entity_id text default null,
  _metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),
    left(coalesce(_action,'admin.unknown'),160),
    left(coalesce(_entity_type,'unknown'),120),
    nullif(left(coalesce(_entity_id,''),200),''),
    coalesce(_metadata,'{}'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Granular staff read policies. Existing administrator/users.manage policies
-- remain compatible, while support/reader access is permission driven.
-- -----------------------------------------------------------------------------
create policy users_staff_read on public.users for select to authenticated
  using (private.has_permission('passengers.read'));
create policy drivers_staff_read on public.drivers for select to authenticated
  using (private.has_permission('drivers.read'));
create policy rides_staff_read on public.rides for select to authenticated
  using (private.has_permission('rides.read'));
create policy ride_categories_staff_read on public.ride_categories for select to authenticated
  using (private.has_permission('pricing.read'));
create policy tariff_rules_staff_read on public.tariff_rules for select to authenticated
  using (private.has_permission('pricing.read'));
create policy sos_alerts_staff_read on public.sos_alerts for select to authenticated
  using (private.has_permission('operations.read'));
create policy support_tickets_staff_read on public.passenger_support_tickets for select to authenticated
  using (private.has_permission('support.read'));
create policy driver_withdrawals_finance_read on public.driver_withdrawals for select to authenticated
  using (private.has_permission('finance.read'));
create policy driver_wallets_finance_read on public.driver_wallets for select to authenticated
  using (private.has_permission('finance.read'));
create policy driver_wallet_transactions_finance_read on public.driver_wallet_transactions for select to authenticated
  using (private.has_permission('finance.read'));
create policy cancellation_fees_finance_read on public.cancellation_fees for select to authenticated
  using (private.has_permission('finance.read'));

-- -----------------------------------------------------------------------------
-- Driver moderation
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_driver_approval(
  _driver_id uuid,
  _status text,
  _reason text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_driver public.drivers%rowtype;
  v_status text:=lower(btrim(coalesce(_status,'')));
  v_reason text:=nullif(left(btrim(coalesce(_reason,'')),500),'');
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('drivers.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if _driver_id is null or v_status not in ('em_analise','aprovado','reprovado','bloqueado') then
    raise exception 'invalid_driver_approval' using errcode='22023';
  end if;
  if v_status='reprovado' and v_reason is null then
    raise exception 'rejection_reason_required' using errcode='22023';
  end if;

  update public.drivers set
    approval_status=v_status,
    motivo_reprovacao=case when v_status='reprovado' then v_reason else null end,
    documents_status=case
      when v_status='aprovado' then 'approved'
      when v_status='reprovado' then 'rejected'
      when v_status='em_analise' then 'pending_review'
      else documents_status
    end,
    approved_at=case when v_status='aprovado' then now() else null end,
    blocked_at=case when v_status='bloqueado' then now() else null end,
    is_online=case when v_status='aprovado' then is_online else false end,
    updated_at=now()
  where id=_driver_id
  returning * into v_driver;

  if not found then raise exception 'driver_not_found' using errcode='P0002'; end if;

  perform private.admin_audit(
    'admin.driver.approval_changed','driver',v_driver.id::text,
    jsonb_build_object('status',v_status,'reason',v_reason,'documents_status',v_driver.documents_status)
  );
  return to_jsonb(v_driver);
end;
$$;
revoke all on function public.admin_set_driver_approval(uuid,text,text) from public,anon;
grant execute on function public.admin_set_driver_approval(uuid,text,text) to authenticated;

create or replace function public.admin_set_driver_suspension(
  _driver_id uuid,
  _suspended boolean,
  _reason text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_driver public.drivers%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('drivers.manage') then raise exception 'forbidden' using errcode='42501'; end if;

  update public.drivers set
    suspended_at=case when _suspended then now() else null end,
    is_online=case when _suspended then false else is_online end,
    updated_at=now()
  where id=_driver_id
  returning * into v_driver;
  if not found then raise exception 'driver_not_found' using errcode='P0002'; end if;

  perform private.admin_audit(
    case when _suspended then 'admin.driver.suspended' else 'admin.driver.unsuspended' end,
    'driver',v_driver.id::text,
    jsonb_build_object('reason',nullif(left(btrim(coalesce(_reason,'')),500),''))
  );
  return to_jsonb(v_driver);
end;
$$;
revoke all on function public.admin_set_driver_suspension(uuid,boolean,text) from public,anon;
grant execute on function public.admin_set_driver_suspension(uuid,boolean,text) to authenticated;

-- -----------------------------------------------------------------------------
-- Passenger moderation. "soft_delete" is operational deletion only; it does
-- not pretend to remove auth.users. Auth deletion remains a separate privileged
-- lifecycle operation.
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_passenger_status(
  _passenger_id uuid,
  _action text,
  _reason text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user public.users%rowtype;
  v_action text:=lower(btrim(coalesce(_action,'')));
  v_reason text:=nullif(left(btrim(coalesce(_reason,'')),500),'');
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('passengers.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_action not in ('suspend','unsuspend','block','unblock','soft_delete') then
    raise exception 'invalid_passenger_action' using errcode='22023';
  end if;
  if v_action in ('suspend','block','soft_delete') and v_reason is null then
    raise exception 'reason_required' using errcode='22023';
  end if;

  update public.users set
    suspended_at=case
      when v_action='suspend' then now()
      when v_action='unsuspend' then null
      else suspended_at
    end,
    blocked_at=case
      when v_action in ('block','soft_delete') then now()
      when v_action='unblock' then null
      else blocked_at
    end,
    block_reason=case
      when v_action in ('suspend','block','soft_delete') then v_reason
      when v_action in ('unsuspend','unblock') then null
      else block_reason
    end,
    deleted_at=case when v_action='soft_delete' then now() else deleted_at end,
    updated_at=now()
  where id=_passenger_id
    and exists(select 1 from public.user_roles ur where ur.user_id=public.users.id and ur.role='passenger')
  returning * into v_user;
  if not found then raise exception 'passenger_not_found' using errcode='P0002'; end if;

  perform private.admin_audit(
    'admin.passenger.'||v_action,'passenger',v_user.id::text,
    jsonb_build_object('reason',v_reason)
  );
  return jsonb_build_object(
    'id',v_user.id,
    'blocked_at',v_user.blocked_at,
    'suspended_at',v_user.suspended_at,
    'deleted_at',v_user.deleted_at,
    'block_reason',v_user.block_reason
  );
end;
$$;
revoke all on function public.admin_set_passenger_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_passenger_status(uuid,text,text) to authenticated;

-- -----------------------------------------------------------------------------
-- Staff RBAC. Admin staff lives in profiles/app_role, never in mobility
-- user_roles. Self-demotion/deactivation is blocked to avoid lockout.
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_staff_profile(
  _auth_user_id uuid,
  _role public.app_role,
  _active boolean,
  _display_name text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('roles.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if _auth_user_id is null then raise exception 'invalid_staff_user' using errcode='22023'; end if;
  if _auth_user_id=auth.uid() and (_role<>'administrator'::public.app_role or not _active) then
    raise exception 'cannot_demote_or_disable_self' using errcode='42501';
  end if;

  update public.profiles set
    role=_role,
    active=_active,
    display_name=coalesce(nullif(left(btrim(coalesce(_display_name,'')),160),''),display_name),
    updated_at=now()
  where user_id=_auth_user_id
  returning * into v_profile;
  if not found then raise exception 'staff_profile_not_found' using errcode='P0002'; end if;

  perform private.admin_audit(
    'admin.staff.updated','staff_profile',_auth_user_id::text,
    jsonb_build_object('role',_role,'active',_active)
  );
  return jsonb_build_object(
    'user_id',v_profile.user_id,'email',v_profile.email,'display_name',v_profile.display_name,
    'role',v_profile.role,'active',v_profile.active,'updated_at',v_profile.updated_at
  );
end;
$$;
revoke all on function public.admin_set_staff_profile(uuid,public.app_role,boolean,text) from public,anon;
grant execute on function public.admin_set_staff_profile(uuid,public.app_role,boolean,text) to authenticated;

-- -----------------------------------------------------------------------------
-- Canonical ride categories. Codes are fixed by the Ride domain and therefore
-- are not created/deleted from the Admin. Only presentation/availability fields
-- may be changed.
-- -----------------------------------------------------------------------------
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
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_category public.ride_categories%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('pricing.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if _category_id is null or nullif(btrim(coalesce(_name,'')),'') is null
     or _sort_order is null or _sort_order<0 or _sort_order>9999 then
    raise exception 'invalid_category_update' using errcode='22023';
  end if;

  update public.ride_categories set
    name=left(btrim(_name),100),
    description=nullif(left(btrim(coalesce(_description,'')),500),''),
    icon=nullif(left(btrim(coalesce(_icon,'')),100),''),
    image_url=nullif(left(btrim(coalesce(_image_url,'')),1000),''),
    capacity_label=nullif(left(btrim(coalesce(_capacity_label,'')),160),''),
    eta_label=nullif(left(btrim(coalesce(_eta_label,'')),160),''),
    sort_order=_sort_order,
    is_active=_is_active,
    updated_at=now()
  where id=_category_id
    and code in ('carros','motos','fretes','guincho','envios')
  returning * into v_category;
  if not found then raise exception 'category_not_found' using errcode='P0002'; end if;

  perform private.admin_audit(
    'admin.ride_category.updated','ride_category',v_category.id::text,
    jsonb_build_object('code',v_category.code,'is_active',v_category.is_active,'sort_order',v_category.sort_order)
  );
  return to_jsonb(v_category);
end;
$$;
revoke all on function public.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) from public,anon;
grant execute on function public.admin_update_ride_category(uuid,text,text,text,text,text,text,integer,boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Canonical tariff row. A tariff is one typed row per category/city; arbitrary
-- key/value pricing fields are deliberately rejected.
-- -----------------------------------------------------------------------------
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
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_category public.ride_categories%rowtype;
  v_rule public.tariff_rules%rowtype;
  v_city text:=left(coalesce(nullif(btrim(_city),''),'default'),120);
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('pricing.manage') then raise exception 'forbidden' using errcode='42501'; end if;

  select * into v_category from public.ride_categories
  where code=lower(btrim(coalesce(_category_code,''))) limit 1;
  if not found then raise exception 'category_not_found' using errcode='P0002'; end if;

  if coalesce(_base_fare,-1)<0 or coalesce(_min_fare,-1)<0 or coalesce(_per_km,-1)<0
     or coalesce(_per_min,-1)<0 or coalesce(_stop_fee,-1)<0 or coalesce(_fixed_fee,-1)<0
     or coalesce(_dynamic_multiplier,0)<=0 or coalesce(_helper1_fee,-1)<0
     or coalesce(_helper2_fee,-1)<0 or coalesce(_heavy_furniture_fee,-1)<0
     or coalesce(_assembly_fee,-1)<0 or coalesce(_packing_fee,-1)<0
     or coalesce(_difficult_access_fee,-1)<0 or coalesce(_stair_fee,-1)<0
     or coalesce(_heavy_vehicle_fee,-1)<0 or coalesce(_accident_fee,-1)<0
     or coalesce(_platform_fee,-1)<0 or coalesce(_locked_wheels_fee,-1)<0
     or coalesce(_garage_fee,-1)<0 or coalesce(_max_weight_kg,-1)<0 or coalesce(_per_kg,-1)<0 then
    raise exception 'invalid_tariff_values' using errcode='22023';
  end if;

  insert into public.tariff_rules(
    category_id,city,base_fare,min_fare,per_km,per_min,stop_fee,fixed_fee,dynamic_multiplier,is_active,
    helper1_fee,helper2_fee,heavy_furniture_fee,assembly_fee,packing_fee,difficult_access_fee,stair_fee,
    heavy_vehicle_fee,accident_fee,platform_fee,locked_wheels_fee,garage_fee,max_weight_kg,per_kg,updated_at
  ) values(
    v_category.id,v_city,_base_fare,_min_fare,_per_km,_per_min,_stop_fee,_fixed_fee,_dynamic_multiplier,_is_active,
    _helper1_fee,_helper2_fee,_heavy_furniture_fee,_assembly_fee,_packing_fee,_difficult_access_fee,_stair_fee,
    _heavy_vehicle_fee,_accident_fee,_platform_fee,_locked_wheels_fee,_garage_fee,_max_weight_kg,_per_kg,now()
  )
  on conflict(category_id,city) do update set
    base_fare=excluded.base_fare,min_fare=excluded.min_fare,per_km=excluded.per_km,per_min=excluded.per_min,
    stop_fee=excluded.stop_fee,fixed_fee=excluded.fixed_fee,dynamic_multiplier=excluded.dynamic_multiplier,is_active=excluded.is_active,
    helper1_fee=excluded.helper1_fee,helper2_fee=excluded.helper2_fee,heavy_furniture_fee=excluded.heavy_furniture_fee,
    assembly_fee=excluded.assembly_fee,packing_fee=excluded.packing_fee,difficult_access_fee=excluded.difficult_access_fee,
    stair_fee=excluded.stair_fee,heavy_vehicle_fee=excluded.heavy_vehicle_fee,accident_fee=excluded.accident_fee,
    platform_fee=excluded.platform_fee,locked_wheels_fee=excluded.locked_wheels_fee,garage_fee=excluded.garage_fee,
    max_weight_kg=excluded.max_weight_kg,per_kg=excluded.per_kg,updated_at=now()
  returning * into v_rule;

  perform private.admin_audit(
    'admin.tariff.updated','tariff_rule',v_rule.id::text,
    jsonb_build_object('category',v_category.code,'city',v_rule.city,'is_active',v_rule.is_active)
  );
  return to_jsonb(v_rule);
end;
$$;
revoke all on function public.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) from public,anon;
grant execute on function public.admin_upsert_tariff_rule(text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Operations: SOS and support status updates. Staff sees only the operational
-- fields already protected by RLS; no passenger/driver private documents are
-- exposed by these RPCs.
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_sos_alert(
  _alert_id uuid,
  _status text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_alert public.sos_alerts%rowtype; v_status text:=lower(btrim(coalesce(_status,'')));
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('operations.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_status not in ('open','acknowledged','resolved','cancelled') then raise exception 'invalid_sos_status' using errcode='22023'; end if;
  update public.sos_alerts set status=v_status,updated_at=now() where id=_alert_id returning * into v_alert;
  if not found then raise exception 'sos_alert_not_found' using errcode='P0002'; end if;
  perform private.admin_audit('admin.sos.status_changed','sos_alert',v_alert.id::text,jsonb_build_object('status',v_status));
  return to_jsonb(v_alert);
end;
$$;
revoke all on function public.admin_update_sos_alert(uuid,text) from public,anon;
grant execute on function public.admin_update_sos_alert(uuid,text) to authenticated;

create or replace function public.admin_update_support_ticket(
  _ticket_id uuid,
  _status text,
  _priority text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ticket public.passenger_support_tickets%rowtype;
  v_status text:=lower(btrim(coalesce(_status,'')));
  v_priority text:=lower(btrim(coalesce(_priority,'')));
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('support.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_status not in ('open','in_progress','resolved','closed') then raise exception 'invalid_ticket_status' using errcode='22023'; end if;
  if v_priority not in ('low','normal','high','urgent') then raise exception 'invalid_ticket_priority' using errcode='22023'; end if;
  update public.passenger_support_tickets
  set status=v_status,priority=v_priority,updated_at=now()
  where id=_ticket_id returning * into v_ticket;
  if not found then raise exception 'support_ticket_not_found' using errcode='P0002'; end if;
  perform private.admin_audit(
    'admin.support.updated','support_ticket',v_ticket.id::text,
    jsonb_build_object('status',v_status,'priority',v_priority,'protocol',v_ticket.protocol)
  );
  return to_jsonb(v_ticket);
end;
$$;
revoke all on function public.admin_update_support_ticket(uuid,text,text) from public,anon;
grant execute on function public.admin_update_support_ticket(uuid,text,text) to authenticated;

-- -----------------------------------------------------------------------------
-- Canonical Admin dashboard metrics.
-- Financial values are explicit and settlement-backed; no ride-price sum is
-- named Platform Revenue. All monetary amounts are returned as integer cents.
-- -----------------------------------------------------------------------------
create or replace function public.admin_get_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_start_day timestamptz:=date_trunc('day',now());
  v_start_month timestamptz:=date_trunc('month',now());
  v_drivers_total integer:=0;
  v_drivers_online integer:=0;
  v_drivers_pending integer:=0;
  v_passengers_total integer:=0;
  v_rides_active integer:=0;
  v_rides_completed_today integer:=0;
  v_rides_cancelled_today integer:=0;
  v_open_sos integer:=0;
  v_open_support integer:=0;
  v_gmv_today bigint:=0;
  v_driver_today bigint:=0;
  v_platform_today bigint:=0;
  v_provider_today bigint:=0;
  v_gmv_month bigint:=0;
  v_driver_month bigint:=0;
  v_platform_month bigint:=0;
  v_provider_month bigint:=0;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('metrics.read') then raise exception 'forbidden' using errcode='42501'; end if;

  select count(*)::integer,
         count(*) filter(where is_online)::integer,
         count(*) filter(where approval_status in ('pendente','em_analise'))::integer
    into v_drivers_total,v_drivers_online,v_drivers_pending
  from public.drivers;

  select count(distinct u.id)::integer into v_passengers_total
  from public.users u
  join public.user_roles ur on ur.user_id=u.id and ur.role='passenger'
  where u.deleted_at is null;

  select
    count(*) filter(where status in ('procurar_motorista','motorista_a_caminho','motorista_chegou','em_viagem'))::integer,
    count(*) filter(where status='finalizada' and completed_at>=v_start_day)::integer,
    count(*) filter(where status in ('cancelada_passageiro','cancelada_motorista') and cancelled_at>=v_start_day)::integer
  into v_rides_active,v_rides_completed_today,v_rides_cancelled_today
  from public.rides;

  select count(*)::integer into v_open_sos from public.sos_alerts where status in ('open','acknowledged');
  select count(*)::integer into v_open_support from public.passenger_support_tickets where status in ('open','in_progress');

  select
    coalesce(sum(passenger_charge_cents) filter(where status='settled' and coalesce(settled_at,created_at)>=v_start_day),0)::bigint,
    coalesce(sum(driver_earning_cents) filter(where status='settled' and coalesce(settled_at,created_at)>=v_start_day),0)::bigint,
    coalesce(sum(platform_fee_cents) filter(where status='settled' and coalesce(settled_at,created_at)>=v_start_day),0)::bigint,
    coalesce(sum(payment_provider_fee_cents) filter(where status='settled' and coalesce(settled_at,created_at)>=v_start_day),0)::bigint,
    coalesce(sum(passenger_charge_cents) filter(where status='settled' and coalesce(settled_at,created_at)>=v_start_month),0)::bigint,
    coalesce(sum(driver_earning_cents) filter(where status='settled' and coalesce(settled_at,created_at)>=v_start_month),0)::bigint,
    coalesce(sum(platform_fee_cents) filter(where status='settled' and coalesce(settled_at,created_at)>=v_start_month),0)::bigint,
    coalesce(sum(payment_provider_fee_cents) filter(where status='settled' and coalesce(settled_at,created_at)>=v_start_month),0)::bigint
  into v_gmv_today,v_driver_today,v_platform_today,v_provider_today,
       v_gmv_month,v_driver_month,v_platform_month,v_provider_month
  from public.ride_settlements;

  return jsonb_build_object(
    'drivers',jsonb_build_object('total',v_drivers_total,'online',v_drivers_online,'pending_review',v_drivers_pending),
    'passengers',jsonb_build_object('total',v_passengers_total),
    'rides',jsonb_build_object('active',v_rides_active,'completed_today',v_rides_completed_today,'cancelled_today',v_rides_cancelled_today),
    'operations',jsonb_build_object('open_sos',v_open_sos,'open_support',v_open_support),
    'finance',jsonb_build_object(
      'today',jsonb_build_object(
        'gmv_cents',v_gmv_today,'driver_earnings_cents',v_driver_today,
        'platform_revenue_cents',v_platform_today,'provider_fees_cents',v_provider_today
      ),
      'month',jsonb_build_object(
        'gmv_cents',v_gmv_month,'driver_earnings_cents',v_driver_month,
        'platform_revenue_cents',v_platform_month,'provider_fees_cents',v_provider_month
      )
    )
  );
end;
$$;
revoke all on function public.admin_get_dashboard_metrics() from public,anon;
grant execute on function public.admin_get_dashboard_metrics() to authenticated;
