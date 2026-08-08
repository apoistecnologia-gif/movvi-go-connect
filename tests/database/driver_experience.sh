#!/usr/bin/env bash
set -euo pipefail

DRIVER_AUTH="31000000-0000-4000-8000-000000000001"
PASSENGER_AUTH="31000000-0000-4000-8000-000000000002"
RIDE_ID="97000000-0000-4000-8000-000000000001"

psql -v ON_ERROR_STOP=1 <<SQL
insert into auth.users(id,email,raw_user_meta_data) values
  ('$DRIVER_AUTH','driver-phase7@example.test','{"role":"driver","name":"Driver Phase 7"}'::jsonb),
  ('$PASSENGER_AUTH','passenger-phase7@example.test','{"role":"passenger","name":"Passenger Phase 7","terms_accepted":"true","privacy_accepted":"true","terms_version":"ci","privacy_version":"ci","legal_acceptance_source":"passenger_signup"}'::jsonb);

insert into public.drivers(
  user_id,name,email,phone,category,vehicle_model,vehicle_plate,vehicle_color,
  approval_status,subscription_status,is_online,documents_status,
  selfie_url,cnh_url,cnh_back_url,vehicle_document_url,vehicle_photo_url,photo_url,
  current_lat,current_lng,last_location_at
)
select u.id,'Driver Phase 7','driver-phase7@example.test','87999999999','carros','APOIS Test','ABC1D23','Preto',
  'aprovado','teste',true,'approved',
  '$DRIVER_AUTH/selfie.jpg','$DRIVER_AUTH/cnh-front.jpg','$DRIVER_AUTH/cnh-back.jpg',
  '$DRIVER_AUTH/crlv.jpg','$DRIVER_AUTH/vehicle.jpg','$DRIVER_AUTH/selfie.jpg',
  -9.3900,-40.5000,now()
from public.users u where u.auth_user_id='$DRIVER_AUTH';

insert into public.driver_wallets(driver_id,balance,available_balance,pending_balance,debt_balance)
select d.id,50,50,0,0 from public.drivers d join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'
on conflict(driver_id) do update set balance=50,available_balance=50,pending_balance=0,debt_balance=0;

insert into public.rides(
  id,passenger_id,driver_id,accepted_driver_id,category,status,origin,destination,origin_name,destination_name,
  origin_lat,origin_lng,destination_lat,destination_lng,estimated_price,final_price,payment_method,request_key,
  driver_name,driver_vehicle_model,driver_vehicle_color,driver_vehicle_plate,completed_at
)
select '$RIDE_ID',p.id,d.id,d.id,'carros','finalizada',
  '{"lat":-9.3900,"lng":-40.5000}'::jsonb,'{"lat":-9.4000,"lng":-40.4900}'::jsonb,
  'Origem Phase 7','Destino Phase 7',-9.3900,-40.5000,-9.4000,-40.4900,99.00,99.00,'cash',
  '98000000-0000-4000-8000-000000000001','Driver Phase 7','APOIS Test','Preto','ABC1D23',now()
from public.users p, public.drivers d
where p.auth_user_id='$PASSENGER_AUTH' and d.user_id=(select id from public.users where auth_user_id='$DRIVER_AUTH');

insert into public.ride_settlements(
  ride_id,passenger_id,driver_id,gross_amount_cents,discount_amount_cents,passenger_charge_cents,
  platform_fee_cents,driver_earning_cents,payment_provider_fee_cents,cash_amount_cents,
  payment_method,payment_status,status,settled_at
)
select r.id,r.passenger_id,r.driver_id,4200,0,4200,0,4200,0,4200,'cash','paid','settled',now()
from public.rides r where r.id='$RIDE_ID';
SQL

# Replacing an approved document must reopen review and force the driver offline.
KYC=$(psql -Atqc "begin; set local \"request.jwt.claim.sub\"='$DRIVER_AUTH'; select public.driver_update_document('cnh_front','$DRIVER_AUTH/cnh-front-v2.jpg'); commit;")
KYC_STATE=$(psql -Atqc "select approval_status||':'||documents_status||':'||is_online::text from public.drivers d join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
[[ "$KYC_STATE" == "em_analise:pending_review:false" ]] || { echo "Document replacement did not reopen review: $KYC_STATE"; exit 1; }
[[ "$KYC" == *'"complete": true'* || "$KYC" == *'"complete":true'* ]] || { echo "KYC response did not report complete package"; exit 1; }

set +e
FOREIGN_PATH=$(psql -v ON_ERROR_STOP=1 -Atqc "begin; set local \"request.jwt.claim.sub\"='$DRIVER_AUTH'; select public.driver_update_document('crlv','someone-else/crlv.jpg'); commit;" 2>&1)
FOREIGN_CODE=$?
set -e
[[ $FOREIGN_CODE -ne 0 && "$FOREIGN_PATH" == *"invalid_document_path"* ]] || { echo "Foreign document path was not blocked"; exit 1; }

# Dashboard is sourced from settlement truth: ride.final_price=99.00, settlement earning=42.00.
DASHBOARD=$(psql -Atqc "begin; set local \"request.jwt.claim.sub\"='$DRIVER_AUTH'; select public.get_driver_financial_dashboard(now()-interval '1 day',now()+interval '1 minute'); commit;")
[[ "$DASHBOARD" == *'"settled_earnings_cents": 4200'* || "$DASHBOARD" == *'"settled_earnings_cents":4200'* ]] || { echo "Dashboard did not use settlement amount"; exit 1; }
[[ "$DASHBOARD" == *'"available_balance_cents": 5000'* || "$DASHBOARD" == *'"available_balance_cents":5000'* ]] || { echo "Dashboard wallet balance mismatch"; exit 1; }
[[ "$DASHBOARD" == *'"enabled": false'* || "$DASHBOARD" == *'"enabled":false'* ]] || { echo "Payout should be disabled without provider"; exit 1; }

# Withdrawal reservation is impossible while payout provider is not configured.
set +e
NO_PROVIDER=$(psql -v ON_ERROR_STOP=1 -Atqc "begin; set local \"request.jwt.claim.sub\"='$DRIVER_AUTH'; select public.driver_request_withdrawal(1000,'99000000-0000-4000-8000-000000000001'); commit;" 2>&1)
NO_PROVIDER_CODE=$?
set -e
[[ $NO_PROVIDER_CODE -ne 0 && "$NO_PROVIDER" == *"payout_provider_not_configured"* ]] || { echo "Withdrawal was not blocked without payout provider"; exit 1; }

# Test-only provider enables a real idempotent reservation in the ephemeral DB.
psql -v ON_ERROR_STOP=1 -c "update public.app_settings set value=to_jsonb('test_provider'::text),updated_at=now() where key='finance.payout_provider';"
WITHDRAWAL=$(psql -Atqc "begin; set local \"request.jwt.claim.sub\"='$DRIVER_AUTH'; select public.driver_request_withdrawal(1000,'99000000-0000-4000-8000-000000000001'); commit;")
AVAILABLE=$(psql -Atqc "select round(available_balance*100)::bigint from public.driver_wallets dw join public.drivers d on d.id=dw.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
[[ "$WITHDRAWAL" == *'"status": "pending"'* || "$WITHDRAWAL" == *'"status":"pending"'* ]] || { echo "Withdrawal reservation failed"; exit 1; }
[[ "$AVAILABLE" == "4000" ]] || { echo "Withdrawal did not reserve exactly 1000 cents: $AVAILABLE"; exit 1; }

# Same idempotency key must not reserve twice.
psql -v ON_ERROR_STOP=1 -Atqc "begin; set local \"request.jwt.claim.sub\"='$DRIVER_AUTH'; select public.driver_request_withdrawal(1000,'99000000-0000-4000-8000-000000000001'); commit;" >/dev/null
AVAILABLE_AFTER_RETRY=$(psql -Atqc "select round(available_balance*100)::bigint from public.driver_wallets dw join public.drivers d on d.id=dw.driver_id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
[[ "$AVAILABLE_AFTER_RETRY" == "4000" ]] || { echo "Idempotent retry reserved twice"; exit 1; }

echo "APOIS_DRIVER_EXPERIENCE_OK"
