#!/usr/bin/env bash
set -euo pipefail

RIDE_ID="90000000-0000-4000-8000-000000000001"
DRIVER_AUTH_A="10000000-0000-4000-8000-000000000001"
DRIVER_AUTH_B="10000000-0000-4000-8000-000000000002"
PASSENGER_AUTH="10000000-0000-4000-8000-000000000003"

psql -v ON_ERROR_STOP=1 <<SQL
insert into auth.users(id,email,raw_user_meta_data) values
  ('$DRIVER_AUTH_A','driver-a@example.test','{"role":"driver","name":"Driver A"}'::jsonb),
  ('$DRIVER_AUTH_B','driver-b@example.test','{"role":"driver","name":"Driver B"}'::jsonb),
  ('$PASSENGER_AUTH','passenger@example.test','{"role":"passenger","name":"Passenger"}'::jsonb);

insert into public.drivers(user_id,name,category,approval_status,subscription_status,is_online,current_lat,current_lng,last_location_at,documents_status)
select u.id,'Driver A','carros','aprovado','teste',true,-9.3900,-40.5000,now(),'approved'
from public.users u where u.auth_user_id='$DRIVER_AUTH_A';

insert into public.drivers(user_id,name,category,approval_status,subscription_status,is_online,current_lat,current_lng,last_location_at,documents_status)
select u.id,'Driver B','carros','aprovado','teste',true,-9.3905,-40.5005,now(),'approved'
from public.users u where u.auth_user_id='$DRIVER_AUTH_B';

insert into public.rides(
  id,passenger_id,category,status,origin,destination,origin_name,destination_name,
  origin_lat,origin_lng,destination_lat,destination_lng,estimated_price,payment_method,request_key,
  candidate_driver_ids,offered_driver_ids,rejected_driver_ids,request_expires_at,search_expires_at
)
select
  '$RIDE_ID',p.id,'carros','procurar_motorista',
  '{"lat":-9.391,"lng":-40.501,"label":"Origem"}'::jsonb,
  '{"lat":-9.400,"lng":-40.490,"label":"Destino"}'::jsonb,
  'Origem','Destino',-9.391,-40.501,-9.400,-40.490,20.00,'pix','90000000-0000-4000-8000-000000000002',
  '{}'::uuid[],
  array[
    (select id from public.users where auth_user_id='$DRIVER_AUTH_A'),
    (select id from public.users where auth_user_id='$DRIVER_AUTH_B')
  ]::uuid[],
  '{}'::uuid[],now()+interval '2 minutes',now()+interval '3 minutes'
from public.users p where p.auth_user_id='$PASSENGER_AUTH';
SQL

set +e
(
  psql -v ON_ERROR_STOP=1 <<SQL > /tmp/accept-a.out 2> /tmp/accept-a.err
begin;
set local "request.jwt.claim.sub"='$DRIVER_AUTH_A';
select public.driver_accept_ride('$RIDE_ID');
commit;
SQL
  echo $? > /tmp/accept-a.code
) &
PID_A=$!

(
  psql -v ON_ERROR_STOP=1 <<SQL > /tmp/accept-b.out 2> /tmp/accept-b.err
begin;
set local "request.jwt.claim.sub"='$DRIVER_AUTH_B';
select public.driver_accept_ride('$RIDE_ID');
commit;
SQL
  echo $? > /tmp/accept-b.code
) &
PID_B=$!

wait "$PID_A"
wait "$PID_B"
set -e

CODE_A=$(cat /tmp/accept-a.code)
CODE_B=$(cat /tmp/accept-b.code)

if [[ "$CODE_A" == "0" && "$CODE_B" == "0" ]]; then
  echo "Both Drivers accepted the same ride; atomicity failed."
  cat /tmp/accept-a.out /tmp/accept-b.out
  exit 1
fi

if [[ "$CODE_A" != "0" && "$CODE_B" != "0" ]]; then
  echo "Neither Driver accepted the ride."
  cat /tmp/accept-a.err /tmp/accept-b.err
  exit 1
fi

ASSIGNED=$(psql -Atqc "select count(*) from public.rides where id='$RIDE_ID' and driver_id is not null and accepted_driver_id=driver_id and status='motorista_a_caminho'")
AUDIT=$(psql -Atqc "select count(*) from public.audit_logs where entity_id='$RIDE_ID' and action='ride.driver.accepted'")
OFFER_CLEARED=$(psql -Atqc "select case when cardinality(offered_driver_ids)=0 and cardinality(candidate_driver_ids)=0 then 1 else 0 end from public.rides where id='$RIDE_ID'")

[[ "$ASSIGNED" == "1" ]] || { echo "Ride assignment invariant failed"; exit 1; }
[[ "$AUDIT" == "1" ]] || { echo "Accept audit invariant failed"; exit 1; }
[[ "$OFFER_CLEARED" == "1" ]] || { echo "Other offers were not invalidated"; exit 1; }

echo "APOIS_ATOMIC_ACCEPT_CONCURRENCY_OK winner_a=$([[ "$CODE_A" == "0" ]] && echo yes || echo no) winner_b=$([[ "$CODE_B" == "0" ]] && echo yes || echo no)"
