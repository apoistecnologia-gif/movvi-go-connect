#!/usr/bin/env bash
set -euo pipefail

DRIVER_AUTH="41000000-0000-4000-8000-000000000001"
PASSENGER_AUTH="41000000-0000-4000-8000-000000000002"
ADMIN_AUTH="41000000-0000-4000-8000-000000000003"
RIDE_ID="41000000-0000-4000-8000-000000000101"
REQUEST_KEY="41000000-0000-4000-8000-000000000102"
PIN="2468"

psql -v ON_ERROR_STOP=1 <<SQL
insert into auth.users(id,email,raw_user_meta_data) values
  ('$DRIVER_AUTH','e2e-driver@example.test','{"role":"driver","name":"E2E Driver"}'::jsonb),
  ('$PASSENGER_AUTH','e2e-passenger@example.test','{"role":"passenger","name":"E2E Passenger","terms_accepted":"true","privacy_accepted":"true","terms_version":"ci","privacy_version":"ci","legal_acceptance_source":"passenger_signup"}'::jsonb),
  ('$ADMIN_AUTH','e2e-admin@example.test','{"name":"E2E Admin"}'::jsonb);

update public.profiles set role='administrator',active=true where user_id='$ADMIN_AUTH';

insert into public.drivers(
  user_id,name,email,phone,category,vehicle_model,vehicle_plate,vehicle_color,
  approval_status,subscription_status,is_online,documents_status,current_lat,current_lng,last_location_at
)
select u.id,'E2E Driver','e2e-driver@example.test','87999999999','carros','APOIS E2E','E2E1A23','Preto',
  'aprovado','teste',true,'approved',-9.3900,-40.5000,now()
from public.users u where u.auth_user_id='$DRIVER_AUTH';

insert into public.rides(
  id,passenger_id,category,status,origin,destination,origin_name,destination_name,
  origin_lat,origin_lng,destination_lat,destination_lng,estimated_price,payment_method,request_key,
  offered_driver_ids,candidate_driver_ids,rejected_driver_ids,security_code,request_expires_at,search_expires_at
)
select
  '$RIDE_ID',p.id,'carros','procurar_motorista',
  '{"lat":-9.391,"lng":-40.501,"label":"Origem E2E"}'::jsonb,
  '{"lat":-9.405,"lng":-40.486,"label":"Destino E2E"}'::jsonb,
  'Origem E2E','Destino E2E',-9.391,-40.501,-9.405,-40.486,
  32.50,'cash','$REQUEST_KEY',
  array[d.user_id]::uuid[],array[d.user_id]::uuid[],'{}'::uuid[],'$PIN',now()+interval '2 minutes',now()+interval '3 minutes'
from public.users p, public.drivers d
where p.auth_user_id='$PASSENGER_AUTH'
  and d.user_id=(select id from public.users where auth_user_id='$DRIVER_AUTH');
SQL

# Driver E2E: offer -> accept -> arrive -> PIN -> start -> finish -> cash confirmation.
psql -v ON_ERROR_STOP=1 <<SQL
begin;
set local "request.jwt.claim.sub"='$DRIVER_AUTH';
select public.driver_accept_ride('$RIDE_ID');
select public.driver_mark_arrived('$RIDE_ID');
select public.driver_start_ride('$RIDE_ID','$PIN');
select public.driver_finish_ride('$RIDE_ID');
select public.driver_confirm_cash_payment('$RIDE_ID');
select public.driver_rate_passenger('$RIDE_ID',5,'Passageiro E2E');
commit;
SQL

# Passenger closes the two-sided rating loop and reads the server-side receipt.
PASSENGER_RESULT=$(psql -Atq -v ON_ERROR_STOP=1 <<SQL
begin;
set local "request.jwt.claim.sub"='$PASSENGER_AUTH';
select public.rate_passenger_ride('$RIDE_ID',5,'Motorista E2E');
select public.get_passenger_ride_receipt('$RIDE_ID');
commit;
SQL
)
[[ "$PASSENGER_RESULT" == *'"total_amount_cents": 3250'* || "$PASSENGER_RESULT" == *'"total_amount_cents":3250'* ]] || {
  echo "Passenger receipt did not expose the settled server amount"
  echo "$PASSENGER_RESULT"
  exit 1
}

RIDE_STATE=$(psql -Atqc "select status||':'||coalesce(passenger_rating::text,'')||':'||coalesce(passenger_driver_rating::text,'') from public.rides where id='$RIDE_ID'")
[[ "$RIDE_STATE" == "finalizada:5.0:5.0" ]] || { echo "Unexpected final ride/rating state: $RIDE_STATE"; exit 1; }

SETTLEMENT=$(psql -Atqc "select passenger_charge_cents||':'||driver_earning_cents||':'||platform_fee_cents||':'||payment_status||':'||status||':'||cash_amount_cents from public.ride_settlements where ride_id='$RIDE_ID'")
[[ "$SETTLEMENT" == "3250:3250:0:paid:settled:3250" ]] || { echo "Settlement invariant failed: $SETTLEMENT"; exit 1; }

DRIVER_LEDGER=$(psql -Atqc "select count(*) from public.driver_ledger_entries where ride_id='$RIDE_ID' and entry_type='ride_earning' and direction='credit' and amount_cents=3250")
[[ "$DRIVER_LEDGER" == "1" ]] || { echo "Driver ledger entry missing"; exit 1; }

# Cash is collected directly by the Driver: it is ledgered, not duplicated into the electronic wallet.
DRIVER_WALLET=$(psql -Atqc "select round(coalesce(dw.balance,0)*100)::bigint from public.drivers d left join public.driver_wallets dw on dw.driver_id=d.id join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH'")
[[ "${DRIVER_WALLET:-0}" == "0" ]] || { echo "Cash ride was incorrectly duplicated into Driver wallet: $DRIVER_WALLET"; exit 1; }

# Admin E2E: authorized account can supervise the completed ride and finance truth.
ADMIN_RESULT=$(psql -Atq -v ON_ERROR_STOP=1 <<SQL
begin;
set local "request.jwt.claim.sub"='$ADMIN_AUTH';
select public.admin_is_authorized();
select public.admin_get_dashboard_metrics();
select public.admin_get_finance_summary(now()-interval '1 day',now()+interval '1 day');
commit;
SQL
)
[[ "$ADMIN_RESULT" == *"t"* ]] || { echo "Admin authorization failed"; exit 1; }
[[ "$ADMIN_RESULT" == *'"completed_today": 1'* || "$ADMIN_RESULT" == *'"completed_today":1'* ]] || { echo "Admin dashboard did not observe completed ride"; exit 1; }
[[ "$ADMIN_RESULT" == *'"gmv_cents": 3250'* || "$ADMIN_RESULT" == *'"gmv_cents":3250'* ]] || { echo "Admin finance did not observe settlement GMV"; exit 1; }

AUDIT_ACCEPT=$(psql -Atqc "select count(*) from public.audit_logs where entity_id='$RIDE_ID' and action='ride.driver.accepted'")
AUDIT_FINISH=$(psql -Atqc "select count(*) from public.audit_logs where entity_id='$RIDE_ID' and action='ride.finished'")
[[ "$AUDIT_ACCEPT" == "1" && "$AUDIT_FINISH" == "1" ]] || { echo "Ride lifecycle audit incomplete"; exit 1; }

echo "APOIS_E2E_DRIVER_FINANCE_ADMIN_OK"
