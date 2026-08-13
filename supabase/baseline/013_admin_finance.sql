-- APOIS CORRIDAS — CANONICAL BASELINE 013
-- Phase 8 finance: explicit settlement/ledger-backed Admin reporting.
-- Fresh-database baseline only. Do not execute ad-hoc on production.

create or replace function public.admin_get_finance_summary(
  _from timestamptz default null,
  _to timestamptz default null
) returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_from timestamptz:=coalesce(_from,date_trunc('month',now()));
  v_to timestamptz:=coalesce(_to,now());
  v_gmv bigint:=0;
  v_driver_earnings bigint:=0;
  v_platform_revenue bigint:=0;
  v_provider_fees bigint:=0;
  v_refunds bigint:=0;
  v_settled integer:=0;
  v_pending integer:=0;
  v_failed integer:=0;
  v_withdrawal_pending bigint:=0;
  v_withdrawal_paid bigint:=0;
  v_electronic_provider text;
  v_payout_provider text;
  v_settlements jsonb:='[]'::jsonb;
  v_withdrawals jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('finance.read') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_to<v_from or v_to-v_from>interval '366 days' then
    raise exception 'invalid_financial_period' using errcode='22023';
  end if;

  select
    coalesce(sum(passenger_charge_cents) filter(where status='settled'),0)::bigint,
    coalesce(sum(driver_earning_cents) filter(where status='settled'),0)::bigint,
    coalesce(sum(platform_fee_cents) filter(where status='settled'),0)::bigint,
    coalesce(sum(payment_provider_fee_cents) filter(where status='settled'),0)::bigint,
    coalesce(sum(refunded_amount_cents),0)::bigint,
    count(*) filter(where status='settled')::integer,
    count(*) filter(where status='pending_payment')::integer,
    count(*) filter(where status='failed')::integer
  into v_gmv,v_driver_earnings,v_platform_revenue,v_provider_fees,v_refunds,v_settled,v_pending,v_failed
  from public.ride_settlements
  where created_at between v_from and v_to;

  select
    coalesce(sum(coalesce(amount_cents,round(amount*100)::bigint)) filter(where status in ('pending','processing')),0)::bigint,
    coalesce(sum(coalesce(amount_cents,round(amount*100)::bigint)) filter(where status='paid'),0)::bigint
  into v_withdrawal_pending,v_withdrawal_paid
  from public.driver_withdrawals
  where requested_at between v_from and v_to;

  select nullif(lower(btrim(value #>> '{}')),'') into v_electronic_provider
  from public.app_settings where key='finance.electronic_payment_provider' limit 1;
  select nullif(lower(btrim(value #>> '{}')),'') into v_payout_provider
  from public.app_settings where key='finance.payout_provider' limit 1;

  select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb)
  into v_settlements
  from (
    select
      rs.created_at,
      jsonb_build_object(
        'id',rs.id,
        'ride_id',rs.ride_id,
        'driver_id',rs.driver_id,
        'passenger_id',rs.passenger_id,
        'payment_method',rs.payment_method,
        'payment_status',rs.payment_status,
        'status',rs.status,
        'passenger_charge_cents',rs.passenger_charge_cents,
        'driver_earning_cents',rs.driver_earning_cents,
        'platform_fee_cents',rs.platform_fee_cents,
        'payment_provider_fee_cents',rs.payment_provider_fee_cents,
        'refunded_amount_cents',rs.refunded_amount_cents,
        'created_at',rs.created_at,
        'settled_at',rs.settled_at
      ) item
    from public.ride_settlements rs
    where rs.created_at between v_from and v_to
    order by rs.created_at desc
    limit 100
  ) q;

  select coalesce(jsonb_agg(item order by requested_at desc),'[]'::jsonb)
  into v_withdrawals
  from (
    select
      dw.requested_at,
      jsonb_build_object(
        'id',dw.id,
        'driver_id',dw.driver_id,
        'amount_cents',coalesce(dw.amount_cents,round(dw.amount*100)::bigint),
        'status',dw.status,
        'provider',dw.provider,
        'provider_transfer_id',dw.provider_transfer_id,
        'failure_reason',dw.failure_reason,
        'requested_at',dw.requested_at,
        'processed_at',dw.processed_at
      ) item
    from public.driver_withdrawals dw
    where dw.requested_at between v_from and v_to
    order by dw.requested_at desc
    limit 100
  ) w;

  return jsonb_build_object(
    'from',v_from,
    'to',v_to,
    'settlements',jsonb_build_object(
      'gmv_cents',v_gmv,
      'driver_earnings_cents',v_driver_earnings,
      'platform_revenue_cents',v_platform_revenue,
      'provider_fees_cents',v_provider_fees,
      'refunds_cents',v_refunds,
      'settled_count',v_settled,
      'pending_count',v_pending,
      'failed_count',v_failed
    ),
    'withdrawals',jsonb_build_object(
      'pending_cents',v_withdrawal_pending,
      'paid_cents',v_withdrawal_paid
    ),
    'providers',jsonb_build_object(
      'electronic_payment_provider',case when v_electronic_provider='null' then null else v_electronic_provider end,
      'payout_provider',case when v_payout_provider='null' then null else v_payout_provider end
    ),
    'recent_settlements',v_settlements,
    'recent_withdrawals',v_withdrawals
  );
end;
$$;

revoke all on function public.admin_get_finance_summary(timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_get_finance_summary(timestamptz,timestamptz) to authenticated;
