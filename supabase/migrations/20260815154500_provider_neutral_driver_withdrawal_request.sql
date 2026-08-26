create or replace function apois_rpc_private.driver_request_withdrawal(
  _amount_cents bigint,
  _idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_driver public.drivers%rowtype;
  v_wallet public.driver_wallets%rowtype;
  v_destination public.driver_payout_destinations%rowtype;
  v_withdrawal public.driver_withdrawals%rowtype;
  v_min_cents bigint := 2000;
  v_enabled boolean := false;
  v_target_provider text := 'disabled';
  v_amount numeric(14,2);
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  if _amount_cents is null or _amount_cents <= 0 then
    raise exception 'invalid_withdrawal_amount' using errcode='22023';
  end if;

  if _idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode='22023';
  end if;

  select coalesce((value #>> '{}')::boolean,false)
    into v_enabled
  from public.app_settings
  where key='finance.driver_payouts_enabled';

  if not coalesce(v_enabled,false) then
    raise exception 'driver_payouts_not_homologated' using errcode='55000';
  end if;

  select coalesce(nullif(lower(btrim(value #>> '{}')),''),'disabled')
    into v_target_provider
  from public.app_settings
  where key='finance.target_payout_provider';

  v_target_provider := coalesce(v_target_provider,'disabled');

  -- Only providers with an implemented and homologated transfer executor may
  -- reserve driver funds. PagBank remains intentionally blocked here until the
  -- mTLS transfer path is homologated.
  if v_target_provider <> 'asaas' then
    raise exception 'payout_provider_not_homologated' using errcode='55000';
  end if;

  select coalesce((value #>> '{}')::bigint,2000)
    into v_min_cents
  from public.app_settings
  where key='finance.driver_min_withdrawal_cents';

  if _amount_cents < coalesce(v_min_cents,2000) then
    raise exception 'min_withdrawal_amount' using errcode='22023';
  end if;

  select d.*
    into v_driver
  from public.drivers d
  where d.user_id = public.mobility_user_id()
  limit 1;

  if v_driver.id is null then
    raise exception 'driver_not_found' using errcode='P0002';
  end if;

  if v_driver.approval_status <> 'aprovado'
     or v_driver.blocked_at is not null
     or v_driver.suspended_at is not null then
    raise exception 'driver_not_eligible_for_payout' using errcode='42501';
  end if;

  select w.*
    into v_withdrawal
  from public.driver_withdrawals w
  where w.driver_id=v_driver.id
    and w.idempotency_key=_idempotency_key
  limit 1;

  if v_withdrawal.id is not null then
    return jsonb_build_object(
      'withdrawalId',v_withdrawal.id,
      'status',v_withdrawal.status,
      'provider',v_withdrawal.provider,
      'amountCents',round(v_withdrawal.amount*100)::bigint,
      'idempotent',true
    );
  end if;

  if not exists (
    select 1
    from public.driver_asaas_accounts a
    where a.driver_id=v_driver.id
      and a.status='approved'
      and nullif(a.subaccount_id,'') is not null
      and nullif(a.wallet_id,'') is not null
  ) then
    raise exception 'asaas_subaccount_not_approved' using errcode='55000';
  end if;

  if not exists (
    select 1
    from public.asaas_subaccount_credentials c
    where c.driver_id=v_driver.id
  ) then
    raise exception 'asaas_subaccount_secret_missing' using errcode='55000';
  end if;

  select p.*
    into v_destination
  from public.driver_payout_destinations p
  where p.driver_id=v_driver.id;

  if v_destination.driver_id is null or v_destination.confirmed_at is null then
    raise exception 'pix_payout_destination_not_confirmed' using errcode='55000';
  end if;

  if v_destination.payout_available_at is not null
     and v_destination.payout_available_at > now() then
    raise exception 'pix_payout_destination_cooldown' using errcode='55000';
  end if;

  select w.*
    into v_wallet
  from public.driver_wallets w
  where w.driver_id=v_driver.id
  for update;

  if v_wallet.driver_id is null then
    raise exception 'driver_wallet_not_found' using errcode='P0002';
  end if;

  v_amount := round((_amount_cents::numeric / 100.0),2);

  if v_wallet.available_balance < v_amount or v_wallet.balance < v_amount then
    raise exception 'insufficient_available_balance' using errcode='22023';
  end if;

  insert into public.driver_withdrawals(
    driver_id,
    amount,
    status,
    provider,
    idempotency_key,
    pix_key,
    pix_key_type,
    pix_holder_name
  )
  values (
    v_driver.id,
    v_amount,
    'pending',
    v_target_provider,
    _idempotency_key,
    v_destination.pix_key,
    v_destination.pix_key_type,
    v_destination.holder_name
  )
  returning * into v_withdrawal;

  update public.driver_wallets
  set balance=balance-v_amount,
      available_balance=available_balance-v_amount,
      updated_at=now()
  where driver_id=v_driver.id;

  insert into public.driver_wallet_transactions(
    driver_id,
    amount,
    direction,
    source,
    source_id,
    description
  )
  values(
    v_driver.id,
    v_amount,
    'debit',
    'withdrawal',
    v_withdrawal.id,
    'Saque Pix solicitado'
  );

  insert into public.audit_logs(
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values(
    auth.uid(),
    'driver_withdrawal_requested',
    'driver_withdrawal',
    v_withdrawal.id::text,
    jsonb_build_object(
      'provider',v_target_provider,
      'amount_cents',_amount_cents,
      'idempotency_key',_idempotency_key
    )
  );

  return jsonb_build_object(
    'withdrawalId',v_withdrawal.id,
    'status','pending',
    'provider',v_target_provider,
    'amountCents',_amount_cents,
    'idempotent',false
  );
end;
$function$;
