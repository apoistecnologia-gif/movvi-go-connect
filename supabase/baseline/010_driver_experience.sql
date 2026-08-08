-- APOIS CORRIDAS — CANONICAL BASELINE 010
-- Phase 7: Driver KYC/reapproval and financial UI contracts.
-- Fresh-database baseline only. Do not execute ad-hoc on production.

-- -----------------------------------------------------------------------------
-- KYC/document replacement
-- Storage object paths are owned by auth.uid(); drivers.user_id is public.users.id.
-- Replacing any required document ALWAYS reopens review. An approved driver must
-- not remain eligible using a newly-uploaded, not-yet-reviewed document.
-- -----------------------------------------------------------------------------
create or replace function public.driver_update_document(
  _slot text,
  _storage_path text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
  v_driver public.drivers%rowtype;
  v_slot text:=lower(btrim(coalesce(_slot,'')));
  v_path text:=btrim(coalesce(_storage_path,''));
  v_prefix text:=auth.uid()::text||'/';
  v_complete boolean;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_slot not in ('selfie','cnh_front','cnh_back','crlv','vehicle_photo') then
    raise exception 'invalid_document_slot' using errcode='22023';
  end if;
  if v_path='' or left(v_path,length(v_prefix))<>v_prefix or length(v_path)>500 then
    raise exception 'invalid_document_path' using errcode='22023';
  end if;

  v_user_id:=public.mobility_user_id();
  if v_user_id is null then raise exception 'driver_profile_missing' using errcode='P0002'; end if;

  select * into v_driver
  from public.drivers
  where user_id=v_user_id
  for update;
  if not found then raise exception 'driver_profile_missing' using errcode='P0002'; end if;

  update public.drivers set
    selfie_url=case when v_slot='selfie' then v_path else selfie_url end,
    cnh_url=case when v_slot='cnh_front' then v_path else cnh_url end,
    cnh_back_url=case when v_slot='cnh_back' then v_path else cnh_back_url end,
    vehicle_document_url=case when v_slot='crlv' then v_path else vehicle_document_url end,
    vehicle_photo_url=case when v_slot='vehicle_photo' then v_path else vehicle_photo_url end,
    photo_url=case when v_slot='selfie' and photo_url is null then v_path else photo_url end,
    updated_at=now()
  where id=v_driver.id
  returning * into v_driver;

  v_complete:=
    v_driver.selfie_url is not null and
    v_driver.cnh_url is not null and
    v_driver.cnh_back_url is not null and
    v_driver.vehicle_document_url is not null and
    v_driver.vehicle_photo_url is not null;

  update public.drivers set
    documents_status=case when v_complete then 'pending_review' else 'pending_upload' end,
    approval_status=case when approval_status='bloqueado' then 'bloqueado' else 'em_analise' end,
    approved_at=case when approval_status='bloqueado' then approved_at else null end,
    motivo_reprovacao=case when approval_status='bloqueado' then motivo_reprovacao else null end,
    is_online=false,
    updated_at=now()
  where id=v_driver.id
  returning * into v_driver;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),
    'driver.document.updated',
    'driver',
    v_driver.id::text,
    jsonb_build_object(
      'slot',v_slot,
      'documents_status',v_driver.documents_status,
      'approval_status',v_driver.approval_status,
      'complete',v_complete
    )
  );

  return jsonb_build_object(
    'ok',true,
    'driver_id',v_driver.id,
    'slot',v_slot,
    'documents_status',v_driver.documents_status,
    'approval_status',v_driver.approval_status,
    'complete',v_complete
  );
end;
$$;

revoke all on function public.driver_update_document(text,text) from public,anon;
grant execute on function public.driver_update_document(text,text) to authenticated;

-- -----------------------------------------------------------------------------
-- Driver financial dashboard
-- All earnings come from canonical ride_settlements, never from summing
-- rides.final_price in the client. Wallet/withdrawals remain their own ledgers.
-- -----------------------------------------------------------------------------
create or replace function public.get_driver_financial_dashboard(
  _from timestamptz default null,
  _to timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_driver public.drivers%rowtype;
  v_wallet public.driver_wallets%rowtype;
  v_from timestamptz:=coalesce(_from,now()-interval '30 days');
  v_to timestamptz:=coalesce(_to,now());
  v_provider text;
  v_period_cents bigint:=0;
  v_period_rides integer:=0;
  v_today_cents bigint:=0;
  v_week_cents bigint:=0;
  v_month_cents bigint:=0;
  v_settlements jsonb:='[]'::jsonb;
  v_withdrawals jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_to<v_from or v_to-v_from>interval '366 days' then
    raise exception 'invalid_financial_period' using errcode='22023';
  end if;

  select * into v_driver
  from public.drivers
  where user_id=public.mobility_user_id()
  limit 1;
  if not found then raise exception 'driver_profile_missing' using errcode='P0002'; end if;

  perform private.ensure_driver_wallet(v_driver.id);
  select * into v_wallet from public.driver_wallets where driver_id=v_driver.id;

  select nullif(lower(btrim(value #>> '{}')),'') into v_provider
  from public.app_settings where key='finance.payout_provider' limit 1;

  select
    coalesce(sum(rs.driver_earning_cents) filter (
      where rs.status='settled' and coalesce(rs.settled_at,rs.created_at) between v_from and v_to
    ),0)::bigint,
    count(*) filter (
      where rs.status='settled' and coalesce(rs.settled_at,rs.created_at) between v_from and v_to
    )::integer,
    coalesce(sum(rs.driver_earning_cents) filter (
      where rs.status='settled' and coalesce(rs.settled_at,rs.created_at)>=date_trunc('day',now())
    ),0)::bigint,
    coalesce(sum(rs.driver_earning_cents) filter (
      where rs.status='settled' and coalesce(rs.settled_at,rs.created_at)>=date_trunc('day',now())-interval '6 days'
    ),0)::bigint,
    coalesce(sum(rs.driver_earning_cents) filter (
      where rs.status='settled' and coalesce(rs.settled_at,rs.created_at)>=date_trunc('month',now())
    ),0)::bigint
  into v_period_cents,v_period_rides,v_today_cents,v_week_cents,v_month_cents
  from public.ride_settlements rs
  where rs.driver_id=v_driver.id;

  select coalesce(jsonb_agg(item order by item_timestamp desc),'[]'::jsonb)
  into v_settlements
  from (
    select
      jsonb_build_object(
        'settlement_id',rs.id,
        'ride_id',rs.ride_id,
        'origin_name',r.origin_name,
        'destination_name',r.destination_name,
        'category',r.category,
        'distance_km',r.distance_km,
        'duration_min',r.duration_min,
        'payment_method',rs.payment_method,
        'payment_status',rs.payment_status,
        'settlement_status',rs.status,
        'driver_earning_cents',rs.driver_earning_cents,
        'platform_fee_cents',rs.platform_fee_cents,
        'created_at',rs.created_at,
        'settled_at',rs.settled_at
      ) as item,
      coalesce(rs.settled_at,rs.created_at) as item_timestamp
    from public.ride_settlements rs
    join public.rides r on r.id=rs.ride_id
    where rs.driver_id=v_driver.id
      and coalesce(rs.settled_at,rs.created_at) between v_from and v_to
    order by coalesce(rs.settled_at,rs.created_at) desc
    limit 100
  ) q;

  select coalesce(jsonb_agg(item order by requested_at desc),'[]'::jsonb)
  into v_withdrawals
  from (
    select
      jsonb_build_object(
        'id',dw.id,
        'amount_cents',coalesce(dw.amount_cents,round(dw.amount*100)::bigint),
        'status',dw.status,
        'provider',dw.provider,
        'failure_reason',dw.failure_reason,
        'requested_at',dw.requested_at,
        'processed_at',dw.processed_at
      ) as item,
      dw.requested_at
    from public.driver_withdrawals dw
    where dw.driver_id=v_driver.id
    order by dw.requested_at desc
    limit 25
  ) w;

  return jsonb_build_object(
    'ok',true,
    'driver_id',v_driver.id,
    'period',jsonb_build_object(
      'from',v_from,
      'to',v_to,
      'settled_earnings_cents',v_period_cents,
      'settled_rides',v_period_rides
    ),
    'kpis',jsonb_build_object(
      'today_cents',v_today_cents,
      'last_7_days_cents',v_week_cents,
      'month_cents',v_month_cents
    ),
    'wallet',jsonb_build_object(
      'balance_cents',round(coalesce(v_wallet.balance,0)*100)::bigint,
      'available_balance_cents',round(coalesce(v_wallet.available_balance,0)*100)::bigint,
      'pending_balance_cents',round(coalesce(v_wallet.pending_balance,0)*100)::bigint,
      'debt_balance_cents',round(coalesce(v_wallet.debt_balance,0)*100)::bigint,
      'updated_at',v_wallet.updated_at
    ),
    'payout',jsonb_build_object(
      'enabled',v_provider is not null and v_provider<>'null',
      'provider_configured',v_provider is not null and v_provider<>'null'
    ),
    'settlements',v_settlements,
    'withdrawals',v_withdrawals
  );
end;
$$;

revoke all on function public.get_driver_financial_dashboard(timestamptz,timestamptz) from public,anon;
grant execute on function public.get_driver_financial_dashboard(timestamptz,timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- Harden withdrawal reservation: no money is reserved when there is no payout
-- provider configured. The Phase-5 financial primitive is retained, with this
-- provider readiness guard added at the public boundary.
-- -----------------------------------------------------------------------------
create or replace function public.driver_request_withdrawal(
  _amount_cents bigint,
  _idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_driver public.drivers%rowtype;
  v_wallet public.driver_wallets%rowtype;
  v_withdrawal public.driver_withdrawals%rowtype;
  v_amount numeric;
  v_provider text;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if _idempotency_key is null or _amount_cents<=0 then raise exception 'invalid_withdrawal_request' using errcode='22023'; end if;

  select nullif(lower(btrim(value #>> '{}')),'') into v_provider
  from public.app_settings where key='finance.payout_provider' limit 1;
  if v_provider is null or v_provider='null' then
    raise exception 'payout_provider_not_configured' using errcode='P0001';
  end if;

  select * into v_driver from public.drivers where user_id=public.mobility_user_id() for update;
  if not found then raise exception 'driver_profile_missing'; end if;

  select * into v_withdrawal from public.driver_withdrawals
  where driver_id=v_driver.id and idempotency_key=_idempotency_key limit 1;
  if found then return to_jsonb(v_withdrawal); end if;

  perform private.ensure_driver_wallet(v_driver.id);
  select * into v_wallet from public.driver_wallets where driver_id=v_driver.id for update;
  if v_wallet.debt_balance>0 then raise exception 'driver_wallet_debt'; end if;

  v_amount:=_amount_cents::numeric/100;
  if v_wallet.available_balance<v_amount then raise exception 'insufficient_available_balance'; end if;

  insert into public.driver_withdrawals(driver_id,amount,amount_cents,status,idempotency_key)
  values(v_driver.id,v_amount,_amount_cents,'pending',_idempotency_key)
  returning * into v_withdrawal;

  insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
  values(v_driver.id,v_amount,'debit','withdrawal_reserve',v_withdrawal.id,'Reserva para saque')
  on conflict(driver_id,source,source_id) do nothing;

  update public.driver_wallets
  set balance=balance-v_amount,available_balance=available_balance-v_amount,updated_at=now()
  where driver_id=v_driver.id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),
    'driver.withdrawal.requested',
    'driver_withdrawal',
    v_withdrawal.id::text,
    jsonb_build_object('driver_id',v_driver.id,'amount_cents',_amount_cents,'provider',v_provider)
  );

  return to_jsonb(v_withdrawal);
end;
$$;

revoke all on function public.driver_request_withdrawal(bigint,uuid) from public,anon;
grant execute on function public.driver_request_withdrawal(bigint,uuid) to authenticated;
