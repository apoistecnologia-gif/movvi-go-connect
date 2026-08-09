#!/usr/bin/env bash
set -euo pipefail

PASSENGER_A_AUTH="51000000-0000-4000-8000-000000000001"
PASSENGER_B_AUTH="51000000-0000-4000-8000-000000000002"
DRIVER_A_AUTH="51000000-0000-4000-8000-000000000003"
DRIVER_B_AUTH="51000000-0000-4000-8000-000000000004"
RIDE_ID="51000000-0000-4000-8000-000000000101"
REQUEST_KEY="51000000-0000-4000-8000-000000000102"

psql -v ON_ERROR_STOP=1 <<SQL
insert into auth.users(id,email,raw_user_meta_data) values
  ('$PASSENGER_A_AUTH','security-passenger-a@example.test','{"role":"passenger","name":"Passenger A","terms_accepted":"true","privacy_accepted":"true","terms_version":"ci","privacy_version":"ci","legal_acceptance_source":"passenger_signup"}'::jsonb),
  ('$PASSENGER_B_AUTH','security-passenger-b@example.test','{"role":"passenger","name":"Passenger B","terms_accepted":"true","privacy_accepted":"true","terms_version":"ci","privacy_version":"ci","legal_acceptance_source":"passenger_signup"}'::jsonb),
  ('$DRIVER_A_AUTH','security-driver-a@example.test','{"role":"driver","name":"Driver A"}'::jsonb),
  ('$DRIVER_B_AUTH','security-driver-b@example.test','{"role":"driver","name":"Driver B"}'::jsonb);

insert into public.drivers(user_id,name,category,approval_status,subscription_status,is_online,documents_status,cnh_url,cnh_back_url,vehicle_document_url,selfie_url)
select id,'Driver A','carros','aprovado','teste',true,'approved','private/a-cnh','private/a-cnh-back','private/a-crlv','private/a-selfie'
from public.users where auth_user_id='$DRIVER_A_AUTH';

insert into public.drivers(user_id,name,category,approval_status,subscription_status,is_online,documents_status,cnh_url,cnh_back_url,vehicle_document_url,selfie_url)
select id,'Driver B','carros','aprovado','teste',true,'approved','private/b-cnh','private/b-cnh-back','private/b-crlv','private/b-selfie'
from public.users where auth_user_id='$DRIVER_B_AUTH';

insert into public.driver_wallets(driver_id,balance,available_balance)
select id,100,100 from public.drivers where user_id=(select id from public.users where auth_user_id='$DRIVER_A_AUTH');
insert into public.driver_wallets(driver_id,balance,available_balance)
select id,200,200 from public.drivers where user_id=(select id from public.users where auth_user_id='$DRIVER_B_AUTH');

insert into public.rides(
  id,passenger_id,driver_id,accepted_driver_id,category,status,
  origin,destination,origin_name,destination_name,
  origin_lat,origin_lng,destination_lat,destination_lng,
  estimated_price,payment_method,request_key
)
select
  '$RIDE_ID',p.id,d.id,d.id,'carros','motorista_a_caminho',
  '{"lat":-9.39,"lng":-40.50}'::jsonb,'{"lat":-9.40,"lng":-40.49}'::jsonb,
  'Origem segurança','Destino segurança',-9.39,-40.50,-9.40,-40.49,
  25.00,'cash','$REQUEST_KEY'
from public.users p, public.drivers d
where p.auth_user_id='$PASSENGER_B_AUTH'
  and d.user_id=(select id from public.users where auth_user_id='$DRIVER_B_AUTH');
SQL

query_as_auth() {
  local auth_id="$1"
  local sql="$2"
  psql -Atq -v ON_ERROR_STOP=1 <<SQL
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='$auth_id';
$sql
rollback;
SQL
}

# SECURITY 1 — Passenger A cannot read Passenger B profile.
PASSENGER_B_VISIBLE=$(query_as_auth "$PASSENGER_A_AUTH" "select count(*) from public.users where auth_user_id='$PASSENGER_B_AUTH';")
[[ "$PASSENGER_B_VISIBLE" == "0" ]] || { echo "Passenger A can read Passenger B"; exit 1; }

# SECURITY 2 — Driver A cannot read Driver B wallet.
DRIVER_B_WALLET_VISIBLE=$(query_as_auth "$DRIVER_A_AUTH" "select count(*) from public.driver_wallets where driver_id=(select d.id from public.drivers d join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_B_AUTH');")
[[ "$DRIVER_B_WALLET_VISIBLE" == "0" ]] || { echo "Driver A can read Driver B wallet"; exit 1; }

# SECURITY 3 — Driver A cannot read a ride assigned/offered only to Driver B.
UNRELATED_RIDE_VISIBLE=$(query_as_auth "$DRIVER_A_AUTH" "select count(*) from public.rides where id='$RIDE_ID';")
[[ "$UNRELATED_RIDE_VISIBLE" == "0" ]] || { echo "Driver A can read unrelated ride"; exit 1; }

# SECURITY 4 — Passenger cannot read Driver private profile/document paths.
PRIVATE_DRIVER_VISIBLE=$(query_as_auth "$PASSENGER_A_AUTH" "select count(*) from public.drivers where cnh_url is not null or vehicle_document_url is not null or selfie_url is not null;")
[[ "$PRIVATE_DRIVER_VISIBLE" == "0" ]] || { echo "Passenger can read private Driver records"; exit 1; }

# SECURITY 5 — normal mobility user cannot perform an Admin mutation.
set +e
ADMIN_ATTEMPT=$(psql -Atq -v ON_ERROR_STOP=1 2>&1 <<SQL
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='$PASSENGER_A_AUTH';
select public.admin_update_setting('ride.cancellation_free_minutes','5'::jsonb);
commit;
SQL
)
ADMIN_CODE=$?
set -e
[[ $ADMIN_CODE -ne 0 && "$ADMIN_ATTEMPT" == *"forbidden"* ]] || {
  echo "Normal user was not blocked from Admin mutation"
  echo "$ADMIN_ATTEMPT"
  exit 1
}

echo "APOIS_SECURITY_RLS_PHASE10_OK"
