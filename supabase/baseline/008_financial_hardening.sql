-- APOIS CORRIDAS — CANONICAL BASELINE 008
-- Phase 5 hardening: debt blocks new withdrawals and failed payout refunds
-- respect debt created after the reservation.
-- Fresh-database baseline only. Do not execute ad-hoc on production.

create or replace function public.driver_request_withdrawal(_amount_cents bigint,_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_driver public.drivers%rowtype;
  v_wallet public.driver_wallets%rowtype;
  v_withdrawal public.driver_withdrawals%rowtype;
  v_amount numeric;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if _idempotency_key is null or _amount_cents<=0 then raise exception 'invalid_withdrawal_request' using errcode='22023'; end if;
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
  update public.driver_wallets set balance=balance-v_amount,available_balance=available_balance-v_amount,updated_at=now()
  where driver_id=v_driver.id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'driver.withdrawal.requested','driver_withdrawal',v_withdrawal.id::text,jsonb_build_object('driver_id',v_driver.id,'amount_cents',_amount_cents));
  return to_jsonb(v_withdrawal);
end;
$$;

create or replace function public.fail_driver_withdrawal(
  _withdrawal_id uuid,_provider text,_failure_reason text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_withdrawal public.driver_withdrawals%rowtype;
  v_restored boolean:=false;
begin
  select * into v_withdrawal from public.driver_withdrawals where id=_withdrawal_id for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if v_withdrawal.status='failed' then return to_jsonb(v_withdrawal); end if;
  if v_withdrawal.status not in ('pending','processing') then raise exception 'invalid_withdrawal_status'; end if;

  -- Use the same idempotent credit helper used by settled rides. If a refund
  -- happens after a financial reversal created debt, the returned reservation
  -- first compensates that debt and only the remainder becomes withdrawable.
  v_restored:=private.credit_driver_wallet(
    v_withdrawal.driver_id,
    coalesce(v_withdrawal.amount_cents,round(v_withdrawal.amount*100)::bigint),
    'withdrawal_refund',
    v_withdrawal.id,
    'Devolução de saque não processado',
    0
  );

  update public.driver_withdrawals set
    status='failed',
    provider=nullif(lower(trim(_provider)),''),
    failure_reason=left(coalesce(_failure_reason,''),500),
    processed_at=now(),
    updated_at=now()
  where id=v_withdrawal.id
  returning * into v_withdrawal;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'driver.withdrawal.failed','driver_withdrawal',v_withdrawal.id::text,
    jsonb_build_object('provider',_provider,'reason',left(coalesce(_failure_reason,''),500),'restored',v_restored));
  return to_jsonb(v_withdrawal);
end;
$$;
revoke all on function public.fail_driver_withdrawal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.fail_driver_withdrawal(uuid,text,text) to service_role;
