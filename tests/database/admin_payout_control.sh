#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 <<'SQL'
-- Ephemeral CI only: enable a fake payout provider so the approval state machine
-- can be tested without calling any external payment service.
update public.app_settings
set value=to_jsonb('ci_payout'::text),updated_at=now()
where key='finance.payout_provider';

-- A mobility Driver must never gain finance.manage privileges.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$
declare v_withdrawal_id uuid;
begin
  select id into v_withdrawal_id from public.driver_withdrawals order by requested_at asc limit 1;
  begin
    perform public.admin_approve_driver_withdrawal(v_withdrawal_id);
    raise exception 'driver unexpectedly approved own withdrawal';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- Prepare a deterministic wallet and create a real reservation through the
-- Driver RPC, never by directly mutating balances in product code.
do $$
declare
  v_driver_id uuid;
  v_result jsonb;
begin
  select d.id into v_driver_id
  from public.drivers d
  join public.users u on u.id=d.user_id
  where u.auth_user_id='22222222-2222-4222-8222-222222222222';

  insert into public.driver_wallets(driver_id,balance,available_balance,pending_balance,debt_balance)
  values(v_driver_id,20.00,20.00,0,0)
  on conflict(driver_id) do update
    set balance=20.00,available_balance=20.00,pending_balance=0,debt_balance=0,updated_at=now();

  v_result:=public.driver_request_withdrawal(1000,'88888888-8888-4888-8888-888888888881');
  if v_result #>> '{status}' <> 'pending' then
    raise exception 'withdrawal request did not remain pending: %',v_result;
  end if;
  if (select round(available_balance*100)::bigint from public.driver_wallets where driver_id=v_driver_id) <> 1000 then
    raise exception 'withdrawal reservation did not reduce available balance';
  end if;
end $$;

-- Admin approval is explicit. Approval never calls an external provider.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$
declare
  v_id uuid;
  v_result jsonb;
begin
  select id into v_id from public.driver_withdrawals
  where idempotency_key='88888888-8888-4888-8888-888888888881';
  v_result:=public.admin_approve_driver_withdrawal(v_id);
  if v_result #>> '{status}' <> 'approved' or v_result #>> '{provider}' <> 'ci_payout' then
    raise exception 'admin approval failed: %',v_result;
  end if;
end $$;

-- Provider worker handoff: approved -> processing -> paid.
do $$
declare
  v_id uuid;
  v_result jsonb;
begin
  select id into v_id from public.driver_withdrawals
  where idempotency_key='88888888-8888-4888-8888-888888888881';
  v_result:=public.begin_driver_withdrawal_processing(v_id,'ci_payout');
  if v_result #>> '{status}' <> 'processing' then
    raise exception 'withdrawal did not enter processing: %',v_result;
  end if;
  v_result:=public.complete_driver_withdrawal(v_id,'ci_payout','ci-transfer-001');
  if v_result #>> '{status}' <> 'paid' or v_result #>> '{provider_transfer_id}' <> 'ci-transfer-001' then
    raise exception 'withdrawal did not complete: %',v_result;
  end if;
end $$;

-- Rejection restores the reservation exactly once.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$
declare v_result jsonb;
begin
  v_result:=public.driver_request_withdrawal(500,'88888888-8888-4888-8888-888888888882');
  if v_result #>> '{status}' <> 'pending' then raise exception 'second request failed: %',v_result; end if;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$
declare
  v_id uuid;
  v_driver_id uuid;
  v_result jsonb;
begin
  select id,driver_id into v_id,v_driver_id from public.driver_withdrawals
  where idempotency_key='88888888-8888-4888-8888-888888888882';
  v_result:=public.admin_reject_driver_withdrawal(v_id,'Rejeição CI');
  if v_result #>> '{status}' <> 'failed' then raise exception 'admin rejection failed: %',v_result; end if;
  if (select round(available_balance*100)::bigint from public.driver_wallets where driver_id=v_driver_id) <> 1000 then
    raise exception 'rejected withdrawal reservation was not restored';
  end if;
end $$;

-- Provider reversal of a paid payout restores funds and becomes idempotent.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$
declare v_result jsonb;
begin
  v_result:=public.driver_request_withdrawal(500,'88888888-8888-4888-8888-888888888883');
  if v_result #>> '{status}' <> 'pending' then raise exception 'reversal request setup failed: %',v_result; end if;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$
declare v_id uuid; v_result jsonb;
begin
  select id into v_id from public.driver_withdrawals where idempotency_key='88888888-8888-4888-8888-888888888883';
  perform public.admin_approve_driver_withdrawal(v_id);
  perform public.begin_driver_withdrawal_processing(v_id,'ci_payout');
  perform public.complete_driver_withdrawal(v_id,'ci_payout','ci-transfer-002');
  v_result:=public.reverse_driver_withdrawal(v_id,'ci_payout','ci-transfer-002','Reversão CI');
  if v_result #>> '{status}' <> 'reversed' then raise exception 'payout reversal failed: %',v_result; end if;
  v_result:=public.reverse_driver_withdrawal(v_id,'ci_payout','ci-transfer-002','Reversão CI');
  if v_result #>> '{status}' <> 'reversed' then raise exception 'payout reversal not idempotent: %',v_result; end if;
end $$;

-- The test sequence starts with R$ 20.00 and permanently pays R$ 10.00.
do $$
declare v_driver_id uuid; v_available bigint;
begin
  select d.id into v_driver_id
  from public.drivers d join public.users u on u.id=d.user_id
  where u.auth_user_id='22222222-2222-4222-8222-222222222222';
  select round(available_balance*100)::bigint into v_available from public.driver_wallets where driver_id=v_driver_id;
  if v_available<>1000 then raise exception 'final available balance mismatch: %',v_available; end if;
end $$;

-- Every privileged transition must leave an audit trail.
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.audit_logs
  where action in (
    'driver.withdrawal.approved',
    'driver.withdrawal.rejected',
    'driver.withdrawal.processing',
    'driver.withdrawal.paid',
    'driver.withdrawal.reversed'
  );
  if v_count<7 then raise exception 'payout audit trail incomplete: % events',v_count; end if;
end $$;

select 'APOIS_ADMIN_PAYOUT_CONTROL_OK' as result;
SQL
