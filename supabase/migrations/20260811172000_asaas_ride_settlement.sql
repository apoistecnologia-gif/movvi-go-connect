-- APOIS CORRIDAS — atomic Asaas ride settlement.
-- service_role only: webhook converts provider truth into canonical settlement
-- plus the driver's internal mirror ledger exactly once.

create or replace function public.settle_asaas_ride_payment(
  _ride_id uuid,
  _provider_payment_id text,
  _net_amount numeric,
  _provider_fee numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_settlement public.ride_settlements%rowtype;
  v_wallet public.driver_wallets%rowtype;
  v_credit_amount numeric(12,2);
  v_inserted uuid;
begin
  if _ride_id is null or nullif(btrim(_provider_payment_id),'') is null then
    raise exception 'invalid_asaas_settlement_identity' using errcode='22023';
  end if;
  if _net_amount is null or _net_amount <= 0 then
    raise exception 'invalid_asaas_net_amount' using errcode='22023';
  end if;
  if coalesce(_provider_fee,0) < 0 then
    raise exception 'invalid_asaas_provider_fee' using errcode='22023';
  end if;

  select * into v_settlement
  from public.ride_settlements
  where ride_id=_ride_id
  for update;
  if not found then raise exception 'ride_settlement_not_found' using errcode='P0002'; end if;
  if v_settlement.driver_id is null then raise exception 'ride_driver_missing'; end if;
  if lower(coalesce(v_settlement.payment_method,'')) <> 'pix' then raise exception 'ride_payment_method_not_pix'; end if;

  if v_settlement.status='settled' and v_settlement.payment_status='paid' then
    if v_settlement.payment_provider='asaas' and v_settlement.provider_payment_id=_provider_payment_id then
      return jsonb_build_object('ok',true,'duplicate',true,'ride_id',_ride_id,'driver_id',v_settlement.driver_id);
    end if;
    raise exception 'ride_already_settled_by_other_payment';
  end if;

  -- The driver receives 100% of the Asaas net value; Asaas' own fee is not
  -- represented as APOIS platform revenue.
  v_credit_amount:=round(_net_amount::numeric,2);

  insert into public.driver_wallets(driver_id,balance,available_balance,created_at,updated_at)
  values(v_settlement.driver_id,0,0,now(),now())
  on conflict(driver_id) do nothing;

  select * into v_wallet
  from public.driver_wallets
  where driver_id=v_settlement.driver_id
  for update;

  insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
  values(v_settlement.driver_id,v_credit_amount,'credit','ride',_ride_id,'Corrida Pix recebida via Asaas')
  on conflict(driver_id,source,source_id) do nothing
  returning id into v_inserted;

  if v_inserted is not null then
    update public.driver_wallets
    set balance=balance+v_credit_amount,
        available_balance=available_balance+v_credit_amount,
        updated_at=now()
    where driver_id=v_settlement.driver_id;
  end if;

  update public.ride_settlements
  set payment_provider='asaas',
      provider_payment_id=_provider_payment_id,
      payment_provider_fee=round(coalesce(_provider_fee,0)::numeric,2),
      platform_fee=0,
      driver_earning=v_credit_amount,
      payment_status='paid',
      status='settled',
      settled_at=coalesce(settled_at,now()),
      updated_at=now()
  where ride_id=_ride_id
  returning * into v_settlement;

  return jsonb_build_object(
    'ok',true,
    'duplicate',v_inserted is null,
    'ride_id',v_settlement.ride_id,
    'driver_id',v_settlement.driver_id,
    'driver_net_amount',v_credit_amount,
    'provider_fee',round(coalesce(_provider_fee,0)::numeric,2)
  );
end;
$$;

revoke all on function public.settle_asaas_ride_payment(uuid,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.settle_asaas_ride_payment(uuid,text,numeric,numeric) to service_role;
