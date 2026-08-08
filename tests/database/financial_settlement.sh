#!/usr/bin/env bash
set -euo pipefail

DRIVER_AUTH="20000000-0000-4000-8000-000000000001"
PASSENGER_AUTH="20000000-0000-4000-8000-000000000002"
PIX_RIDE="91000000-0000-4000-8000-000000000001"
CASH_RIDE="91000000-0000-4000-8000-000000000002"
WALLET_RIDE="91000000-0000-4000-8000-000000000003"
FEE_RIDE="91000000-0000-4000-8000-000000000004"
FEE_ID="92000000-0000-4000-8000-000000000001"
WITHDRAW_KEY="93000000-0000-4000-8000-000000000001"

psql -v ON_ERROR_STOP=1 <<SQL
insert into auth.users(id,email,raw_user_meta_data) values
  ('$DRIVER_AUTH','driver-finance@example.test','{"role":"driver","name":"Driver Finance"}'::jsonb),
  ('$PASSENGER_AUTH','passenger-finance@example.test','{"role":"passenger","name":"Passenger Finance","terms_accepted":"true","privacy_accepted":"true","terms_version":"ci","privacy_version":"ci","legal_acceptance_source":"passenger_signup"}'::jsonb);

insert into public.drivers(user_id,name,category,approval_status,subscription_status,is_online,current_lat,current_lng,last_location_at,documents_status)
select u.id,'Driver Finance','carros','aprovado','teste',true,-9.39,-40.50,now(),'approved'
from public.users u where u.auth_user_id='$DRIVER_AUTH';

update public.passenger_wallets w set balance=100
from public.users u where w.passenger_id=u.id and u.auth_user_id='$PASSENGER_AUTH';

insert into public.rides(
  id,passenger_id,driver_id,accepted_driver_id,category,status,origin,destination,origin_name,destination_name,
  origin_lat,origin_lng,destination_lat,destination_lng,estimated_price,payment_method,request_key,started_at
)
select '$PIX_RIDE',p.id,d.id,d.id,'carros','em_viagem','{"lat":-9.39,"lng":-40.50}'::jsonb,'{"lat":-9.40,"lng":-40.49}'::jsonb,
  'Origem Pix','Destino Pix',-9.39,-40.50,-9.40,-40.49,30.00,'pix','94000000-0000-4000-8000-000000000001',now()
from public.users p, public.drivers d where p.auth_user_id='$PASSENGER_AUTH' and d.user_id=(select id from public.users where auth_user_id='$DRIVER_AUTH');

insert into public.rides(
  id,passenger_id,driver_id,accepted_driver_id,category,status,origin,destination,origin_name,destination_name,
  origin_lat,origin_lng,destination_lat,destination_lng,estimated_price,payment_method,request_key,started_at
)
select '$CASH_RIDE',p.id,d.id,d.id,'carros','em_viagem','{"lat":-9.39,"lng":-40.50}'::jsonb,'{"lat":-9.40,"lng":-40.49}'::jsonb,
  'Origem Cash','Destino Cash',-9.39,-40.50,-9.40,-40.49,20.00,'cash','94000000-0000-4000-8000-000000000002',now()
from public.users p, public.drivers d where p.auth_user_id='$PASSENGER_AUTH' and d.user_id=(select id from public.users where auth_user_id='$DRIVER_AUTH');

insert into public.rides(
  id,passenger_id,driver_id,accepted_driver_id,category,status,origin,destination,origin_name,destination_name,
  origin_lat,origin_lng,destination_lat,destination_lng,estimated_price,payment_method,request_key,started_at
)
select '$WALLET_RIDE',p.id,d.id,d.id,'carros','em_viagem','{"lat":-9.39,"lng":-40.50}'::jsonb,'{"lat":-9.40,"lng":-40.49}'::jsonb,
  'Origem Wallet','Destino Wallet',-9.39,-40.50,-9.40,-40.49,10.00,'wallet','94000000-0000-4000-8000-000000000003',now()
from public.users p, public.drivers d where p.auth_user_id='$PASSENGER_AUTH' and d.user_id=(select id from public.users where auth_user_id='$DRIVER_AUTH');
SQL

# Finish PIX ride: creates pending settlement, no unilateral payment confirmation.
psql -v ON_ERROR_STOP=1 <<SQL
begin;
set local "request.jwt.claim.sub"='$DRIVER_AUTH';
select public.driver_finish_ride('$PIX_RIDE');
commit;
SQL

PIX_PENDING=$(psql -Atqc "select count(*) from public.ride_settlements where ride_id='$PIX_RIDE' and status='pending_payment' and payment_status='pending' and passenger_charge_cents=3000 and driver_earning_cents=3000 and platform_fee_cents=0")
PENDING_BALANCE=$(psql -Atqc "select pending_balance from public.driver_wallets w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
[[ "$PIX_PENDING" == "1" ]] || { echo "PIX settlement was not created pending"; exit 1; }
[[ "$PENDING_BALANCE" == "30.00" ]] || { echo "Pending Driver balance expected 30.00, got $PENDING_BALANCE"; exit 1; }

# Gateway/service-role confirms exact electronic amount. Repeat same event to prove idempotency.
psql -v ON_ERROR_STOP=1 <<SQL
begin;
set local role service_role;
select public.settle_ride_electronic_payment('$PIX_RIDE','mercadopago','pay-ci-001',3000,85,'event-ci-001');
select public.settle_ride_electronic_payment('$PIX_RIDE','mercadopago','pay-ci-001',3000,85,'event-ci-001');
commit;
SQL

PIX_SETTLED=$(psql -Atqc "select count(*) from public.ride_settlements where ride_id='$PIX_RIDE' and status='settled' and payment_status='paid' and payment_provider_fee_cents=85")
PIX_LEDGER=$(psql -Atqc "select count(*) from public.driver_ledger_entries where ride_id='$PIX_RIDE' and entry_type='ride_earning' and direction='credit' and amount_cents=3000")
PIX_WALLET_TX=$(psql -Atqc "select count(*) from public.driver_wallet_transactions t join public.drivers d on d.id=t.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH' and t.source='ride_settlement' and t.source_id=(select id from public.ride_settlements where ride_id='$PIX_RIDE')")
PIX_PROVIDER_FEE=$(psql -Atqc "select count(*) from public.platform_ledger_entries where ride_id='$PIX_RIDE' and entry_type='payment_provider_fee' and direction='debit' and amount_cents=85")
AVAILABLE=$(psql -Atqc "select available_balance from public.driver_wallets w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
PENDING=$(psql -Atqc "select pending_balance from public.driver_wallets w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
[[ "$PIX_SETTLED" == "1" ]] || { echo "PIX settlement did not settle"; exit 1; }
[[ "$PIX_LEDGER" == "1" ]] || { echo "PIX Driver ledger must be idempotent"; exit 1; }
[[ "$PIX_WALLET_TX" == "1" ]] || { echo "PIX Driver wallet credit must be idempotent"; exit 1; }
[[ "$PIX_PROVIDER_FEE" == "1" ]] || { echo "Provider fee ledger missing"; exit 1; }
[[ "$AVAILABLE" == "30.00" && "$PENDING" == "0.00" ]] || { echo "Driver wallet wrong after PIX settle: available=$AVAILABLE pending=$PENDING"; exit 1; }

# Cash is confirmed only by assigned Driver and records earnings, not withdrawable platform wallet.
psql -v ON_ERROR_STOP=1 <<SQL
begin;
set local "request.jwt.claim.sub"='$DRIVER_AUTH';
select public.driver_finish_ride('$CASH_RIDE');
select public.driver_confirm_cash_payment('$CASH_RIDE');
commit;
SQL
CASH_SETTLED=$(psql -Atqc "select count(*) from public.ride_settlements where ride_id='$CASH_RIDE' and status='settled' and cash_amount_cents=2000")
CASH_LEDGER=$(psql -Atqc "select count(*) from public.driver_ledger_entries where ride_id='$CASH_RIDE' and entry_type='ride_earning' and amount_cents=2000")
AVAILABLE_AFTER_CASH=$(psql -Atqc "select available_balance from public.driver_wallets w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
[[ "$CASH_SETTLED" == "1" && "$CASH_LEDGER" == "1" ]] || { echo "Cash settlement missing"; exit 1; }
[[ "$AVAILABLE_AFTER_CASH" == "30.00" ]] || { echo "Cash must not be added to withdrawable wallet"; exit 1; }

# Internal wallet is debited server-side and immediately settles the Driver platform wallet.
psql -v ON_ERROR_STOP=1 <<SQL
begin;
set local "request.jwt.claim.sub"='$DRIVER_AUTH';
select public.driver_finish_ride('$WALLET_RIDE');
commit;
SQL
PASSENGER_BALANCE=$(psql -Atqc "select balance from public.passenger_wallets w join public.users u on u.id=w.passenger_id where u.auth_user_id='$PASSENGER_AUTH'")
WALLET_SETTLED=$(psql -Atqc "select count(*) from public.ride_settlements where ride_id='$WALLET_RIDE' and status='settled' and wallet_amount_cents=1000")
AVAILABLE_AFTER_WALLET=$(psql -Atqc "select available_balance from public.driver_wallets w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
[[ "$PASSENGER_BALANCE" == "90.00" ]] || { echo "Passenger wallet expected 90.00, got $PASSENGER_BALANCE"; exit 1; }
[[ "$WALLET_SETTLED" == "1" ]] || { echo "Internal wallet settlement missing"; exit 1; }
[[ "$AVAILABLE_AFTER_WALLET" == "40.00" ]] || { echo "Driver wallet expected 40.00, got $AVAILABLE_AFTER_WALLET"; exit 1; }

# Withdrawal reserves atomically and is idempotent; provider failure refunds exactly once.
psql -v ON_ERROR_STOP=1 <<SQL
begin;
set local "request.jwt.claim.sub"='$DRIVER_AUTH';
select public.driver_request_withdrawal(1500,'$WITHDRAW_KEY');
select public.driver_request_withdrawal(1500,'$WITHDRAW_KEY');
commit;
SQL
WITHDRAW_COUNT=$(psql -Atqc "select count(*) from public.driver_withdrawals w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH' and w.idempotency_key='$WITHDRAW_KEY'")
AVAILABLE_RESERVED=$(psql -Atqc "select available_balance from public.driver_wallets w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
[[ "$WITHDRAW_COUNT" == "1" && "$AVAILABLE_RESERVED" == "25.00" ]] || { echo "Withdrawal reservation/idempotency failed"; exit 1; }
WITHDRAW_ID=$(psql -Atqc "select w.id from public.driver_withdrawals w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH' and w.idempotency_key='$WITHDRAW_KEY'")
psql -v ON_ERROR_STOP=1 <<SQL
begin;
set local role service_role;
select public.fail_driver_withdrawal('$WITHDRAW_ID','test-provider','simulated failure');
select public.fail_driver_withdrawal('$WITHDRAW_ID','test-provider','duplicate failure');
commit;
SQL
AVAILABLE_REFUNDED=$(psql -Atqc "select available_balance from public.driver_wallets w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
REFUND_COUNT=$(psql -Atqc "select count(*) from public.driver_wallet_transactions where source='withdrawal_refund' and source_id='$WITHDRAW_ID'")
[[ "$AVAILABLE_REFUNDED" == "40.00" && "$REFUND_COUNT" == "1" ]] || { echo "Withdrawal failure refund is not idempotent"; exit 1; }

# Cancellation fee: paid fee credits Driver, provider reversal must claw back the credit.
psql -v ON_ERROR_STOP=1 <<SQL
insert into public.rides(
  id,passenger_id,driver_id,accepted_driver_id,category,status,origin,destination,origin_name,destination_name,
  origin_lat,origin_lng,destination_lat,destination_lng,estimated_price,payment_method,request_key,cancelled_at,cancelled_by
)
select '$FEE_RIDE',p.id,d.id,d.id,'carros','cancelada_passageiro','{"lat":-9.39,"lng":-40.50}'::jsonb,'{"lat":-9.40,"lng":-40.49}'::jsonb,
  'Origem Fee','Destino Fee',-9.39,-40.50,-9.40,-40.49,15.00,'pix','94000000-0000-4000-8000-000000000004',now(),'passenger'
from public.users p, public.drivers d where p.auth_user_id='$PASSENGER_AUTH' and d.user_id=(select id from public.users where auth_user_id='$DRIVER_AUTH');
insert into public.cancellation_fees(id,ride_id,passenger_id,amount,status,is_paid)
select '$FEE_ID','$FEE_RIDE',p.id,5.00,'unpaid',false from public.users p where p.auth_user_id='$PASSENGER_AUTH';
select public.settle_cancellation_fee('$FEE_ID');
SQL
AFTER_FEE=$(psql -Atqc "select available_balance from public.driver_wallets w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
[[ "$AFTER_FEE" == "45.00" ]] || { echo "Paid cancellation fee did not credit Driver wallet"; exit 1; }
psql -v ON_ERROR_STOP=1 -c "select public.reverse_cancellation_fee_settlement('$FEE_ID');"
AFTER_REVERSAL=$(psql -Atqc "select available_balance from public.driver_wallets w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
REVERSAL_TX=$(psql -Atqc "select count(*) from public.driver_wallet_transactions where source='cancellation_fee_reversal' and source_id='$FEE_ID'")
[[ "$AFTER_REVERSAL" == "40.00" && "$REVERSAL_TX" == "1" ]] || { echo "Cancellation fee reversal did not claw back Driver wallet"; exit 1; }

echo "APOIS_FINANCIAL_SETTLEMENT_OK"
