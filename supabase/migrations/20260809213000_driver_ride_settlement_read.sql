-- APOIS Corridas — leitura financeira canônica pelo motorista.
-- A UI do motorista não soma rides.final_price como saldo/recebido.
-- O settlement continua sendo a fonte financeira e só é exposto ao motorista
-- efetivamente atribuído à corrida.

begin;

create or replace function public.get_driver_ride_settlement(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_settlement public.ride_settlements%rowtype;
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

  select rs.*
    into v_settlement
  from public.ride_settlements rs
  join public.rides r on r.id = rs.ride_id
  where rs.ride_id = _ride_id
    and rs.driver_id = v_driver_id
    and r.driver_id = v_driver_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'settlement_not_found',
      'ride_id', _ride_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'settlement', jsonb_build_object(
      'ride_id', v_settlement.ride_id,
      'currency', v_settlement.currency,
      'gross_amount', v_settlement.gross_amount,
      'discount_amount', v_settlement.discount_amount,
      'passenger_charge', v_settlement.passenger_charge,
      'platform_fee', v_settlement.platform_fee,
      'driver_earning', v_settlement.driver_earning,
      'payment_provider_fee', v_settlement.payment_provider_fee,
      'cash_amount', v_settlement.cash_amount,
      'wallet_amount', v_settlement.wallet_amount,
      'refunded_amount', v_settlement.refunded_amount,
      'payment_method', v_settlement.payment_method,
      'payment_provider', v_settlement.payment_provider,
      'provider_payment_id', v_settlement.provider_payment_id,
      'payment_status', v_settlement.payment_status,
      'status', v_settlement.status,
      'settled_at', v_settlement.settled_at,
      'created_at', v_settlement.created_at,
      'updated_at', v_settlement.updated_at
    )
  );
end;
$$;

revoke all on function public.get_driver_ride_settlement(uuid) from public, anon;
grant execute on function public.get_driver_ride_settlement(uuid) to authenticated;

commit;
