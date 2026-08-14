#!/usr/bin/env bash
set -euo pipefail

PASSENGER_A_AUTH="52000000-0000-4000-8000-000000000001"
PASSENGER_B_AUTH="52000000-0000-4000-8000-000000000002"
DRIVER_A_AUTH="52000000-0000-4000-8000-000000000003"
DRIVER_B_AUTH="52000000-0000-4000-8000-000000000004"
ADMIN_AUTH="52000000-0000-4000-8000-000000000005"
RIDE_A="52000000-0000-4000-8000-000000000101"
RIDE_B="52000000-0000-4000-8000-000000000102"
REQUEST_A="52000000-0000-4000-8000-000000000201"
REQUEST_B="52000000-0000-4000-8000-000000000202"

psql -v ON_ERROR_STOP=1 <<SQL
insert into auth.users(id,email,raw_user_meta_data) values
  ('$PASSENGER_A_AUTH','sos-passenger-a@example.test','{"role":"passenger","name":"Passenger SOS A","terms_accepted":"true","privacy_accepted":"true","terms_version":"ci","privacy_version":"ci","legal_acceptance_source":"passenger_signup"}'::jsonb),
  ('$PASSENGER_B_AUTH','sos-passenger-b@example.test','{"role":"passenger","name":"Passenger SOS B","terms_accepted":"true","privacy_accepted":"true","terms_version":"ci","privacy_version":"ci","legal_acceptance_source":"passenger_signup"}'::jsonb),
  ('$DRIVER_A_AUTH','sos-driver-a@example.test','{"role":"driver","name":"Driver SOS A"}'::jsonb),
  ('$DRIVER_B_AUTH','sos-driver-b@example.test','{"role":"driver","name":"Driver SOS B"}'::jsonb),
  ('$ADMIN_AUTH','sos-admin@example.test','{"name":"Admin SOS"}'::jsonb);

update public.profiles set role='administrator'::public.app_role, active=true where user_id='$ADMIN_AUTH';

insert into public.drivers(user_id,name,category,approval_status,subscription_status,is_online,documents_status,cnh_url,cnh_back_url,vehicle_document_url,selfie_url,vehicle_model,vehicle_plate,vehicle_color)
select id,'Driver SOS A','carros','aprovado','teste',true,'approved','private/a-cnh','private/a-cnh-back','private/a-crlv','private/a-selfie','Onix','SOS1A23','Preto'
from public.users where auth_user_id='$DRIVER_A_AUTH';

insert into public.drivers(user_id,name,category,approval_status,subscription_status,is_online,documents_status,cnh_url,cnh_back_url,vehicle_document_url,selfie_url,vehicle_model,vehicle_plate,vehicle_color)
select id,'Driver SOS B','carros','aprovado','teste',true,'approved','private/b-cnh','private/b-cnh-back','private/b-crlv','private/b-selfie','HB20','SOS4B56','Branco'
from public.users where auth_user_id='$DRIVER_B_AUTH';

insert into public.rides(
  id,passenger_id,driver_id,accepted_driver_id,category,status,
  origin,destination,origin_name,destination_name,
  origin_lat,origin_lng,destination_lat,destination_lng,
  estimated_price,payment_method,request_key,accepted_at
)
select
  '$RIDE_A',p.id,d.id,d.id,'carros','motorista_a_caminho',
  '{"lat":-9.39,"lng":-40.50}'::jsonb,'{"lat":-9.40,"lng":-40.49}'::jsonb,
  'Origem SOS A','Destino SOS A',-9.39,-40.50,-9.40,-40.49,
  25.00,'cash','$REQUEST_A',now()
from public.users p, public.drivers d
where p.auth_user_id='$PASSENGER_A_AUTH'
  and d.user_id=(select id from public.users where auth_user_id='$DRIVER_A_AUTH');

insert into public.rides(
  id,passenger_id,category,status,
  origin,destination,origin_name,destination_name,
  origin_lat,origin_lng,destination_lat,destination_lng,
  estimated_price,payment_method,request_key
)
select
  '$RIDE_B',p.id,'carros','procurar_motorista',
  '{"lat":-9.41,"lng":-40.51}'::jsonb,'{"lat":-9.42,"lng":-40.48}'::jsonb,
  'Origem SOS B','Destino SOS B',-9.41,-40.51,-9.42,-40.48,
  22.00,'cash','$REQUEST_B'
from public.users p
where p.auth_user_id='$PASSENGER_B_AUTH';
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

expect_auth_failure() {
  local auth_id="$1"
  local sql="$2"
  local expected="$3"
  set +e
  local output
  output=$(query_as_auth "$auth_id" "$sql" 2>&1)
  local code=$?
  set -e
  [[ $code -ne 0 && "$output" == *"$expected"* ]] || {
    echo "Expected failure '$expected' did not occur"
    echo "$output"
    exit 1
  }
}

# 1,2,4,11,17 — authenticated driver creates its own critical SOS; identity,
# active ride and audit are resolved server-side.
DRIVER_A_JSON=$(query_as_auth "$DRIVER_A_AUTH" "select public.create_driver_sos(-9.3901,-40.5001,'critical','driver critical');")
[[ "$DRIVER_A_JSON" == *'"ok": true'* || "$DRIVER_A_JSON" == *'"ok":true'* ]] || { echo "Driver SOS was not created"; exit 1; }
[[ "$DRIVER_A_JSON" == *"$RIDE_A"* ]] || { echo "Driver active ride was not associated"; exit 1; }
DRIVER_A_ID=$(psql -Atq -v ON_ERROR_STOP=1 -c "select d.id from public.drivers d join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_A_AUTH';")
[[ "$DRIVER_A_JSON" == *"$DRIVER_A_ID"* ]] || { echo "Driver identity was not resolved server-side"; exit 1; }

# Persist one alert in a transaction committed only to the ephemeral test DB so
# subsequent Admin/RLS assertions can inspect it.
DRIVER_ALERT_ID=$(psql -Atq -v ON_ERROR_STOP=1 <<SQL
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='$DRIVER_A_AUTH';
select (public.create_driver_sos(-9.3902,-40.5002,'high','driver high')->>'alert_id');
commit;
SQL
)
[[ -n "$DRIVER_ALERT_ID" ]] || { echo "Driver high SOS missing"; exit 1; }
AUDIT_COUNT=$(psql -Atq -v ON_ERROR_STOP=1 -c "select count(*) from public.audit_logs where action='sos.driver.created' and metadata->>'sos_alert_id'='$DRIVER_ALERT_ID';")
[[ "$AUDIT_COUNT" == "1" ]] || { echo "Driver SOS audit log missing"; exit 1; }

# 3 — the public RPC has no driver/user identity parameter and direct client
# INSERT is blocked by RLS, so a driver cannot spoof another driver.
RPC_IDENTITY_ARGS=$(psql -Atq -v ON_ERROR_STOP=1 -c "select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_driver_sos';")
[[ "$RPC_IDENTITY_ARGS" != *"driver"* && "$RPC_IDENTITY_ARGS" != *"user"* ]] || { echo "Driver SOS RPC exposes identity parameter"; exit 1; }
expect_auth_failure "$DRIVER_A_AUTH" "insert into public.sos_alerts(user_id,driver_id,severity,status) values ((select id from public.users where auth_user_id='$DRIVER_B_AUTH'),(select d.id from public.drivers d join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_B_AUTH'),'critical','open');" "row-level security"

# 5,12 — driver without active ride can still create SOS.
DRIVER_B_JSON=$(query_as_auth "$DRIVER_B_AUTH" "select public.create_driver_sos(-9.40,-40.51,'high','driver no ride');")
[[ "$DRIVER_B_JSON" == *'"ok": true'* || "$DRIVER_B_JSON" == *'"ok":true'* ]] || { echo "Driver without ride could not create SOS"; exit 1; }
[[ "$DRIVER_B_JSON" == *'"ride_id": null'* || "$DRIVER_B_JSON" == *'"ride_id":null'* ]] || { echo "Driver without ride received an unexpected ride_id"; exit 1; }

# 6,7 — passenger keeps canonical create_passenger_sos and cannot use another passenger's ride.
PASSENGER_JSON=$(query_as_auth "$PASSENGER_A_AUTH" "select public.create_passenger_sos('$RIDE_A',-9.39,-40.50,'security','passenger security');")
[[ "$PASSENGER_JSON" == *'"ok": true'* || "$PASSENGER_JSON" == *'"ok":true'* ]] || { echo "Passenger canonical SOS failed"; exit 1; }
expect_auth_failure "$PASSENGER_A_AUTH" "select public.create_passenger_sos('$RIDE_B',-9.39,-40.50,'critical','alien ride');" "ride_not_found"

# 8,9,10,15,16 — invalid coordinates/severity are rejected.
expect_auth_failure "$DRIVER_A_AUTH" "select public.create_driver_sos(91,-40.50,'critical','bad lat');" "invalid_sos_location"
expect_auth_failure "$DRIVER_A_AUTH" "select public.create_driver_sos(-9.39,181,'critical','bad lng');" "invalid_sos_location"
expect_auth_failure "$DRIVER_A_AUTH" "select public.create_driver_sos(-9.39,-40.50,'invalid','bad severity');" "invalid_sos_severity"
expect_auth_failure "$DRIVER_A_AUTH" "select public.create_driver_sos(-9.39,-40.50,'low','low');" "invalid_sos_severity"
expect_auth_failure "$DRIVER_A_AUTH" "select public.create_driver_sos(-9.39,-40.50,'medium','medium');" "invalid_sos_severity"

# 13,14 — remaining canonical severity values work.
for severity in medical security; do
  RESULT=$(query_as_auth "$DRIVER_B_AUTH" "select public.create_driver_sos(-9.40,-40.51,'$severity','driver $severity');")
  [[ "$RESULT" == *"$severity"* ]] || { echo "Severity $severity failed"; exit 1; }
done

# 18 — operations.read administrator can query active SOS.
ADMIN_VISIBLE=$(query_as_auth "$ADMIN_AUTH" "select count(*) from public.sos_alerts where id='$DRIVER_ALERT_ID';")
[[ "$ADMIN_VISIBLE" == "1" ]] || { echo "operations.read Admin cannot query SOS"; exit 1; }

# 19 — operations.manage can assume and resolve through the canonical control plane.
ACK=$(query_as_auth "$ADMIN_AUTH" "select public.admin_update_sos_alert('$DRIVER_ALERT_ID','acknowledged');")
[[ "$ACK" == *"acknowledged"* ]] || { echo "Admin could not acknowledge SOS"; exit 1; }
RESOLVED=$(query_as_auth "$ADMIN_AUTH" "select public.admin_update_sos_alert('$DRIVER_ALERT_ID','resolved');")
[[ "$RESOLVED" == *"resolved"* ]] || { echo "Admin could not resolve SOS"; exit 1; }

# 20 — ordinary user cannot alter SOS status directly or through Admin RPC.
expect_auth_failure "$PASSENGER_A_AUTH" "update public.sos_alerts set status='resolved' where id='$DRIVER_ALERT_ID';" "row-level security"
expect_auth_failure "$PASSENGER_A_AUTH" "select public.admin_update_sos_alert('$DRIVER_ALERT_ID','resolved');" "forbidden"

# 21,22 — UI contract distinguishes actors by driver_id and renders explicit labels.
grep -Fq 'alert.driver_id !== null' src/routes/admin.operacoes.tsx
grep -Fq '"MOTORISTA"' src/routes/admin.operacoes.tsx
grep -Fq '"PASSAGEIRO"' src/routes/admin.operacoes.tsx

# Frontend canonical contract checks: no direct SOS insert in Driver/Admin tree;
# Passenger repository is checked separately by its own validation workflow.
! grep -R --line-number --fixed-strings '.from("sos_alerts").insert' src

echo "APOIS_SOS_SECURITY_OK"
