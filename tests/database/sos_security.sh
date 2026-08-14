#!/usr/bin/env bash
set -euo pipefail

PASSENGER_A_AUTH="52000000-0000-4000-8000-000000000001"
PASSENGER_B_AUTH="52000000-0000-4000-8000-000000000002"
DRIVER_A_AUTH="52000000-0000-4000-8000-000000000003"
DRIVER_B_AUTH="52000000-0000-4000-8000-000000000004"
ADMIN_AUTH="52000000-0000-4000-8000-000000000005"
RIDE_A="52000000-0000-4000-8000-000000000101"
RIDE_B="52000000-0000-4000-8000-000000000102"

psql -v ON_ERROR_STOP=1 <<SQL
insert into auth.users(id,email,raw_user_meta_data) values
('$PASSENGER_A_AUTH','sos-pa@example.test','{"role":"passenger","name":"Passenger A","terms_accepted":"true","privacy_accepted":"true","terms_version":"ci","privacy_version":"ci","legal_acceptance_source":"passenger_signup"}'::jsonb),
('$PASSENGER_B_AUTH','sos-pb@example.test','{"role":"passenger","name":"Passenger B","terms_accepted":"true","privacy_accepted":"true","terms_version":"ci","privacy_version":"ci","legal_acceptance_source":"passenger_signup"}'::jsonb),
('$DRIVER_A_AUTH','sos-da@example.test','{"role":"driver","name":"Driver A"}'::jsonb),
('$DRIVER_B_AUTH','sos-db@example.test','{"role":"driver","name":"Driver B"}'::jsonb),
('$ADMIN_AUTH','sos-admin@example.test','{"name":"Admin SOS"}'::jsonb);
update public.profiles set role='administrator'::public.app_role,active=true where user_id='$ADMIN_AUTH';
insert into public.drivers(user_id,name,category,approval_status,subscription_status,is_online,documents_status,cnh_url,cnh_back_url,vehicle_document_url,selfie_url,vehicle_model,vehicle_plate,vehicle_color)
select id,'Driver A','carros','aprovado','teste',true,'approved','a','ab','ac','ad','Onix','SOS1A23','Preto' from public.users where auth_user_id='$DRIVER_A_AUTH';
insert into public.drivers(user_id,name,category,approval_status,subscription_status,is_online,documents_status,cnh_url,cnh_back_url,vehicle_document_url,selfie_url,vehicle_model,vehicle_plate,vehicle_color)
select id,'Driver B','carros','aprovado','teste',true,'approved','b','bb','bc','bd','HB20','SOS4B56','Branco' from public.users where auth_user_id='$DRIVER_B_AUTH';
insert into public.rides(id,passenger_id,driver_id,accepted_driver_id,category,status,origin,destination,origin_name,destination_name,origin_lat,origin_lng,destination_lat,destination_lng,estimated_price,payment_method,request_key,accepted_at)
select '$RIDE_A',p.id,d.id,d.id,'carros','motorista_a_caminho','{"lat":-9.39,"lng":-40.50}'::jsonb,'{"lat":-9.40,"lng":-40.49}'::jsonb,'Origem A','Destino A',-9.39,-40.50,-9.40,-40.49,25,'cash','52000000-0000-4000-8000-000000000201',now() from public.users p,public.drivers d where p.auth_user_id='$PASSENGER_A_AUTH' and d.user_id=(select id from public.users where auth_user_id='$DRIVER_A_AUTH');
insert into public.rides(id,passenger_id,category,status,origin,destination,origin_name,destination_name,origin_lat,origin_lng,destination_lat,destination_lng,estimated_price,payment_method,request_key)
select '$RIDE_B',p.id,'carros','procurar_motorista','{"lat":-9.41,"lng":-40.51}'::jsonb,'{"lat":-9.42,"lng":-40.48}'::jsonb,'Origem B','Destino B',-9.41,-40.51,-9.42,-40.48,22,'cash','52000000-0000-4000-8000-000000000202' from public.users p where p.auth_user_id='$PASSENGER_B_AUTH';
SQL

query_as_auth(){ local id="$1"; local sql="$2"; psql -Atq -v ON_ERROR_STOP=1 <<SQL
begin; set local role authenticated; set local "request.jwt.claim.sub"='$id'; $sql rollback;
SQL
}
expect_failure(){ local id="$1"; local sql="$2"; local expected="$3"; set +e; local out; out=$(query_as_auth "$id" "$sql" 2>&1); local rc=$?; set -e; [[ $rc -ne 0 && "$out" == *"$expected"* ]] || { echo "expected '$expected': $out"; exit 1; }; }

# 1,2,4,11,17: own Driver SOS, server identity, active ride, critical and audit.
A=$(query_as_auth "$DRIVER_A_AUTH" "select public.create_driver_sos(-9.39,-40.50,'critical','driver critical');")
DID=$(psql -Atq -c "select d.id from public.drivers d join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_A_AUTH';")
[[ "$A" == *'"ok": true'* || "$A" == *'"ok":true'* ]]; [[ "$A" == *"$DID"* ]]; [[ "$A" == *"$RIDE_A"* ]]; [[ "$A" == *"critical"* ]]
ALERT=$(psql -Atq -v ON_ERROR_STOP=1 <<SQL
begin; set local role authenticated; set local "request.jwt.claim.sub"='$DRIVER_A_AUTH'; select public.create_driver_sos(-9.3902,-40.5002,'high','driver high')->>'alert_id'; commit;
SQL
)
[[ $(psql -Atq -c "select count(*) from public.audit_logs where actor_id='$DRIVER_A_AUTH' and action='sos.driver.created' and metadata->>'sos_alert_id'='$ALERT';") == "1" ]]

# 3: no spoofable identity args and no direct client INSERT.
ARGS=$(psql -Atq -c "select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_driver_sos';")
[[ "$ARGS" != *driver* && "$ARGS" != *user* ]]
expect_failure "$DRIVER_A_AUTH" "insert into public.sos_alerts(user_id,severity,status) values ((select id from public.users where auth_user_id='$DRIVER_B_AUTH'),'critical','open');" "permission denied"

# 5,12,13,14: Driver without ride and all remaining valid severities.
B=$(query_as_auth "$DRIVER_B_AUTH" "select public.create_driver_sos(-9.40,-40.51,'high','no ride');")
[[ "$B" == *'"ride_id": null'* || "$B" == *'"ride_id":null'* ]]; [[ "$B" == *high* ]]
for s in medical security; do R=$(query_as_auth "$DRIVER_B_AUTH" "select public.create_driver_sos(-9.40,-40.51,'$s','$s');"); [[ "$R" == *"$s"* ]]; done

# 6,7: Passenger canonical RPC works only for own active ride.
P=$(query_as_auth "$PASSENGER_A_AUTH" "select public.create_passenger_sos('$RIDE_A',-9.39,-40.50,'security','passenger');")
[[ "$P" == *'"ok": true'* || "$P" == *'"ok":true'* ]]
expect_failure "$PASSENGER_A_AUTH" "select public.create_passenger_sos('$RIDE_B',-9.39,-40.50,'critical','alien');" "ride_not_found"

# 8,9,10,15,16: invalid coordinates/severity fail; low/medium stay invalid.
expect_failure "$DRIVER_A_AUTH" "select public.create_driver_sos(91,-40.5,'critical','bad');" "invalid_sos_location"
expect_failure "$DRIVER_A_AUTH" "select public.create_driver_sos(-9.39,181,'critical','bad');" "invalid_sos_location"
for s in invalid low medium; do expect_failure "$DRIVER_A_AUTH" "select public.create_driver_sos(-9.39,-40.5,'$s','bad');" "invalid_sos_severity"; done

# 18,19: operations.read + operations.manage can inspect, acknowledge and resolve.
[[ $(query_as_auth "$ADMIN_AUTH" "select count(*) from public.sos_alerts where id='$ALERT';") == "1" ]]
ACK=$(query_as_auth "$ADMIN_AUTH" "select public.admin_update_sos_alert('$ALERT','acknowledged');"); [[ "$ACK" == *acknowledged* ]]
RES=$(query_as_auth "$ADMIN_AUTH" "select public.admin_update_sos_alert('$ALERT','resolved');"); [[ "$RES" == *resolved* ]]

# 20: ordinary user has no direct mutation privilege and no Admin mutation permission.
expect_failure "$PASSENGER_A_AUTH" "update public.sos_alerts set status='resolved' where id='$ALERT';" "permission denied"
expect_failure "$PASSENGER_A_AUTH" "select public.admin_update_sos_alert('$ALERT','resolved');" "forbidden"

# 21,22 + frontend contract: explicit actor split and no direct Driver/Admin SOS INSERT.
grep -Fq 'alert.driver_id !== null' src/routes/admin.operacoes.tsx
grep -Fq '"MOTORISTA"' src/routes/admin.operacoes.tsx
grep -Fq '"PASSAGEIRO"' src/routes/admin.operacoes.tsx
! grep -R --line-number --fixed-strings '.from("sos_alerts").insert' src

echo APOIS_SOS_SECURITY_OK
