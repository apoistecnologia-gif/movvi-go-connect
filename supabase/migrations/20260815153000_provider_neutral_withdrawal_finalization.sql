create or replace function public.mark_driver_withdrawal_paid(
  _withdrawal_id uuid,
  _transfer_id text,
  _end_to_end_id text,
  _response jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  if exists(
    select 1
    from public.driver_withdrawals
    where id = _withdrawal_id
      and status = 'paid'
  ) then
    return;
  end if;

  update public.driver_withdrawals
  set status = 'paid',
      provider_transfer_id = _transfer_id,
      provider_end_to_end_id = _end_to_end_id,
      provider_response = _response,
      failure_reason = null,
      processed_at = coalesce(processed_at, now()),
      updated_at = now()
  where id = _withdrawal_id
    and status in ('pending','processing');

  if not found then
    raise exception 'withdrawal_not_payable' using errcode='55000';
  end if;
end;
$function$;

create or replace function public.mark_driver_withdrawal_failed(
  _withdrawal_id uuid,
  _reason text,
  _response jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_w public.driver_withdrawals%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  select *
    into v_w
  from public.driver_withdrawals
  where id = _withdrawal_id
  for update;

  if v_w.id is null then
    raise exception 'withdrawal_not_found' using errcode='P0002';
  end if;

  if v_w.status = 'failed' then
    return;
  end if;

  if v_w.status = 'paid' then
    raise exception 'paid_withdrawal_cannot_fail' using errcode='55000';
  end if;

  if v_w.status not in ('pending','processing') then
    raise exception 'withdrawal_not_refundable' using errcode='55000';
  end if;

  update public.driver_withdrawals
  set status = 'failed',
      failure_reason = left(coalesce(_reason,'payout_failed'),1000),
      provider_response = _response,
      refunded_at = now(),
      processed_at = coalesce(processed_at, now()),
      updated_at = now()
  where id = _withdrawal_id;

  update public.driver_wallets
  set balance = balance + v_w.amount,
      available_balance = available_balance + v_w.amount,
      updated_at = now()
  where driver_id = v_w.driver_id;

  insert into public.driver_wallet_transactions(
    driver_id,
    amount,
    direction,
    source,
    source_id,
    description
  )
  values(
    v_w.driver_id,
    v_w.amount,
    'credit',
    'withdrawal_refund',
    v_w.id,
    'Estorno automático de saque Pix'
  )
  on conflict (driver_id, source, source_id) do nothing;
end;
$function$;
