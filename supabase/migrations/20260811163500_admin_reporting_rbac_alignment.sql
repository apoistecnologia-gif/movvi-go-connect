-- Alinha o RBAC exibido pelo Admin com as políticas RLS e com as RPCs de relatório.
-- Mantém menor privilégio: suporte recebe somente leitura operacional + gestão de SOS/suporte.

insert into public.role_permissions(role, permission)
values
  ('support'::public.app_role, 'metrics.read'),
  ('support'::public.app_role, 'drivers.read'),
  ('support'::public.app_role, 'passengers.read'),
  ('support'::public.app_role, 'rides.read')
on conflict do nothing;

-- As páginas operacionais leem diretamente estas entidades; as policies devem
-- reconhecer as mesmas permissões usadas pela navegação do Admin.
drop policy if exists drivers_admin_read on public.drivers;
create policy drivers_admin_read
on public.drivers
for select
to authenticated
using (
  private.has_permission('users.manage')
  or private.has_permission('drivers.read')
);

drop policy if exists rides_admin_read on public.rides;
create policy rides_admin_read
on public.rides
for select
to authenticated
using (
  private.has_permission('users.manage')
  or private.has_permission('rides.read')
);

drop policy if exists users_admin_read on public.users;
create policy users_admin_read
on public.users
for select
to authenticated
using (
  private.has_permission('users.manage')
  or private.has_permission('passengers.read')
  or private.has_permission('drivers.read')
);

drop policy if exists ride_settlements_admin_read on public.ride_settlements;
create policy ride_settlements_admin_read
on public.ride_settlements
for select
to authenticated
using (
  private.has_permission('users.manage')
  or private.has_permission('finance.read')
);

drop policy if exists driver_withdrawals_admin_read on public.driver_withdrawals;
create policy driver_withdrawals_admin_read
on public.driver_withdrawals
for select
to authenticated
using (private.has_permission('finance.read'));

create or replace function public.admin_get_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'America/Recife') at time zone 'America/Recife');
  v_month_start timestamptz := (date_trunc('month', now() at time zone 'America/Recife') at time zone 'America/Recife');
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not private.has_permission('metrics.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'drivers', jsonb_build_object(
      'total', (select count(*) from public.drivers),
      'online', (select count(*) from public.drivers where is_online is true),
      'pending_review', (
        select count(*) from public.drivers
        where coalesce(approval_status, '') in ('em_analise','pendente','pending','pending_review')
           or coalesce(documents_status, '') in ('pending','pending_review','em_analise')
      )
    ),
    'passengers', jsonb_build_object(
      'total', (
        select count(distinct ur.user_id)
        from public.user_roles ur
        join public.users u on u.id = ur.user_id
        where ur.role::text = 'passenger'
          and u.deleted_at is null
      )
    ),
    'rides', jsonb_build_object(
      'active', (
        select count(*) from public.rides
        where status in ('procurar_motorista','motorista_a_caminho','motorista_chegou','em_viagem')
      ),
      'completed_today', (
        select count(*) from public.rides
        where status = 'finalizada'
          and completed_at >= v_day_start
          and completed_at < v_day_start + interval '1 day'
      ),
      'cancelled_today', (
        select count(*) from public.rides
        where status in ('cancelada_passageiro','cancelada_motorista')
          and cancelled_at >= v_day_start
          and cancelled_at < v_day_start + interval '1 day'
      )
    ),
    'operations', jsonb_build_object(
      'open_sos', (
        select count(*) from public.sos_alerts
        where status in ('open','acknowledged')
      ),
      'open_support', (
        select count(*) from public.passenger_support_tickets
        where lower(coalesce(status,'')) not in ('resolved','closed','cancelled','cancelado','resolvido','fechado')
      )
    ),
    'finance', jsonb_build_object(
      'today', jsonb_build_object(
        'gmv_cents', (
          select coalesce(round(sum(coalesce(passenger_charge, gross_amount)) * 100), 0)::bigint
          from public.ride_settlements
          where status = 'settled' and settled_at >= v_day_start and settled_at < v_day_start + interval '1 day'
        ),
        'driver_earnings_cents', (
          select coalesce(round(sum(coalesce(driver_earning, 0)) * 100), 0)::bigint
          from public.ride_settlements
          where status = 'settled' and settled_at >= v_day_start and settled_at < v_day_start + interval '1 day'
        ),
        'platform_revenue_cents', (
          select coalesce(round(sum(coalesce(platform_fee, 0)) * 100), 0)::bigint
          from public.ride_settlements
          where status = 'settled' and settled_at >= v_day_start and settled_at < v_day_start + interval '1 day'
        ),
        'provider_fees_cents', (
          select coalesce(round(sum(coalesce(payment_provider_fee, 0)) * 100), 0)::bigint
          from public.ride_settlements
          where status = 'settled' and settled_at >= v_day_start and settled_at < v_day_start + interval '1 day'
        )
      ),
      'month', jsonb_build_object(
        'gmv_cents', (
          select coalesce(round(sum(coalesce(passenger_charge, gross_amount)) * 100), 0)::bigint
          from public.ride_settlements
          where status = 'settled' and settled_at >= v_month_start and settled_at < v_month_start + interval '1 month'
        ),
        'driver_earnings_cents', (
          select coalesce(round(sum(coalesce(driver_earning, 0)) * 100), 0)::bigint
          from public.ride_settlements
          where status = 'settled' and settled_at >= v_month_start and settled_at < v_month_start + interval '1 month'
        ),
        'platform_revenue_cents', (
          select coalesce(round(sum(coalesce(platform_fee, 0)) * 100), 0)::bigint
          from public.ride_settlements
          where status = 'settled' and settled_at >= v_month_start and settled_at < v_month_start + interval '1 month'
        ),
        'provider_fees_cents', (
          select coalesce(round(sum(coalesce(payment_provider_fee, 0)) * 100), 0)::bigint
          from public.ride_settlements
          where status = 'settled' and settled_at >= v_month_start and settled_at < v_month_start + interval '1 month'
        )
      )
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_get_dashboard_metrics() from public, anon;
grant execute on function public.admin_get_dashboard_metrics() to authenticated;

create or replace function public.admin_get_finance_summary(
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
  v_from timestamptz := coalesce(_from, date_trunc('month', now()));
  v_to timestamptz := coalesce(_to, now());
  v_result jsonb;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('finance.read') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_from > v_to then raise exception 'invalid_range' using errcode='22023'; end if;

  with filtered_settlements as (
    select *
    from public.ride_settlements
    where created_at between v_from and v_to
  ),
  filtered_withdrawals as (
    select *
    from public.driver_withdrawals
    where requested_at between v_from and v_to
  ),
  settlement_totals as (
    select
      coalesce(sum(passenger_charge) filter (where status='settled'),0) as gmv,
      coalesce(sum(driver_earning) filter (where status='settled'),0) as driver_earnings,
      coalesce(sum(platform_fee) filter (where status='settled'),0) as platform_revenue,
      coalesce(sum(payment_provider_fee) filter (where status='settled'),0) as provider_fees,
      coalesce(sum(refunded_amount),0) as refunds,
      count(*) filter (where status='settled') as settled_count,
      count(*) filter (where status in ('pending','awaiting_payment','processing')) as pending_count,
      count(*) filter (where status in ('failed','payment_failed')) as failed_count
    from filtered_settlements
  ),
  withdrawal_totals as (
    select
      coalesce(sum(amount) filter (where status in ('pending','requested','processing')),0) as pending_amount,
      coalesce(sum(amount) filter (where status in ('paid','completed')),0) as paid_amount
    from filtered_withdrawals
  ),
  recent_settlements as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', ride_id,
      'ride_id', ride_id,
      'driver_id', driver_id,
      'passenger_id', passenger_id,
      'payment_method', payment_method,
      'payment_status', payment_status,
      'status', status,
      'passenger_charge_cents', round(coalesce(passenger_charge,0)*100)::bigint,
      'driver_earning_cents', round(coalesce(driver_earning,0)*100)::bigint,
      'platform_fee_cents', round(coalesce(platform_fee,0)*100)::bigint,
      'payment_provider_fee_cents', round(coalesce(payment_provider_fee,0)*100)::bigint,
      'refunded_amount_cents', round(coalesce(refunded_amount,0)*100)::bigint,
      'created_at', created_at,
      'settled_at', settled_at
    ) order by created_at desc), '[]'::jsonb) as rows
    from (
      select * from filtered_settlements order by created_at desc limit 50
    ) s
  ),
  recent_withdrawals as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'driver_id', driver_id,
      'amount_cents', round(coalesce(amount,0)*100)::bigint,
      'status', status,
      'provider', provider,
      'provider_transfer_id', provider_transfer_id,
      'failure_reason', failure_reason,
      'requested_at', requested_at,
      'processed_at', processed_at
    ) order by requested_at desc), '[]'::jsonb) as rows
    from (
      select * from filtered_withdrawals order by requested_at desc limit 50
    ) w
  )
  select jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'settlements', jsonb_build_object(
      'gmv_cents', round(st.gmv*100)::bigint,
      'driver_earnings_cents', round(st.driver_earnings*100)::bigint,
      'platform_revenue_cents', round(st.platform_revenue*100)::bigint,
      'provider_fees_cents', round(st.provider_fees*100)::bigint,
      'refunds_cents', round(st.refunds*100)::bigint,
      'settled_count', st.settled_count,
      'pending_count', st.pending_count,
      'failed_count', st.failed_count
    ),
    'withdrawals', jsonb_build_object(
      'pending_cents', round(wt.pending_amount*100)::bigint,
      'paid_cents', round(wt.paid_amount*100)::bigint
    ),
    'providers', jsonb_build_object(
      'electronic_payment_provider', null,
      'payout_provider', null
    ),
    'recent_settlements', rs.rows,
    'recent_withdrawals', rw.rows
  ) into v_result
  from settlement_totals st
  cross join withdrawal_totals wt
  cross join recent_settlements rs
  cross join recent_withdrawals rw;

  return v_result;
end;
$$;

revoke all on function public.admin_get_finance_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_get_finance_summary(timestamptz, timestamptz) to authenticated;
