-- APOIS Corridas: canonical Asaas driver payout foundation.
-- Payouts remain disabled by finance.driver_payouts_enabled until external homologation.

create table if not exists public.driver_payout_destinations (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  pix_key text not null,
  pix_key_type text not null check (pix_key_type in ('CPF','CNPJ','EMAIL','PHONE','EVP')),
  holder_name text,
  confirmed_at timestamptz,
  payout_available_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.driver_payout_destinations enable row level security;
revoke all on public.driver_payout_destinations from anon, authenticated;
grant select on public.driver_payout_destinations to authenticated;

drop policy if exists driver_payout_destinations_read_own on public.driver_payout_destinations;
create policy driver_payout_destinations_read_own
on public.driver_payout_destinations
for select
to authenticated
using (
  exists (
    select 1 from public.drivers d
    where d.id = driver_payout_destinations.driver_id
      and d.user_id = public.mobility_user_id()
  )
);

alter table public.driver_withdrawals
  add column if not exists idempotency_key uuid,
  add column if not exists pix_key text,
  add column if not exists pix_key_type text,
  add column if not exists pix_holder_name text,
  add column if not exists provider_end_to_end_id text,
  add column if not exists provider_response jsonb,
  add column if not exists refunded_at timestamptz;

create unique index if not exists driver_withdrawals_driver_id_idempotency_uidx
  on public.driver_withdrawals(driver_id, idempotency_key)
  where idempotency_key is not null;

insert into public.app_settings(key,value,description)
values ('finance.driver_min_withdrawal_cents','2000'::jsonb,'Valor mínimo de saque do motorista em centavos; preserva o mínimo legado de R$ 20,00.')
on conflict (key) do nothing;

create or replace function apois_rpc_private.driver_request_withdrawal(
  _amount_cents bigint,
  _idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver public.drivers%rowtype;
  v_wallet public.driver_wallets%rowtype;
  v_destination public.driver_payout_destinations%rowtype;
  v_withdrawal public.driver_withdrawals%rowtype;
  v_min_cents bigint := 2000;
  v_enabled boolean := false;
  v_target_provider text := 'disabled';
  v_amount numeric(14,2);
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  if _amount_cents is null or _amount_cents <= 0 then
    raise exception 'invalid_withdrawal_amount' using errcode='22023';
  end if;
  if _idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode='22023';
  end if;

  select coalesce((value #>> '{}')::boolean,false)
    into v_enabled
  from public.app_settings
  where key='finance.driver_payouts_enabled';

  if not coalesce(v_enabled,false) then
    raise exception 'driver_payouts_not_homologated' using errcode='55000';
  end if;

  select coalesce(value #>> '{}','disabled')
    into v_target_provider
  from public.app_settings
  where key='finance.target_payout_provider';

  if coalesce(v_target_provider,'disabled') <> 'asaas' then
    raise exception 'payout_provider_not_asaas' using errcode='55000';
  end if;

  select coalesce((value #>> '{}')::bigint,2000)
    into v_min_cents
  from public.app_settings
  where key='finance.driver_min_withdrawal_cents';

  if _amount_cents < coalesce(v_min_cents,2000) then
    raise exception 'min_withdrawal_amount' using errcode='22023';
  end if;

  select d.* into v_driver
  from public.drivers d
  where d.user_id = public.mobility_user_id()
  limit 1;

  if v_driver.id is null then
    raise exception 'driver_not_found' using errcode='P0002';
  end if;
  if v_driver.approval_status <> 'aprovado' or v_driver.blocked_at is not null or v_driver.suspended_at is not null then
    raise exception 'driver_not_eligible_for_payout' using errcode='42501';
  end if;

  select w.* into v_withdrawal
  from public.driver_withdrawals w
  where w.driver_id=v_driver.id and w.idempotency_key=_idempotency_key
  limit 1;

  if v_withdrawal.id is not null then
    return jsonb_build_object(
      'withdrawalId',v_withdrawal.id,
      'status',v_withdrawal.status,
      'provider',v_withdrawal.provider,
      'amountCents',round(v_withdrawal.amount*100)::bigint,
      'idempotent',true
    );
  end if;

  if not exists (
    select 1 from public.driver_asaas_accounts a
    where a.driver_id=v_driver.id
      and a.status='approved'
      and nullif(a.subaccount_id,'') is not null
      and nullif(a.wallet_id,'') is not null
  ) then
    raise exception 'asaas_subaccount_not_approved' using errcode='55000';
  end if;

  if not exists (
    select 1 from public.asaas_subaccount_credentials c
    where c.driver_id=v_driver.id
  ) then
    raise exception 'asaas_subaccount_secret_missing' using errcode='55000';
  end if;

  select p.* into v_destination
  from public.driver_payout_destinations p
  where p.driver_id=v_driver.id;

  if v_destination.driver_id is null or v_destination.confirmed_at is null then
    raise exception 'pix_payout_destination_not_confirmed' using errcode='55000';
  end if;
  if v_destination.payout_available_at is not null and v_destination.payout_available_at > now() then
    raise exception 'pix_payout_destination_cooldown' using errcode='55000';
  end if;

  select w.* into v_wallet
  from public.driver_wallets w
  where w.driver_id=v_driver.id
  for update;

  if v_wallet.driver_id is null then
    raise exception 'driver_wallet_not_found' using errcode='P0002';
  end if;

  v_amount := round((_amount_cents::numeric / 100.0),2);
  if v_wallet.available_balance < v_amount or v_wallet.balance < v_amount then
    raise exception 'insufficient_available_balance' using errcode='22023';
  end if;

  insert into public.driver_withdrawals(
    driver_id,amount,status,provider,idempotency_key,pix_key,pix_key_type,pix_holder_name
  ) values (
    v_driver.id,v_amount,'pending','asaas',_idempotency_key,
    v_destination.pix_key,v_destination.pix_key_type,v_destination.holder_name
  ) returning * into v_withdrawal;

  update public.driver_wallets
  set balance=balance-v_amount,
      available_balance=available_balance-v_amount,
      updated_at=now()
  where driver_id=v_driver.id;

  insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
  values(v_driver.id,v_amount,'debit','withdrawal',v_withdrawal.id,'Saque Pix Asaas solicitado');

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'driver_withdrawal_requested','driver_withdrawal',v_withdrawal.id::text,
    jsonb_build_object('provider','asaas','amount_cents',_amount_cents,'idempotency_key',_idempotency_key));

  return jsonb_build_object(
    'withdrawalId',v_withdrawal.id,
    'status','pending',
    'provider','asaas',
    'amountCents',_amount_cents,
    'idempotent',false
  );
end;
$$;

create or replace function public.driver_request_withdrawal(_amount_cents bigint,_idempotency_key uuid)
returns jsonb
language sql
set search_path=''
as $$ select apois_rpc_private.driver_request_withdrawal($1,$2); $$;

revoke all on function public.driver_request_withdrawal(bigint,uuid) from public, anon;
grant execute on function public.driver_request_withdrawal(bigint,uuid) to authenticated;

create or replace function public.mark_driver_withdrawal_processing(_withdrawal_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  update public.driver_withdrawals
  set status='processing',processed_at=coalesce(processed_at,now()),updated_at=now()
  where id=_withdrawal_id and status='pending';
end;
$$;

create or replace function public.mark_driver_withdrawal_paid(
  _withdrawal_id uuid,
  _transfer_id text,
  _end_to_end_id text,
  _response jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  if exists(select 1 from public.driver_withdrawals where id=_withdrawal_id and status='paid') then
    return;
  end if;

  update public.driver_withdrawals
  set status='paid',provider='asaas',provider_transfer_id=_transfer_id,
      provider_end_to_end_id=_end_to_end_id,provider_response=_response,
      failure_reason=null,processed_at=coalesce(processed_at,now()),updated_at=now()
  where id=_withdrawal_id and status in ('pending','processing');

  if not found then
    raise exception 'withdrawal_not_payable' using errcode='55000';
  end if;
end;
$$;

create or replace function public.mark_driver_withdrawal_failed(
  _withdrawal_id uuid,
  _reason text,
  _response jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_w public.driver_withdrawals%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  select * into v_w from public.driver_withdrawals where id=_withdrawal_id for update;
  if v_w.id is null then
    raise exception 'withdrawal_not_found' using errcode='P0002';
  end if;
  if v_w.status='failed' then
    return;
  end if;
  if v_w.status='paid' then
    raise exception 'paid_withdrawal_cannot_fail' using errcode='55000';
  end if;
  if v_w.status not in ('pending','processing') then
    raise exception 'withdrawal_not_refundable' using errcode='55000';
  end if;

  update public.driver_withdrawals
  set status='failed',failure_reason=left(coalesce(_reason,'payout_failed'),1000),
      provider_response=_response,refunded_at=now(),processed_at=coalesce(processed_at,now()),updated_at=now()
  where id=_withdrawal_id;

  update public.driver_wallets
  set balance=balance+v_w.amount,
      available_balance=available_balance+v_w.amount,
      updated_at=now()
  where driver_id=v_w.driver_id;

  insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
  values(v_w.driver_id,v_w.amount,'credit','withdrawal_refund',v_w.id,'Estorno automático de saque Pix Asaas')
  on conflict (driver_id,source,source_id) do nothing;
end;
$$;

revoke all on function public.mark_driver_withdrawal_processing(uuid) from public, anon, authenticated;
revoke all on function public.mark_driver_withdrawal_paid(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.mark_driver_withdrawal_failed(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.mark_driver_withdrawal_processing(uuid) to service_role;
grant execute on function public.mark_driver_withdrawal_paid(uuid,text,text,jsonb) to service_role;
grant execute on function public.mark_driver_withdrawal_failed(uuid,text,jsonb) to service_role;
