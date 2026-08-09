-- APOIS Corridas — dashboard financeiro do motorista baseado no ledger.
--
-- Regra: a tela Ganhos nunca soma rides.final_price para afirmar recebimento.
-- Só créditos reais `source = ride` do ledger entram como ganho liquidado.
-- Payout permanece fail-closed até um provedor de transferência real ser
-- configurado e homologado.

begin;

create or replace function public.get_driver_financial_dashboard(
  _from timestamptz,
  _to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_from timestamptz;
  v_to timestamptz;
  v_wallet public.driver_wallets%rowtype;
  v_period_earnings bigint := 0;
  v_period_rides integer := 0;
  v_today bigint := 0;
  v_last_7 bigint := 0;
  v_month bigint := 0;
  v_settlements jsonb := '[]'::jsonb;
  v_withdrawals jsonb := '[]'::jsonb;
  v_payout_enabled boolean := false;
  v_setting jsonb;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select d.id
    into v_driver_id
  from public.drivers d
  where d.user_id = public.mobility_user_id()
  limit 1;

  if v_driver_id is null then
    raise exception 'driver_profile_missing' using errcode = '42501';
  end if;

  v_from := coalesce(_from, date_trunc('day', now()) - interval '6 days');
  v_to := coalesce(_to, now());

  if v_from > v_to then
    raise exception 'invalid_financial_period' using errcode = '22023';
  end if;
  if v_to - v_from > interval '366 days' then
    raise exception 'financial_period_too_large' using errcode = '22023';
  end if;

  select *
    into v_wallet
  from public.driver_wallets w
  where w.driver_id = v_driver_id
  limit 1;

  if not found then
    v_wallet.driver_id := v_driver_id;
    v_wallet.balance := 0;
    v_wallet.available_balance := 0;
    v_wallet.updated_at := now();
  end if;

  select
    coalesce(round(sum(t.amount) * 100)::bigint, 0),
    count(*)::integer
  into v_period_earnings, v_period_rides
  from public.driver_wallet_transactions t
  where t.driver_id = v_driver_id
    and t.direction = 'credit'
    and t.source = 'ride'
    and t.created_at >= v_from
    and t.created_at <= v_to;

  select coalesce(round(sum(t.amount) * 100)::bigint, 0)
    into v_today
  from public.driver_wallet_transactions t
  where t.driver_id = v_driver_id
    and t.direction = 'credit'
    and t.source = 'ride'
    and t.created_at >= date_trunc('day', now())
    and t.created_at < date_trunc('day', now()) + interval '1 day';

  select coalesce(round(sum(t.amount) * 100)::bigint, 0)
    into v_last_7
  from public.driver_wallet_transactions t
  where t.driver_id = v_driver_id
    and t.direction = 'credit'
    and t.source = 'ride'
    and t.created_at >= date_trunc('day', now()) - interval '6 days'
    and t.created_at < date_trunc('day', now()) + interval '1 day';

  select coalesce(round(sum(t.amount) * 100)::bigint, 0)
    into v_month
  from public.driver_wallet_transactions t
  where t.driver_id = v_driver_id
    and t.direction = 'credit'
    and t.source = 'ride'
    and t.created_at >= date_trunc('month', now())
    and t.created_at < date_trunc('month', now()) + interval '1 month';

  select coalesce(jsonb_agg(item order by item->>'created_at' desc), '[]'::jsonb)
    into v_settlements
  from (
    select jsonb_build_object(
      'settlement_id', rs.ride_id,
      'ride_id', rs.ride_id,
      'origin_name', r.origin_name,
      'destination_name', r.destination_name,
      'category', r.category,
      'distance_km', r.distance_km,
      'duration_min', r.duration_min,
      'payment_method', rs.payment_method,
      'payment_status', rs.payment_status,
      'settlement_status', rs.status,
      'driver_earning_cents', round(t.amount * 100)::bigint,
      'platform_fee_cents', coalesce(round(rs.platform_fee * 100)::bigint, 0),
      'created_at', t.created_at,
      'settled_at', rs.settled_at
    ) as item
    from public.driver_wallet_transactions t
    join public.ride_settlements rs
      on rs.ride_id = t.source_id
     and rs.driver_id = t.driver_id
    join public.rides r on r.id = rs.ride_id
    where t.driver_id = v_driver_id
      and t.direction = 'credit'
      and t.source = 'ride'
      and t.created_at >= v_from
      and t.created_at <= v_to
    order by t.created_at desc
    limit 100
  ) q;

  select coalesce(jsonb_agg(item order by item->>'requested_at' desc), '[]'::jsonb)
    into v_withdrawals
  from (
    select jsonb_build_object(
      'id', w.id,
      'amount_cents', round(w.amount * 100)::bigint,
      'status', w.status,
      'provider', w.provider,
      'failure_reason', w.failure_reason,
      'requested_at', w.requested_at,
      'processed_at', w.processed_at
    ) as item
    from public.driver_withdrawals w
    where w.driver_id = v_driver_id
    order by w.requested_at desc
    limit 50
  ) q;

  -- A configuração é deny-by-default. Mesmo que exista um flag legado, ele
  -- só informa intenção operacional; o RPC de saque abaixo continua fechado
  -- até existir integração de payout homologada.
  select a.value
    into v_setting
  from public.app_settings a
  where a.key = 'finance.driver_payouts_enabled'
  limit 1;

  if v_setting is not null then
    begin
      v_payout_enabled := case
        when jsonb_typeof(v_setting) = 'boolean' then (v_setting::text)::boolean
        when jsonb_typeof(v_setting) = 'string' then lower(v_setting #>> '{}') = 'true'
        else false
      end;
    exception when others then
      v_payout_enabled := false;
    end;
  end if;

  -- Ainda não há provider de payout homologado no backend canônico.
  v_payout_enabled := false;

  return jsonb_build_object(
    'ok', true,
    'driver_id', v_driver_id,
    'period', jsonb_build_object(
      'from', v_from,
      'to', v_to,
      'settled_earnings_cents', v_period_earnings,
      'settled_rides', v_period_rides
    ),
    'kpis', jsonb_build_object(
      'today_cents', v_today,
      'last_7_days_cents', v_last_7,
      'month_cents', v_month
    ),
    'wallet', jsonb_build_object(
      'balance_cents', round(coalesce(v_wallet.balance, 0) * 100)::bigint,
      'available_balance_cents', round(coalesce(v_wallet.available_balance, 0) * 100)::bigint,
      'pending_balance_cents', round(greatest(coalesce(v_wallet.balance, 0) - coalesce(v_wallet.available_balance, 0), 0) * 100)::bigint,
      'debt_balance_cents', 0,
      'updated_at', coalesce(v_wallet.updated_at, now())
    ),
    'payout', jsonb_build_object(
      'enabled', v_payout_enabled,
      'provider', null,
      'reason', 'provider_not_configured'
    ),
    'settlements', v_settlements,
    'withdrawals', v_withdrawals
  );
end;
$$;

revoke all on function public.get_driver_financial_dashboard(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.get_driver_financial_dashboard(timestamptz, timestamptz)
  to authenticated;

create or replace function public.driver_request_withdrawal(
  _amount_cents bigint,
  _idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if _amount_cents is null or _amount_cents <= 0 then
    raise exception 'invalid_withdrawal_amount' using errcode = '22023';
  end if;
  if _idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;

  -- Fail-closed: não reservamos saldo nem criamos um saque que não possa ser
  -- realmente enviado. Este contrato será substituído pela implementação
  -- atômica quando o provedor de payout for escolhido/configurado/homologado.
  raise exception 'payout_provider_not_configured' using errcode = '55000';
end;
$$;

revoke all on function public.driver_request_withdrawal(bigint, uuid) from public, anon;
grant execute on function public.driver_request_withdrawal(bigint, uuid) to authenticated;

commit;
