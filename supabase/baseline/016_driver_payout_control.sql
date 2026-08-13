-- APOIS CORRIDAS — CANONICAL BASELINE 016
-- Driver payout control plane: approval, provider handoff, failure and reversal.
-- Fresh-database baseline only. Do not execute ad-hoc on production.

alter table public.driver_withdrawals
  drop constraint if exists driver_withdrawals_status_check;
alter table public.driver_withdrawals
  add constraint driver_withdrawals_status_check
  check (status in ('pending','approved','processing','paid','failed','reversed','cancelled'));

create or replace function public.admin_approve_driver_withdrawal(_withdrawal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_withdrawal public.driver_withdrawals%rowtype;
  v_provider text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('finance.manage') then raise exception 'forbidden' using errcode='42501'; end if;

  select nullif(lower(btrim(value #>> '{}')),'') into v_provider
  from public.app_settings where key='finance.payout_provider' limit 1;
  if v_provider is null or v_provider='null' then
    raise exception 'payout_provider_not_configured' using errcode='P0001';
  end if;

  select * into v_withdrawal
  from public.driver_withdrawals
  where id=_withdrawal_id
  for update;
  if not found then raise exception 'withdrawal_not_found' using errcode='P0002'; end if;
  if v_withdrawal.status='approved' then return to_jsonb(v_withdrawal); end if;
  if v_withdrawal.status<>'pending' then raise exception 'invalid_withdrawal_status'; end if;

  update public.driver_withdrawals
  set status='approved',provider=v_provider,failure_reason=null,updated_at=now()
  where id=v_withdrawal.id
  returning * into v_withdrawal;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'driver.withdrawal.approved','driver_withdrawal',v_withdrawal.id::text,
    jsonb_build_object('driver_id',v_withdrawal.driver_id,'amount_cents',coalesce(v_withdrawal.amount_cents,round(v_withdrawal.amount*100)::bigint),'provider',v_provider));

  return to_jsonb(v_withdrawal);
end;
$$;
revoke all on function public.admin_approve_driver_withdrawal(uuid) from public,anon;
grant execute on function public.admin_approve_driver_withdrawal(uuid) to authenticated;

create or replace function public.admin_reject_driver_withdrawal(_withdrawal_id uuid,_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_withdrawal public.driver_withdrawals%rowtype;
  v_reason text:=left(btrim(coalesce(_reason,'')),500);
  v_restored boolean:=false;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.has_permission('finance.manage') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_reason='' then raise exception 'withdrawal_rejection_reason_required' using errcode='22023'; end if;

  select * into v_withdrawal
  from public.driver_withdrawals
  where id=_withdrawal_id
  for update;
  if not found then raise exception 'withdrawal_not_found' using errcode='P0002'; end if;
  if v_withdrawal.status='failed' and v_withdrawal.failure_reason=v_reason then return to_jsonb(v_withdrawal); end if;
  if v_withdrawal.status not in ('pending','approved') then raise exception 'invalid_withdrawal_status'; end if;

  v_restored:=private.credit_driver_wallet(
    v_withdrawal.driver_id,
    coalesce(v_withdrawal.amount_cents,round(v_withdrawal.amount*100)::bigint),
    'withdrawal_refund',
    v_withdrawal.id,
    'Devolução de saque não aprovado',
    0
  );

  update public.driver_withdrawals
  set status='failed',failure_reason=v_reason,processed_at=now(),updated_at=now()
  where id=v_withdrawal.id
  returning * into v_withdrawal;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'driver.withdrawal.rejected','driver_withdrawal',v_withdrawal.id::text,
    jsonb_build_object('driver_id',v_withdrawal.driver_id,'reason',v_reason,'restored',v_restored));

  return to_jsonb(v_withdrawal);
end;
$$;
revoke all on function public.admin_reject_driver_withdrawal(uuid,text) from public,anon;
grant execute on function public.admin_reject_driver_withdrawal(uuid,text) to authenticated;

create or replace function public.begin_driver_withdrawal_processing(_withdrawal_id uuid,_provider text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_withdrawal public.driver_withdrawals%rowtype;
  v_configured_provider text;
  v_provider text:=lower(btrim(coalesce(_provider,'')));
begin
  if v_provider='' then raise exception 'payout_provider_required' using errcode='22023'; end if;

  select nullif(lower(btrim(value #>> '{}')),'') into v_configured_provider
  from public.app_settings where key='finance.payout_provider' limit 1;
  if v_configured_provider is null or v_configured_provider='null' then
    raise exception 'payout_provider_not_configured';
  end if;
  if v_provider<>v_configured_provider then raise exception 'payout_provider_mismatch'; end if;

  select * into v_withdrawal
  from public.driver_withdrawals
  where id=_withdrawal_id
  for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if v_withdrawal.status='processing' then return to_jsonb(v_withdrawal); end if;
  if v_withdrawal.status<>'approved' then raise exception 'withdrawal_not_approved'; end if;

  update public.driver_withdrawals
  set status='processing',provider=v_provider,failure_reason=null,updated_at=now()
  where id=v_withdrawal.id
  returning * into v_withdrawal;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'driver.withdrawal.processing','driver_withdrawal',v_withdrawal.id::text,
    jsonb_build_object('driver_id',v_withdrawal.driver_id,'provider',v_provider));

  return to_jsonb(v_withdrawal);
end;
$$;
revoke all on function public.begin_driver_withdrawal_processing(uuid,text) from public,anon,authenticated;
grant execute on function public.begin_driver_withdrawal_processing(uuid,text) to service_role;

create or replace function public.complete_driver_withdrawal(
  _withdrawal_id uuid,_provider text,_provider_transfer_id text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_withdrawal public.driver_withdrawals%rowtype;
  v_provider text:=lower(btrim(coalesce(_provider,'')));
  v_transfer_id text:=btrim(coalesce(_provider_transfer_id,''));
begin
  if v_provider='' or v_transfer_id='' then raise exception 'payout_identity_required' using errcode='22023'; end if;

  select * into v_withdrawal
  from public.driver_withdrawals
  where id=_withdrawal_id
  for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if v_withdrawal.status='paid' then return to_jsonb(v_withdrawal); end if;
  if v_withdrawal.status<>'processing' then raise exception 'invalid_withdrawal_status'; end if;
  if v_withdrawal.provider is not null and lower(v_withdrawal.provider)<>v_provider then
    raise exception 'payout_provider_mismatch';
  end if;

  update public.driver_withdrawals
  set status='paid',provider=v_provider,provider_transfer_id=v_transfer_id,
      failure_reason=null,processed_at=now(),updated_at=now()
  where id=v_withdrawal.id
  returning * into v_withdrawal;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'driver.withdrawal.paid','driver_withdrawal',v_withdrawal.id::text,
    jsonb_build_object('driver_id',v_withdrawal.driver_id,'provider',v_provider,'provider_transfer_id',v_transfer_id));

  return to_jsonb(v_withdrawal);
end;
$$;
revoke all on function public.complete_driver_withdrawal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_driver_withdrawal(uuid,text,text) to service_role;

create or replace function public.fail_driver_withdrawal(
  _withdrawal_id uuid,_provider text,_failure_reason text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_withdrawal public.driver_withdrawals%rowtype;
  v_restored boolean:=false;
  v_reason text:=left(btrim(coalesce(_failure_reason,'')),500);
begin
  select * into v_withdrawal
  from public.driver_withdrawals
  where id=_withdrawal_id
  for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if v_withdrawal.status='failed' then return to_jsonb(v_withdrawal); end if;
  if v_withdrawal.status not in ('pending','approved','processing') then raise exception 'invalid_withdrawal_status'; end if;

  v_restored:=private.credit_driver_wallet(
    v_withdrawal.driver_id,
    coalesce(v_withdrawal.amount_cents,round(v_withdrawal.amount*100)::bigint),
    'withdrawal_refund',
    v_withdrawal.id,
    'Devolução de saque não processado',
    0
  );

  update public.driver_withdrawals
  set status='failed',provider=nullif(lower(btrim(_provider)),''),failure_reason=v_reason,
      processed_at=now(),updated_at=now()
  where id=v_withdrawal.id
  returning * into v_withdrawal;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'driver.withdrawal.failed','driver_withdrawal',v_withdrawal.id::text,
    jsonb_build_object('driver_id',v_withdrawal.driver_id,'provider',_provider,'reason',v_reason,'restored',v_restored));

  return to_jsonb(v_withdrawal);
end;
$$;
revoke all on function public.fail_driver_withdrawal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.fail_driver_withdrawal(uuid,text,text) to service_role;

create or replace function public.reverse_driver_withdrawal(
  _withdrawal_id uuid,_provider text,_provider_transfer_id text,_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_withdrawal public.driver_withdrawals%rowtype;
  v_restored boolean:=false;
  v_reason text:=left(btrim(coalesce(_reason,'Payout revertido pelo provedor')),500);
begin
  select * into v_withdrawal
  from public.driver_withdrawals
  where id=_withdrawal_id
  for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if v_withdrawal.status='reversed' then return to_jsonb(v_withdrawal); end if;
  if v_withdrawal.status<>'paid' then raise exception 'invalid_withdrawal_status'; end if;
  if nullif(btrim(_provider_transfer_id),'') is not null
     and v_withdrawal.provider_transfer_id is not null
     and v_withdrawal.provider_transfer_id<>btrim(_provider_transfer_id) then
    raise exception 'payout_transfer_mismatch';
  end if;

  v_restored:=private.credit_driver_wallet(
    v_withdrawal.driver_id,
    coalesce(v_withdrawal.amount_cents,round(v_withdrawal.amount*100)::bigint),
    'withdrawal_reversal',
    v_withdrawal.id,
    'Payout revertido pelo provedor',
    0
  );

  update public.driver_withdrawals
  set status='reversed',provider=coalesce(nullif(lower(btrim(_provider)),''),provider),
      failure_reason=v_reason,processed_at=now(),updated_at=now()
  where id=v_withdrawal.id
  returning * into v_withdrawal;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'driver.withdrawal.reversed','driver_withdrawal',v_withdrawal.id::text,
    jsonb_build_object('driver_id',v_withdrawal.driver_id,'provider',_provider,'provider_transfer_id',_provider_transfer_id,'reason',v_reason,'restored',v_restored));

  return to_jsonb(v_withdrawal);
end;
$$;
revoke all on function public.reverse_driver_withdrawal(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.reverse_driver_withdrawal(uuid,text,text,text) to service_role;