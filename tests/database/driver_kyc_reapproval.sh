#!/usr/bin/env bash
set -euo pipefail

DRIVER_AUTH="57000000-0000-4000-8000-000000000001"
ADMIN_AUTH="57000000-0000-4000-8000-000000000002"

psql -v ON_ERROR_STOP=1 <<SQL
insert into auth.users(id,email,raw_user_meta_data) values
('$DRIVER_AUTH','kyc-driver@example.test','{"role":"driver","name":"KYC Driver"}'::jsonb),
('$ADMIN_AUTH','kyc-admin@example.test','{"name":"KYC Admin"}'::jsonb);

update public.profiles
set role='administrator'::public.app_role, active=true
where user_id='$ADMIN_AUTH';

insert into public.drivers(
  user_id,name,category,approval_status,subscription_status,is_online,documents_status,
  selfie_url,cnh_url,cnh_back_url,vehicle_document_url,vehicle_photo_url,
  vehicle_model,vehicle_plate,vehicle_color,approved_at
)
select id,'KYC Driver','carros','aprovado','teste',true,'approved',
  '$DRIVER_AUTH/selfie-old.jpg',
  '$DRIVER_AUTH/cnh-front-old.jpg',
  '$DRIVER_AUTH/cnh-back-old.jpg',
  '$DRIVER_AUTH/crlv-old.pdf',
  '$DRIVER_AUTH/vehicle-old.jpg',
  'Onix','KYC1A23','Preto',now()
from public.users where auth_user_id='$DRIVER_AUTH';

insert into storage.objects(bucket_id,name,owner,owner_id) values
('driver-selfies','$DRIVER_AUTH/selfie-old.jpg','$DRIVER_AUTH','$DRIVER_AUTH'),
('driver-cnh','$DRIVER_AUTH/cnh-front-old.jpg','$DRIVER_AUTH','$DRIVER_AUTH'),
('driver-cnh','$DRIVER_AUTH/cnh-back-old.jpg','$DRIVER_AUTH','$DRIVER_AUTH'),
('vehicle-documents','$DRIVER_AUTH/crlv-old.pdf','$DRIVER_AUTH','$DRIVER_AUTH'),
('driver-cnh','$DRIVER_AUTH/cnh-front-new.jpg','$DRIVER_AUTH','$DRIVER_AUTH');
SQL

query_as_auth() {
  local auth_id="$1"
  local sql="$2"
  psql -Atq -v ON_ERROR_STOP=1 <<SQL
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='$auth_id';
$sql
commit;
SQL
}

# Replacement must send an approved online Driver back to review and offline.
REPLACED=$(query_as_auth "$DRIVER_AUTH" "select public.driver_update_document('cnh_front','$DRIVER_AUTH/cnh-front-new.jpg');")
[[ "$REPLACED" == *'"ok": true'* || "$REPLACED" == *'"ok":true'* ]] || { echo "Driver document replacement failed"; exit 1; }
STATE=$(psql -Atq -v ON_ERROR_STOP=1 -c "select documents_status||'|'||approval_status||'|'||is_online||'|'||(approved_at is null) from public.drivers d join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH';")
[[ "$STATE" == "pending_review|em_analise|f|t" ]] || { echo "Driver did not return to review/offline: $STATE"; exit 1; }

expect_failure() {
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

# A Driver cannot attach another user's path or a path with no storage object.
expect_failure "$DRIVER_AUTH" "select public.driver_update_document('cnh_front','57000000-0000-4000-8000-000000000099/alien.jpg');" "invalid_document_path"
expect_failure "$DRIVER_AUTH" "select public.driver_update_document('cnh_front','$DRIVER_AUTH/missing.jpg');" "document_object_missing"

# Client can only call the public wrapper, never the implementation schema.
expect_failure "$DRIVER_AUTH" "select apois_rpc_private.driver_update_document('cnh_front','$DRIVER_AUTH/cnh-front-new.jpg');" "permission denied"

DRIVER_ID=$(psql -Atq -v ON_ERROR_STOP=1 -c "select d.id from public.drivers d join public.users u on u.id=d.user_id where u.auth_user_id='$DRIVER_AUTH';")

# Admin cannot approve while a required object referenced by the Driver is absent.
expect_failure "$ADMIN_AUTH" "select public.admin_set_driver_approval('$DRIVER_ID','aprovado',null);" "driver_documents_incomplete"

# Once the final required object exists, canonical Admin approval succeeds.
psql -v ON_ERROR_STOP=1 <<SQL
insert into storage.objects(bucket_id,name,owner,owner_id)
values('vehicle-documents','$DRIVER_AUTH/vehicle-old.jpg','$DRIVER_AUTH','$DRIVER_AUTH');
SQL
APPROVED=$(query_as_auth "$ADMIN_AUTH" "select public.admin_set_driver_approval('$DRIVER_ID','aprovado',null);")
[[ "$APPROVED" == *'"approval_status": "aprovado"'* || "$APPROVED" == *'"approval_status":"aprovado"'* ]] || { echo "Admin approval failed"; exit 1; }
[[ "$APPROVED" == *'"documents_status": "approved"'* || "$APPROVED" == *'"documents_status":"approved"'* ]] || { echo "Document status was not approved"; exit 1; }

AUDIT_COUNT=$(psql -Atq -v ON_ERROR_STOP=1 -c "select count(*) from public.audit_logs where actor_id in ('$DRIVER_AUTH','$ADMIN_AUTH') and action in ('driver.document.replaced','admin.driver.approval_status_changed');")
[[ "$AUDIT_COUNT" == "2" ]] || { echo "KYC audit actor/records are wrong: $AUDIT_COUNT"; exit 1; }

echo "APOIS_DRIVER_KYC_REAPPROVAL_OK"
