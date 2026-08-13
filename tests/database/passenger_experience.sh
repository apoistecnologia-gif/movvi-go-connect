#!/usr/bin/env bash
set -euo pipefail

DRIVER_AUTH="21000000-0000-4000-8000-000000000001"
PASSENGER_AUTH="21000000-0000-4000-8000-000000000002"
ACTIVE_RIDE="95000000-0000-4000-8000-000000000001"
FINISHED_RIDE="95000000-0000-4000-8000-000000000002"

psql -v ON_ERROR_STOP=1 <<SQL
insert into auth.users(id,email,raw_user_meta_data) values
  ('$DRIVER_AUTH','driver-passenger-phase@example.test','{"role":"driver","name":"Driver Phase 6"}'::jsonb),
  ('$PASSENGER_AUTH','passenger-phase@example.test','{"role":"passenger","name":"Passenger Phase 6","terms_accepted":"true","privacy_accepted":"true","terms_version":"ci","privacy_version":"ci","legal_acceptance_source":"passenger_signup"}'::jsonb);

insert into public.drivers(user_id,name,phone,category,vehicle_model,vehicle_plate,vehicle_color,approval_status,subscription_status,is_online,current_lat,current_lng,last_location_at,documents_status)
select u.id,'Driver Phase 6','87999999999','carros','APOIS Test','ABC1D23','Preto','aprovado','teste',true,-9.3900,-40.5000,now(),'approved'
from public.users u where u.auth_user_id='$DRIVER_AUTH';

insert into public.rides(
  id,passenger_id,driver_id,accepted_driver_id,category,status,origin,destination,origin_name,destination_name,
  origin_lat,origin_lng,destination_lat,destination_lng,estimated_price,final_price,payment_method,request_key,
  security_code,driver_name,driver_phone,driver_vehicle_model,driver_vehicle_color,driver_vehicle_plate,
  driver_latitude,driver_longitude,driver_heading,completed_at
)
select '$FINISHED_RIDE',p.id,d.id,d.id,'carros','finalizada',
  '{"lat":-9.3900,"lng":-40.5000}'::jsonb,'{"lat":-9.4000,"lng":-40.4900}'::jsonb,
  'Origem final','Destino final',-9.3900,-40.5000,-9.4000,-40.4900,30.00,28.00,'pix',
  '96000000-0000-4000-8000-000000000001','4321','Driver Phase 6','87999999999','APOIS Test','Preto','ABC1D23',
  -9.4000,-40.4900,90,now()
from public.users p, public.drivers d
where p.auth_user_id='$PASSENGER_AUTH' and d.user_id=(select id from public.users where auth_user_id='$DRIVER_AUTH');

insert into public.ride_settlements(
  ride_id,passenger_id,driver_id,gross_amount_cents,discount_amount_cents,passenger_charge_cents,
  platform_fee_cents,driver_earning_cents,payment_provider_fee_cents,payment_method,payment_status,status,settled_at
)
select r.id,r.passenger_id,r.driver_id,3000,200,2800,0,2800,85,'pix','paid','settled',now()
from public.rides r where r.id='$FINISHED_RIDE';

insert into public.rides(
  id,passenger_id,driver_id,accepted_driver_id,category,status,origin,destination,origin_name,destination_name,
  origin_lat,origin_lng,destination_lat,destination_lng,estimated_price,payment_method,request_key,
  security_code,driver_name,driver_phone,driver_vehicle_model,driver_vehicle_color,driver_vehicle_plate,
  driver_latitude,driver_longitude,driver_heading
)
select '$ACTIVE_RIDE',p.id,d.id,d.id,'carros','em_viagem',
  '{"lat":-9.3900,"lng":-40.5000}'::jsonb,'{"lat":-9.4100,"lng":-40.4800}'::jsonb,
  'Origem ativa','Destino ativo',-9.3900,-40.5000,-9.4100,-40.4800,22.00,'cash',
  '96000000-0000-4000-8000-000000000002','9876','Driver Phase 6','87999999999','APOIS Test','Preto','ABC1D23',
  -9.3950,-40.4950,45
from public.users p, public.drivers d
where p.auth_user_id='$PASSENGER_AUTH' and d.user_id=(select id from public.users where auth_user_id='$DRIVER_AUTH');
SQL

# Passenger -> Driver rating is authorized, one-shot and distinct from Driver -> Passenger rating.
psql -v ON_ERROR_STOP=1 <<SQL
begin;
set local "request.jwt.claim.sub"='$PASSENGER_AUTH';
select public.rate_passenger_ride('$FINISHED_RIDE',5,'Ótima corrida');
commit;
SQL
RATING=$(psql -Atqc "select passenger_driver_rating from public.rides where id='$FINISHED_RIDE'")
DRIVER_AVG=$(psql -Atqc "select rating from public.drivers d join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
[[ "$RATING" == "5.0" && "$DRIVER_AVG" == "5.00" ]] || { echo "Passenger -> Driver rating failed"; exit 1; }

set +e
DUPLICATE_OUTPUT=$(psql -v ON_ERROR_STOP=1 -Atqc "begin; set local \"request.jwt.claim.sub\"='$PASSENGER_AUTH'; select public.rate_passenger_ride('$FINISHED_RIDE',4,null); commit;" 2>&1)
DUPLICATE_CODE=$?
set -e
[[ $DUPLICATE_CODE -ne 0 && "$DUPLICATE_OUTPUT" == *"ride_already_rated"* ]] || { echo "Duplicate rating was not blocked"; exit 1; }

# Share token is random UUID, expires, can be read anonymously and does not leak PIN/phone/ride id.
SHARE_JSON=$(psql -Atqc "begin; set local \"request.jwt.claim.sub\"='$PASSENGER_AUTH'; select public.passenger_create_or_refresh_share('$ACTIVE_RIDE',60); commit;")
TOKEN=$(psql -Atqc "select share_token from public.rides where id='$ACTIVE_RIDE'")
[[ -n "$TOKEN" ]] || { echo "Share token was not created"; exit 1; }
PUBLIC_JSON=$(psql -Atqc "begin; set local role anon; select public.get_shared_passenger_ride('$TOKEN'); commit;")
[[ "$PUBLIC_JSON" == *'"ok": true'* || "$PUBLIC_JSON" == *'"ok":true'* ]] || { echo "Anonymous share lookup failed"; exit 1; }
[[ "$PUBLIC_JSON" != *"9876"* && "$PUBLIC_JSON" != *"87999999999"* && "$PUBLIC_JSON" != *"$ACTIVE_RIDE"* ]] || { echo "Shared ride leaked sensitive data"; exit 1; }

psql -v ON_ERROR_STOP=1 <<SQL
begin;
set local "request.jwt.claim.sub"='$PASSENGER_AUTH';
select public.passenger_revoke_share('$ACTIVE_RIDE');
commit;
SQL
REVOKED=$(psql -Atqc "begin; set local role anon; select public.get_shared_passenger_ride('$TOKEN')->>'ok'; commit;")
[[ "$REVOKED" == "f" || "$REVOKED" == "false" ]] || { echo "Revoked share token remained valid"; exit 1; }

# SOS is tied to the active ride, current Passenger and location, and creates an operational audit event.
psql -v ON_ERROR_STOP=1 <<SQL
begin;
set local "request.jwt.claim.sub"='$PASSENGER_AUTH';
select public.passenger_trigger_sos('$ACTIVE_RIDE',-9.3950,-40.4950,'critical','Teste CI');
commit;
SQL
SOS_COUNT=$(psql -Atqc "select count(*) from public.sos_alerts where ride_id='$ACTIVE_RIDE' and severity='critical' and status='open'")
SOS_AUDIT=$(psql -Atqc "select count(*) from public.audit_logs where action='sos.triggered' and entity_type='sos_alert'")
[[ "$SOS_COUNT" == "1" && "$SOS_AUDIT" == "1" ]] || { echo "SOS operational event missing"; exit 1; }

# Receipt comes from canonical settlement, not frontend ride arithmetic.
RECEIPT=$(psql -Atqc "begin; set local \"request.jwt.claim.sub\"='$PASSENGER_AUTH'; select public.get_passenger_ride_receipt('$FINISHED_RIDE'); commit;")
[[ "$RECEIPT" == *'"total_amount_cents": 2800'* || "$RECEIPT" == *'"total_amount_cents":2800'* ]] || { echo "Receipt total does not come from settlement"; exit 1; }
[[ "$RECEIPT" == *'"discount_amount_cents": 200'* || "$RECEIPT" == *'"discount_amount_cents":200'* ]] || { echo "Receipt discount missing"; exit 1; }
[[ "$RECEIPT" == *'"provider_fee_cents": 85'* || "$RECEIPT" == *'"provider_fee_cents":85'* ]] || { echo "Receipt provider fee missing"; exit 1; }

# Payment methods are server-truthed. Electronic methods stay disabled until a provider is configured.
PAYMENTS_NO_PROVIDER=$(psql -Atqc "begin; set local \"request.jwt.claim.sub\"='$PASSENGER_AUTH'; select public.get_passenger_payment_methods(); commit;")
PIX_DISABLED=$(printf '%s' "$PAYMENTS_NO_PROVIDER" | psql -Atqc "select coalesce((('$PAYMENTS_NO_PROVIDER'::jsonb)->'methods' @> '[{\"code\":\"pix\",\"enabled\":false}]'::jsonb),false)::int")
CREDIT_DISABLED=$(printf '%s' "$PAYMENTS_NO_PROVIDER" | psql -Atqc "select coalesce((('$PAYMENTS_NO_PROVIDER'::jsonb)->'methods' @> '[{\"code\":\"credit\",\"enabled\":false}]'::jsonb),false)::int")
DEBIT_DISABLED=$(printf '%s' "$PAYMENTS_NO_PROVIDER" | psql -Atqc "select coalesce((('$PAYMENTS_NO_PROVIDER'::jsonb)->'methods' @> '[{\"code\":\"debit\",\"enabled\":false}]'::jsonb),false)::int")
CASH_ENABLED=$(printf '%s' "$PAYMENTS_NO_PROVIDER" | psql -Atqc "select coalesce((('$PAYMENTS_NO_PROVIDER'::jsonb)->'methods' @> '[{\"code\":\"cash\",\"enabled\":true}]'::jsonb),false)::int")
WALLET_ENABLED=$(printf '%s' "$PAYMENTS_NO_PROVIDER" | psql -Atqc "select coalesce((('$PAYMENTS_NO_PROVIDER'::jsonb)->'methods' @> '[{\"code\":\"wallet\",\"enabled\":true}]'::jsonb),false)::int")
[[ "$PIX_DISABLED" == "1" && "$CREDIT_DISABLED" == "1" && "$DEBIT_DISABLED" == "1" && "$CASH_ENABLED" == "1" && "$WALLET_ENABLED" == "1" ]] || { echo "Electronic payment methods were exposed without a provider"; exit 1; }

psql -v ON_ERROR_STOP=1 -c "update public.app_settings set value=to_jsonb('test_provider'::text),updated_at=now() where key='finance.electronic_payment_provider';"
PAYMENTS_WITH_PROVIDER=$(psql -Atqc "begin; set local \"request.jwt.claim.sub\"='$PASSENGER_AUTH'; select public.get_passenger_payment_methods(); commit;")
PIX_ENABLED=$(psql -Atqc "select coalesce((('$PAYMENTS_WITH_PROVIDER'::jsonb)->'methods' @> '[{\"code\":\"pix\",\"enabled\":true}]'::jsonb),false)::int")
CREDIT_ENABLED=$(psql -Atqc "select coalesce((('$PAYMENTS_WITH_PROVIDER'::jsonb)->'methods' @> '[{\"code\":\"credit\",\"enabled\":true}]'::jsonb),false)::int")
DEBIT_ENABLED=$(psql -Atqc "select coalesce((('$PAYMENTS_WITH_PROVIDER'::jsonb)->'methods' @> '[{\"code\":\"debit\",\"enabled\":true}]'::jsonb),false)::int")
[[ "$PIX_ENABLED" == "1" && "$CREDIT_ENABLED" == "1" && "$DEBIT_ENABLED" == "1" ]] || { echo "Electronic payment methods did not enable after provider configuration"; exit 1; }

echo "APOIS_PASSENGER_EXPERIENCE_OK"
