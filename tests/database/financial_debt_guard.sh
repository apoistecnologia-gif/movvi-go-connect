#!/usr/bin/env bash
set -euo pipefail

DRIVER_AUTH="21000000-0000-4000-8000-000000000001"
PASSENGER_AUTH="21000000-0000-4000-8000-000000000002"
RIDE_ID="91100000-0000-4000-8000-000000000001"
FEE_ID="92100000-0000-4000-8000-000000000001"
WITHDRAW_KEY="93100000-0000-4000-8000-000000000001"
BLOCKED_KEY="93100000-0000-4000-8000-000000000002"

psql -v ON_ERROR_STOP=1 <<SQL
insert into auth.users(id,email,raw_user_meta_data) values
  ('$DRIVER_AUTH','driver-debt@example.test','{"role":"driver","name":"Driver Debt"}'::jsonb),
  ('$PASSENGER_AUTH','passenger-debt@example.test','{"role":"passenger","name":"Passenger Debt","terms_accepted":"true","privacy_accepted":"true","terms_version":"ci","privacy_version":"ci","legal_acceptance_source":"passenger_signup"}'::jsonb);

insert into public.drivers(user_id,name,category,approval_status,subscription_status,is_online,current_lat,current_lng,last_location_at,documents_status)
select u.id,'Driver Debt','carros','aprovado','teste',true,-9.39,-40.50,now(),'approved'
from public.users u where u.auth_user_id='$DRIVER_AUTH';

insert into public.rides(
  id,passenger_id,driver_id,accepted_driver_id,category,status,origin,destination,origin_name,destination_name,
  origin_lat,origin_lng,destination_lat,destination_lng,estimated_price,payment_method,request_key,cancelled_at,cancelled_by
)
select '$RIDE_ID',p.id,d.id,d.id,'carros','cancelada_passageiro',
  '{"lat":-9.39,"lng":-40.50}'::jsonb,'{"lat":-9.40,"lng":-40.49}'::jsonb,
  'Origem','Destino',-9.39,-40.50,-9.40,-40.49,15.00,'pix','94100000-0000-4000-8000-000000000001',now(),'passenger'
from public.users p, public.drivers d
where p.auth_user_id='$PASSENGER_AUTH'
  and d.user_id=(select id from public.users where auth_user_id='$DRIVER_AUTH');

insert into public.cancellation_fees(id,ride_id,passenger_id,amount,status,is_paid)
select '$FEE_ID','$RIDE_ID',p.id,5.00,'unpaid',false
from public.users p where p.auth_user_id='$PASSENGER_AUTH';

select public.settle_cancellation_fee('$FEE_ID');
SQL

# Driver reserves the entire paid cancellation credit and the provider marks the
# withdrawal paid. A later payment reversal therefore cannot claw back cash
# already withdrawn and must create debt.
psql -v ON_ERROR_STOP=1 <<SQL
begin;
set local "request.jwt.claim.sub"='$DRIVER_AUTH';
select public.driver_request_withdrawal(500,'$WITHDRAW_KEY');
commit;
SQL
WITHDRAW_ID=$(psql -Atqc "select w.id from public.driver_withdrawals w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH' and w.idempotency_key='$WITHDRAW_KEY'")
psql -v ON_ERROR_STOP=1 <<SQL
begin;
set local role service_role;
select public.complete_driver_withdrawal('$WITHDRAW_ID','test-provider','transfer-debt-ci');
select public.reverse_cancellation_fee_settlement('$FEE_ID');
commit;
SQL

DEBT=$(psql -Atqc "select debt_balance from public.driver_wallets w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
AVAILABLE=$(psql -Atqc "select available_balance from public.driver_wallets w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
[[ "$DEBT" == "5.00" && "$AVAILABLE" == "0.00" ]] || { echo "Expected debt=5.00 available=0.00, got debt=$DEBT available=$AVAILABLE"; exit 1; }

set +e
psql -v ON_ERROR_STOP=1 <<SQL > /tmp/debt-withdraw.out 2> /tmp/debt-withdraw.err
begin;
set local "request.jwt.claim.sub"='$DRIVER_AUTH';
select public.driver_request_withdrawal(100,'$BLOCKED_KEY');
commit;
SQL
CODE=$?
set -e
[[ "$CODE" != "0" ]] || { echo "Withdrawal unexpectedly succeeded while Driver had debt"; exit 1; }
grep -q "driver_wallet_debt" /tmp/debt-withdraw.err || { cat /tmp/debt-withdraw.err; echo "Expected driver_wallet_debt"; exit 1; }

BLOCKED_COUNT=$(psql -Atqc "select count(*) from public.driver_withdrawals w join public.drivers d on d.id=w.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH' and w.idempotency_key='$BLOCKED_KEY'")
[[ "$BLOCKED_COUNT" == "0" ]] || { echo "Debt-blocked withdrawal record should not exist"; exit 1; }

echo "APOIS_FINANCIAL_DEBT_GUARD_OK"
