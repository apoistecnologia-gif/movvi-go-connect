-- APOIS CORRIDAS — CANONICAL BASELINE 007
-- Phase 5: settlement, payment truth, ledgers, wallet and payout reservation.
-- Fresh-database baseline only. Do not execute ad-hoc on production.

-- Current product rule: the Driver keeps 100% of the ride value. The setting is
-- explicit so a future commercial decision does not require duplicating math.
insert into public.app_settings(key,value,description) values
  ('finance.platform_fee_percent','0'::jsonb,'Percentual da corrida destinado à plataforma. Regra atual: 0%, motorista recebe 100%.'),
  ('finance.electronic_payment_provider','null'::jsonb,'Provedor de pagamento eletrônico de corridas. Deve ser configurado explicitamente antes de uso.'),
  ('finance.payout_provider','null'::jsonb,'Provedor de payout. Deve ser configurado explicitamente antes de processamento automático.')
on conflict(key) do update set description=excluded.description,updated_at=now();

alter table public.driver_wallets
  add column if not exists pending_balance numeric(12,2) not null default 0 check (pending_balance >= 0),
  add column if not exists debt_balance numeric(12,2) not null default 0 check (debt_balance >= 0);

alter table public.driver_withdrawals
  add column if not exists idempotency_key uuid,
  add column if not exists amount_cents bigint check (amount_cents is null or amount_cents > 0);
create unique index if not exists driver_withdrawals_idempotency_uidx
  on public.driver_withdrawals(driver_id,idempotency_key)
  where idempotency_key is not null;

create table if not exists public.ride_settlements (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null unique references public.rides(id) on delete restrict,
  passenger_id uuid not null references public.users(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  gross_amount_cents bigint not null check (gross_amount_cents >= 0),
  discount_amount_cents bigint not null default 0 check (discount_amount_cents >= 0),
  passenger_charge_cents bigint not null check (passenger_charge_cents >= 0),
  platform_fee_cents bigint not null default 0 check (platform_fee_cents >= 0),
  driver_earning_cents bigint not null check (driver_earning_cents >= 0),
  payment_provider_fee_cents bigint not null default 0 check (payment_provider_fee_cents >= 0),
  cash_amount_cents bigint not null default 0 check (cash_amount_cents >= 0),
  wallet_amount_cents bigint not null default 0 check (wallet_amount_cents >= 0),
  refunded_amount_cents bigint not null default 0 check (refunded_amount_cents >= 0),
  payment_method text not null,
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  status text not null default 'pending_payment' check (status in ('pending_payment','settled','failed','refunded')),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (passenger_charge_cents + discount_amount_cents = gross_amount_cents),
  check (platform_fee_cents + driver_earning_cents = passenger_charge_cents),
  check (refunded_amount_cents <= passenger_charge_cents)
);
create index if not exists ride_settlements_driver_created_idx on public.ride_settlements(driver_id,created_at desc);
create index if not exists ride_settlements_passenger_created_idx on public.ride_settlements(passenger_id,created_at desc);
create index if not exists ride_settlements_status_idx on public.ride_settlements(status,payment_status,created_at);

create table if not exists public.ride_payments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete restrict,
  settlement_id uuid not null references public.ride_settlements(id) on delete restrict,
  provider text not null,
  payment_method text not null,
  provider_reference text,
  amount_cents bigint not null check (amount_cents > 0),
  provider_fee_cents bigint not null default 0 check (provider_fee_cents >= 0),
  status text not null check (status in ('pending','paid','failed','refunded')),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}',
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ride_payments_provider_reference_uidx
  on public.ride_payments(provider,provider_reference)
  where provider_reference is not null;
create index if not exists ride_payments_ride_created_idx on public.ride_payments(ride_id,created_at desc);

create table if not exists public.passenger_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.users(id) on delete cascade,
  ride_id uuid references public.rides(id) on delete set null,
  amount_cents bigint not null check (amount_cents > 0),
  direction text not null check (direction in ('credit','debit')),
  source text not null,
  source_id uuid,
  description text,
  created_at timestamptz not null default now(),
  unique(passenger_id,source,source_id)
);
create index if not exists passenger_wallet_transactions_passenger_created_idx
  on public.passenger_wallet_transactions(passenger_id,created_at desc);

create table if not exists public.driver_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete restrict,
  ride_id uuid references public.rides(id) on delete set null,
  settlement_id uuid references public.ride_settlements(id) on delete set null,
  amount_cents bigint not null check (amount_cents > 0),
  direction text not null check (direction in ('credit','debit')),
  entry_type text not null,
  source_id uuid,
  description text,
  created_at timestamptz not null default now(),
  unique(driver_id,entry_type,source_id)
);
create index if not exists driver_ledger_entries_driver_created_idx on public.driver_ledger_entries(driver_id,created_at desc);

create table if not exists public.platform_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid references public.rides(id) on delete set null,
  settlement_id uuid references public.ride_settlements(id) on delete set null,
  amount_cents bigint not null check (amount_cents > 0),
  direction text not null check (direction in ('credit','debit')),
  entry_type text not null,
  source_id uuid,
  description text,
  created_at timestamptz not null default now(),
  unique(entry_type,source_id)
);
create index if not exists platform_ledger_entries_created_idx on public.platform_ledger_entries(created_at desc);

alter table public.ride_settlements enable row level security;
alter table public.ride_payments enable row level security;
alter table public.passenger_wallet_transactions enable row level security;
alter table public.driver_ledger_entries enable row level security;
alter table public.platform_ledger_entries enable row level security;

create policy ride_settlements_passenger_read_own on public.ride_settlements for select to authenticated
  using (passenger_id=public.mobility_user_id());
create policy ride_settlements_driver_read_own on public.ride_settlements for select to authenticated using (
  exists(select 1 from public.drivers d where d.id=ride_settlements.driver_id and d.user_id=public.mobility_user_id())
);
create policy ride_settlements_finance_read on public.ride_settlements for select to authenticated
  using (private.has_permission('finance.read'));

create policy ride_payments_passenger_read_own on public.ride_payments for select to authenticated using (
  exists(select 1 from public.rides r where r.id=ride_payments.ride_id and r.passenger_id=public.mobility_user_id())
);
create policy ride_payments_driver_read_own on public.ride_payments for select to authenticated using (
  exists(select 1 from public.rides r join public.drivers d on d.id=r.driver_id
         where r.id=ride_payments.ride_id and d.user_id=public.mobility_user_id())
);
create policy ride_payments_finance_read on public.ride_payments for select to authenticated
  using (private.has_permission('finance.read'));

create policy passenger_wallet_transactions_read_own on public.passenger_wallet_transactions for select to authenticated
  using (passenger_id=public.mobility_user_id());
create policy passenger_wallet_transactions_finance_read on public.passenger_wallet_transactions for select to authenticated
  using (private.has_permission('finance.read'));

create policy driver_ledger_entries_read_own on public.driver_ledger_entries for select to authenticated using (
  exists(select 1 from public.drivers d where d.id=driver_ledger_entries.driver_id and d.user_id=public.mobility_user_id())
);
create policy driver_ledger_entries_finance_read on public.driver_ledger_entries for select to authenticated
  using (private.has_permission('finance.read'));

create policy platform_ledger_entries_finance_read on public.platform_ledger_entries for select to authenticated
  using (private.has_permission('finance.read'));

insert into public.role_permissions(role,permission) values
  ('administrator','finance.read'),
  ('administrator','finance.manage')
on conflict(role,permission) do nothing;

create or replace function private.platform_fee_percent()
returns numeric language plpgsql stable security definer set search_path to 'public' as $$
declare v_percent numeric:=0;
begin
  begin
    select coalesce((value #>> '{}')::numeric,0) into v_percent
    from public.app_settings where key='finance.platform_fee_percent';
  exception when others then v_percent:=0; end;
  return greatest(0,least(coalesce(v_percent,0),100));
end;
$$;

create or replace function private.ensure_driver_wallet(_driver_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.driver_wallets(driver_id) values(_driver_id)
  on conflict(driver_id) do nothing;
end;
$$;

create or replace function private.create_ride_settlement(_ride_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_ride public.rides%rowtype;
  v_settlement_id uuid;
  v_charge_cents bigint;
  v_discount_cents bigint:=0;
  v_gross_cents bigint;
  v_platform_fee_cents bigint;
  v_driver_earning_cents bigint;
  v_new boolean:=false;
begin
  select * into v_ride from public.rides where id=_ride_id for update;
  if not found then raise exception 'ride_not_found'; end if;
  if v_ride.status<>'finalizada' or v_ride.driver_id is null then raise exception 'ride_not_completed'; end if;

  v_charge_cents:=round(coalesce(v_ride.final_price,v_ride.estimated_price,0)*100)::bigint;
  if v_charge_cents<0 then raise exception 'invalid_ride_amount'; end if;
  begin
    v_discount_cents:=round(greatest(0,coalesce((v_ride.service_details #>> '{pricing_breakdown,discount}')::numeric,0))*100)::bigint;
  exception when others then v_discount_cents:=0; end;
  v_gross_cents:=v_charge_cents+v_discount_cents;
  v_platform_fee_cents:=round(v_charge_cents*private.platform_fee_percent()/100)::bigint;
  v_driver_earning_cents:=greatest(0,v_charge_cents-v_platform_fee_cents);

  insert into public.ride_settlements(
    ride_id,passenger_id,driver_id,gross_amount_cents,discount_amount_cents,
    passenger_charge_cents,platform_fee_cents,driver_earning_cents,payment_method
  ) values(
    v_ride.id,v_ride.passenger_id,v_ride.driver_id,v_gross_cents,v_discount_cents,
    v_charge_cents,v_platform_fee_cents,v_driver_earning_cents,lower(v_ride.payment_method)
  )
  on conflict(ride_id) do nothing
  returning id into v_settlement_id;

  if v_settlement_id is not null then
    v_new:=true;
  else
    select id into v_settlement_id from public.ride_settlements where ride_id=v_ride.id;
  end if;

  if v_new and lower(v_ride.payment_method)<>'cash' and v_driver_earning_cents>0 then
    perform private.ensure_driver_wallet(v_ride.driver_id);
    update public.driver_wallets
    set pending_balance=pending_balance+(v_driver_earning_cents::numeric/100),updated_at=now()
    where driver_id=v_ride.driver_id;
  end if;

  return v_settlement_id;
end;
$$;

create or replace function private.credit_driver_wallet(
  _driver_id uuid,_amount_cents bigint,_source text,_source_id uuid,_description text,_pending_release_cents bigint default 0
) returns boolean language plpgsql security definer set search_path to 'public' as $$
declare
  v_inserted uuid;
  v_amount numeric;
  v_debt_offset numeric:=0;
  v_wallet public.driver_wallets%rowtype;
begin
  if _amount_cents<=0 then return false; end if;
  v_amount:=_amount_cents::numeric/100;
  perform private.ensure_driver_wallet(_driver_id);
  select * into v_wallet from public.driver_wallets where driver_id=_driver_id for update;

  insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
  values(_driver_id,v_amount,'credit',_source,_source_id,_description)
  on conflict(driver_id,source,source_id) do nothing
  returning id into v_inserted;
  if v_inserted is null then return false; end if;

  update public.driver_wallets set
    balance=balance+v_amount,
    available_balance=available_balance+v_amount,
    pending_balance=greatest(0,pending_balance-(greatest(0,_pending_release_cents)::numeric/100)),
    updated_at=now()
  where driver_id=_driver_id
  returning * into v_wallet;

  v_debt_offset:=least(v_wallet.debt_balance,v_amount);
  if v_debt_offset>0 then
    insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
    values(_driver_id,v_debt_offset,'debit',_source||'_debt_offset',_source_id,'Compensação automática de saldo devedor')
    on conflict(driver_id,source,source_id) do nothing;
    update public.driver_wallets set
      balance=greatest(0,balance-v_debt_offset),
      available_balance=greatest(0,available_balance-v_debt_offset),
      debt_balance=greatest(0,debt_balance-v_debt_offset),
      updated_at=now()
    where driver_id=_driver_id;
  end if;
  return true;
end;
$$;

create or replace function private.clawback_driver_wallet(
  _driver_id uuid,_amount_cents bigint,_source text,_source_id uuid,_description text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_wallet public.driver_wallets%rowtype;
  v_amount numeric:=greatest(0,_amount_cents)::numeric/100;
  v_available numeric:=0;
  v_debt numeric:=0;
begin
  if v_amount<=0 then return jsonb_build_object('debited',0,'debt_added',0); end if;
  perform private.ensure_driver_wallet(_driver_id);
  select * into v_wallet from public.driver_wallets where driver_id=_driver_id for update;
  v_available:=least(v_wallet.available_balance,v_wallet.balance,v_amount);
  v_debt:=greatest(0,v_amount-v_available);

  if v_available>0 then
    insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
    values(_driver_id,v_available,'debit',_source,_source_id,_description)
    on conflict(driver_id,source,source_id) do nothing;
    if found then
      update public.driver_wallets set
        balance=greatest(0,balance-v_available),
        available_balance=greatest(0,available_balance-v_available),
        updated_at=now()
      where driver_id=_driver_id;
    else
      v_available:=0;
      v_debt:=0;
    end if;
  end if;

  if v_debt>0 then
    update public.driver_wallets set debt_balance=debt_balance+v_debt,updated_at=now()
    where driver_id=_driver_id;
  end if;
  return jsonb_build_object('debited',v_available,'debt_added',v_debt);
end;
$$;

create or replace function private.apply_paid_settlement(
  _settlement_id uuid,_provider_fee_cents bigint default 0
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_settlement public.ride_settlements%rowtype;
  v_driver_user_id uuid;
begin
  select * into v_settlement from public.ride_settlements where id=_settlement_id for update;
  if not found then raise exception 'settlement_not_found'; end if;
  if v_settlement.status='settled' and v_settlement.payment_status='paid' then
    return jsonb_build_object('ok',true,'already_settled',true);
  end if;
  if v_settlement.status='refunded' then raise exception 'settlement_refunded'; end if;

  update public.ride_settlements set
    payment_status='paid',status='settled',payment_provider_fee_cents=greatest(0,_provider_fee_cents),
    cash_amount_cents=case when payment_method='cash' then passenger_charge_cents else 0 end,
    wallet_amount_cents=case when payment_method='wallet' then passenger_charge_cents else 0 end,
    settled_at=coalesce(settled_at,now()),updated_at=now()
  where id=v_settlement.id
  returning * into v_settlement;

  insert into public.driver_ledger_entries(driver_id,ride_id,settlement_id,amount_cents,direction,entry_type,source_id,description)
  values(v_settlement.driver_id,v_settlement.ride_id,v_settlement.id,v_settlement.driver_earning_cents,'credit','ride_earning',v_settlement.id,'Ganho da corrida')
  on conflict(driver_id,entry_type,source_id) do nothing;

  if v_settlement.payment_method<>'cash' and v_settlement.driver_earning_cents>0 then
    perform private.credit_driver_wallet(
      v_settlement.driver_id,v_settlement.driver_earning_cents,'ride_settlement',v_settlement.id,'Crédito de corrida liquidada',v_settlement.driver_earning_cents
    );
  end if;

  if v_settlement.platform_fee_cents>0 then
    insert into public.platform_ledger_entries(ride_id,settlement_id,amount_cents,direction,entry_type,source_id,description)
    values(v_settlement.ride_id,v_settlement.id,v_settlement.platform_fee_cents,'credit','ride_platform_fee',v_settlement.id,'Receita da plataforma na corrida')
    on conflict(entry_type,source_id) do nothing;
  end if;
  if greatest(0,_provider_fee_cents)>0 then
    insert into public.platform_ledger_entries(ride_id,settlement_id,amount_cents,direction,entry_type,source_id,description)
    values(v_settlement.ride_id,v_settlement.id,greatest(0,_provider_fee_cents),'debit','payment_provider_fee',v_settlement.id,'Taxa do provedor de pagamento')
    on conflict(entry_type,source_id) do nothing;
  end if;

  select user_id into v_driver_user_id from public.drivers where id=v_settlement.driver_id;
  if v_driver_user_id is not null then
    insert into public.notifications(user_id,title,body,data)
    values(v_driver_user_id,'Pagamento da corrida confirmado','O financeiro da corrida foi liquidado.',jsonb_build_object('category','payment','ride_id',v_settlement.ride_id,'settlement_id',v_settlement.id));
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'ride.settlement.paid','ride_settlement',v_settlement.id::text,
    jsonb_build_object('ride_id',v_settlement.ride_id,'driver_id',v_settlement.driver_id,'passenger_charge_cents',v_settlement.passenger_charge_cents,'driver_earning_cents',v_settlement.driver_earning_cents,'platform_fee_cents',v_settlement.platform_fee_cents,'provider_fee_cents',greatest(0,_provider_fee_cents)));

  return jsonb_build_object('ok',true,'already_settled',false,'settlement_id',v_settlement.id);
end;
$$;

create or replace function private.pay_settlement_from_passenger_wallet(_settlement_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_settlement public.ride_settlements%rowtype;
  v_wallet public.passenger_wallets%rowtype;
  v_amount numeric;
  v_tx uuid;
  v_payment uuid;
begin
  select * into v_settlement from public.ride_settlements where id=_settlement_id for update;
  if not found then raise exception 'settlement_not_found'; end if;
  if v_settlement.payment_method<>'wallet' then raise exception 'payment_method_not_wallet'; end if;
  if v_settlement.status='settled' then return jsonb_build_object('ok',true,'already_paid',true); end if;

  v_amount:=v_settlement.passenger_charge_cents::numeric/100;
  select * into v_wallet from public.passenger_wallets where passenger_id=v_settlement.passenger_id for update;
  if not found or v_wallet.balance<v_amount then
    update public.ride_settlements set payment_status='failed',updated_at=now() where id=v_settlement.id;
    return jsonb_build_object('ok',false,'error','insufficient_wallet_balance');
  end if;

  insert into public.passenger_wallet_transactions(passenger_id,ride_id,amount_cents,direction,source,source_id,description)
  values(v_settlement.passenger_id,v_settlement.ride_id,v_settlement.passenger_charge_cents,'debit','ride_payment',v_settlement.id,'Pagamento de corrida com Carteira APOIS')
  on conflict(passenger_id,source,source_id) do nothing
  returning id into v_tx;

  if v_tx is not null then
    update public.passenger_wallets set balance=balance-v_amount,updated_at=now() where id=v_wallet.id;
  end if;

  insert into public.ride_payments(ride_id,settlement_id,provider,payment_method,amount_cents,status,idempotency_key,paid_at)
  values(v_settlement.ride_id,v_settlement.id,'internal_wallet','wallet',v_settlement.passenger_charge_cents,'paid','wallet:'||v_settlement.id::text,now())
  on conflict(idempotency_key) do nothing
  returning id into v_payment;

  return private.apply_paid_settlement(v_settlement.id,0);
end;
$$;

create or replace function public.driver_finish_ride(_ride_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_driver public.drivers%rowtype;
  v_ride public.rides%rowtype;
  v_next public.rides%rowtype;
  v_settlement_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into v_driver from public.drivers where user_id=public.mobility_user_id() for update;
  if not found then raise exception 'driver_profile_missing'; end if;

  update public.rides set
    status='finalizada',final_price=coalesce(final_price,estimated_price),completed_at=now(),updated_at=now()
  where id=_ride_id and driver_id=v_driver.id and status='em_viagem'
  returning * into v_ride;
  if not found then raise exception 'invalid_ride_transition'; end if;

  v_settlement_id:=private.create_ride_settlement(v_ride.id);
  if lower(v_ride.payment_method)='wallet' then
    perform private.pay_settlement_from_passenger_wallet(v_settlement_id);
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'ride.finished','ride',v_ride.id::text,jsonb_build_object('driver_id',v_driver.id,'settlement_id',v_settlement_id,'payment_method',v_ride.payment_method));

  select * into v_next from public.rides
  where driver_id=v_driver.id and accepted_driver_id=v_driver.id and queued_after_ride_id=_ride_id and status='procurar_motorista'
  order by queued_at asc nulls last,created_at asc limit 1 for update;
  if found then
    update public.rides set
      status='motorista_a_caminho',accepted_at=now(),queued_after_ride_id=null,request_expires_at=null,search_expires_at=null,
      security_code=coalesce(security_code,lpad((floor(random()*10000))::int::text,4,'0')),
      driver_latitude=v_driver.current_lat,driver_longitude=v_driver.current_lng,driver_heading=v_driver.current_heading,updated_at=now()
    where id=v_next.id;
  end if;

  return to_jsonb(v_ride);
end;
$$;

create or replace function public.driver_confirm_cash_payment(_ride_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_driver_id uuid;
  v_settlement public.ride_settlements%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select id into v_driver_id from public.drivers where user_id=public.mobility_user_id();
  if v_driver_id is null then raise exception 'driver_profile_missing'; end if;
  select * into v_settlement from public.ride_settlements
  where ride_id=_ride_id and driver_id=v_driver_id for update;
  if not found then raise exception 'settlement_not_found'; end if;
  if v_settlement.payment_method<>'cash' then raise exception 'cash_confirmation_not_allowed'; end if;

  insert into public.ride_payments(ride_id,settlement_id,provider,payment_method,amount_cents,status,idempotency_key,paid_at)
  values(v_settlement.ride_id,v_settlement.id,'cash','cash',v_settlement.passenger_charge_cents,'paid','cash:'||v_settlement.id::text,now())
  on conflict(idempotency_key) do nothing;

  return private.apply_paid_settlement(v_settlement.id,0);
end;
$$;

create or replace function public.settle_ride_electronic_payment(
  _ride_id uuid,_provider text,_provider_reference text,_amount_cents bigint,_provider_fee_cents bigint,_event_key text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_settlement public.ride_settlements%rowtype;
  v_payment uuid;
  v_provider text:=lower(trim(coalesce(_provider,'')));
  v_reference text:=trim(coalesce(_provider_reference,''));
  v_event text:=trim(coalesce(_event_key,''));
begin
  if v_provider='' or v_reference='' or v_event='' then raise exception 'payment_identity_required'; end if;
  select * into v_settlement from public.ride_settlements where ride_id=_ride_id for update;
  if not found then raise exception 'settlement_not_found'; end if;
  if v_settlement.payment_method in ('cash','wallet') then raise exception 'electronic_payment_not_allowed'; end if;
  if _amount_cents<>v_settlement.passenger_charge_cents then raise exception 'payment_amount_mismatch'; end if;

  insert into public.ride_payments(
    ride_id,settlement_id,provider,payment_method,provider_reference,amount_cents,provider_fee_cents,status,idempotency_key,paid_at
  ) values(
    v_settlement.ride_id,v_settlement.id,v_provider,v_settlement.payment_method,v_reference,_amount_cents,greatest(0,_provider_fee_cents),'paid',v_provider||':'||v_event,now()
  )
  on conflict(idempotency_key) do nothing
  returning id into v_payment;

  if v_payment is null and v_settlement.status='settled' then
    return jsonb_build_object('ok',true,'already_settled',true);
  end if;
  return private.apply_paid_settlement(v_settlement.id,greatest(0,_provider_fee_cents));
end;
$$;
revoke all on function public.settle_ride_electronic_payment(uuid,text,text,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.settle_ride_electronic_payment(uuid,text,text,bigint,bigint,text) to service_role;

create or replace function public.fail_ride_electronic_payment(
  _ride_id uuid,_provider text,_provider_reference text,_event_key text,_reason text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_settlement public.ride_settlements%rowtype;
begin
  select * into v_settlement from public.ride_settlements where ride_id=_ride_id for update;
  if not found then raise exception 'settlement_not_found'; end if;
  if v_settlement.status='settled' then return jsonb_build_object('ok',true,'ignored','already_settled'); end if;

  insert into public.ride_payments(ride_id,settlement_id,provider,payment_method,provider_reference,amount_cents,status,idempotency_key,metadata)
  values(v_settlement.ride_id,v_settlement.id,lower(trim(_provider)),v_settlement.payment_method,nullif(trim(_provider_reference),''),v_settlement.passenger_charge_cents,'failed',lower(trim(_provider))||':'||trim(_event_key),jsonb_build_object('reason',left(coalesce(_reason,''),500)))
  on conflict(idempotency_key) do nothing;
  update public.ride_settlements set payment_status='failed',updated_at=now() where id=v_settlement.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.fail_ride_electronic_payment(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.fail_ride_electronic_payment(uuid,text,text,text,text) to service_role;

create or replace function public.reverse_ride_payment(
  _ride_id uuid,_provider text,_provider_reference text,_event_key text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_settlement public.ride_settlements%rowtype;
  v_clawback jsonb;
  v_wallet public.passenger_wallets%rowtype;
  v_credit uuid;
begin
  select * into v_settlement from public.ride_settlements where ride_id=_ride_id for update;
  if not found then raise exception 'settlement_not_found'; end if;
  if v_settlement.status='refunded' then return jsonb_build_object('ok',true,'already_refunded',true); end if;
  if v_settlement.status<>'settled' or v_settlement.payment_status<>'paid' then raise exception 'settlement_not_paid'; end if;
  if v_settlement.payment_method='cash' then raise exception 'cash_refund_requires_operational_process'; end if;

  update public.ride_payments set status='refunded',refunded_at=now(),updated_at=now()
  where settlement_id=v_settlement.id and status='paid';

  insert into public.driver_ledger_entries(driver_id,ride_id,settlement_id,amount_cents,direction,entry_type,source_id,description)
  values(v_settlement.driver_id,v_settlement.ride_id,v_settlement.id,v_settlement.driver_earning_cents,'debit','ride_refund',v_settlement.id,'Estorno integral da corrida')
  on conflict(driver_id,entry_type,source_id) do nothing;

  v_clawback:=private.clawback_driver_wallet(v_settlement.driver_id,v_settlement.driver_earning_cents,'ride_refund',v_settlement.id,'Estorno integral da corrida');

  if v_settlement.platform_fee_cents>0 then
    insert into public.platform_ledger_entries(ride_id,settlement_id,amount_cents,direction,entry_type,source_id,description)
    values(v_settlement.ride_id,v_settlement.id,v_settlement.platform_fee_cents,'debit','ride_platform_fee_refund',v_settlement.id,'Estorno da receita da plataforma')
    on conflict(entry_type,source_id) do nothing;
  end if;

  if v_settlement.payment_method='wallet' then
    select * into v_wallet from public.passenger_wallets where passenger_id=v_settlement.passenger_id for update;
    insert into public.passenger_wallet_transactions(passenger_id,ride_id,amount_cents,direction,source,source_id,description)
    values(v_settlement.passenger_id,v_settlement.ride_id,v_settlement.passenger_charge_cents,'credit','ride_refund',v_settlement.id,'Estorno de corrida para Carteira APOIS')
    on conflict(passenger_id,source,source_id) do nothing returning id into v_credit;
    if v_credit is not null then
      update public.passenger_wallets set balance=balance+(v_settlement.passenger_charge_cents::numeric/100),updated_at=now()
      where passenger_id=v_settlement.passenger_id;
    end if;
  end if;

  update public.ride_settlements set
    payment_status='refunded',status='refunded',refunded_amount_cents=passenger_charge_cents,updated_at=now()
  where id=v_settlement.id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'ride.settlement.refunded','ride_settlement',v_settlement.id::text,
    jsonb_build_object('ride_id',v_settlement.ride_id,'provider',_provider,'provider_reference',_provider_reference,'event_key',_event_key,'wallet_clawback',v_clawback));
  return jsonb_build_object('ok',true,'already_refunded',false,'wallet_clawback',v_clawback);
end;
$$;
revoke all on function public.reverse_ride_payment(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.reverse_ride_payment(uuid,text,text,text) to service_role;

create or replace function public.driver_request_withdrawal(_amount_cents bigint,_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_driver public.drivers%rowtype;
  v_wallet public.driver_wallets%rowtype;
  v_withdrawal public.driver_withdrawals%rowtype;
  v_amount numeric;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if _idempotency_key is null or _amount_cents<=0 then raise exception 'invalid_withdrawal_request' using errcode='22023'; end if;
  select * into v_driver from public.drivers where user_id=public.mobility_user_id() for update;
  if not found then raise exception 'driver_profile_missing'; end if;

  select * into v_withdrawal from public.driver_withdrawals
  where driver_id=v_driver.id and idempotency_key=_idempotency_key limit 1;
  if found then return to_jsonb(v_withdrawal); end if;

  perform private.ensure_driver_wallet(v_driver.id);
  select * into v_wallet from public.driver_wallets where driver_id=v_driver.id for update;
  v_amount:=_amount_cents::numeric/100;
  if v_wallet.available_balance<v_amount then raise exception 'insufficient_available_balance'; end if;

  insert into public.driver_withdrawals(driver_id,amount,amount_cents,status,idempotency_key)
  values(v_driver.id,v_amount,_amount_cents,'pending',_idempotency_key)
  returning * into v_withdrawal;

  insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
  values(v_driver.id,v_amount,'debit','withdrawal_reserve',v_withdrawal.id,'Reserva para saque')
  on conflict(driver_id,source,source_id) do nothing;
  update public.driver_wallets set balance=balance-v_amount,available_balance=available_balance-v_amount,updated_at=now()
  where driver_id=v_driver.id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'driver.withdrawal.requested','driver_withdrawal',v_withdrawal.id::text,jsonb_build_object('driver_id',v_driver.id,'amount_cents',_amount_cents));
  return to_jsonb(v_withdrawal);
end;
$$;

create or replace function public.complete_driver_withdrawal(
  _withdrawal_id uuid,_provider text,_provider_transfer_id text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_withdrawal public.driver_withdrawals%rowtype;
begin
  select * into v_withdrawal from public.driver_withdrawals where id=_withdrawal_id for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if v_withdrawal.status='paid' then return to_jsonb(v_withdrawal); end if;
  if v_withdrawal.status not in ('pending','processing') then raise exception 'invalid_withdrawal_status'; end if;
  update public.driver_withdrawals set status='paid',provider=nullif(lower(trim(_provider)),''),provider_transfer_id=nullif(trim(_provider_transfer_id),''),processed_at=now(),updated_at=now()
  where id=v_withdrawal.id returning * into v_withdrawal;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'driver.withdrawal.paid','driver_withdrawal',v_withdrawal.id::text,jsonb_build_object('provider',_provider,'provider_transfer_id',_provider_transfer_id));
  return to_jsonb(v_withdrawal);
end;
$$;
revoke all on function public.complete_driver_withdrawal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_driver_withdrawal(uuid,text,text) to service_role;

create or replace function public.fail_driver_withdrawal(
  _withdrawal_id uuid,_provider text,_failure_reason text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_withdrawal public.driver_withdrawals%rowtype;
  v_refund uuid;
begin
  select * into v_withdrawal from public.driver_withdrawals where id=_withdrawal_id for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if v_withdrawal.status='failed' then return to_jsonb(v_withdrawal); end if;
  if v_withdrawal.status not in ('pending','processing') then raise exception 'invalid_withdrawal_status'; end if;

  insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
  values(v_withdrawal.driver_id,v_withdrawal.amount,'credit','withdrawal_refund',v_withdrawal.id,'Devolução de saque não processado')
  on conflict(driver_id,source,source_id) do nothing returning id into v_refund;
  if v_refund is not null then
    update public.driver_wallets set balance=balance+v_withdrawal.amount,available_balance=available_balance+v_withdrawal.amount,updated_at=now()
    where driver_id=v_withdrawal.driver_id;
  end if;

  update public.driver_withdrawals set status='failed',provider=nullif(lower(trim(_provider)),''),failure_reason=left(coalesce(_failure_reason,''),500),processed_at=now(),updated_at=now()
  where id=v_withdrawal.id returning * into v_withdrawal;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'driver.withdrawal.failed','driver_withdrawal',v_withdrawal.id::text,jsonb_build_object('provider',_provider,'reason',left(coalesce(_failure_reason,''),500),'refunded',v_refund is not null));
  return to_jsonb(v_withdrawal);
end;
$$;
revoke all on function public.fail_driver_withdrawal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.fail_driver_withdrawal(uuid,text,text) to service_role;

-- Fix historical cancellation-fee reversal: a provider reversal must also claw
-- back the Driver credit or create Driver debt if the value was already withdrawn.
create or replace function public.reverse_cancellation_fee_settlement(_fee_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  fee_row public.cancellation_fees%rowtype;
  v_driver_id uuid;
  v_amount_cents bigint;
  v_clawback jsonb:=jsonb_build_object('debited',0,'debt_added',0);
begin
  select * into fee_row from public.cancellation_fees where id=_fee_id for update;
  if not found then raise exception 'fee_not_found'; end if;
  if not fee_row.is_paid and fee_row.status<>'paid' then return jsonb_build_object('ok',true,'already_reversed',true); end if;

  select r.driver_id into v_driver_id from public.rides r where r.id=fee_row.ride_id;
  v_amount_cents:=round(coalesce(fee_row.amount,fee_row.fee_amount,fee_row.value,0)*100)::bigint;
  if v_driver_id is not null and v_amount_cents>0 then
    v_clawback:=private.clawback_driver_wallet(v_driver_id,v_amount_cents,'cancellation_fee_reversal',fee_row.id,'Estorno de multa de cancelamento');
    insert into public.driver_ledger_entries(driver_id,ride_id,amount_cents,direction,entry_type,source_id,description)
    values(v_driver_id,fee_row.ride_id,v_amount_cents,'debit','cancellation_fee_refund',fee_row.id,'Estorno de multa de cancelamento')
    on conflict(driver_id,entry_type,source_id) do nothing;
  end if;

  update public.cancellation_fees set status='unpaid',is_paid=false,paid_at=null,updated_at=now() where id=_fee_id;
  update public.passenger_wallets set is_blocked=true,blocked_reason='Pagamento da multa foi estornado.',updated_at=now()
  where passenger_id=fee_row.passenger_id;
  insert into public.notifications(user_id,title,body,data)
  values(fee_row.passenger_id,'Pagamento estornado','O pagamento da multa foi estornado e a carteira voltou a ficar bloqueada.',jsonb_build_object('category','payment','fee_id',fee_row.id,'url','/carteira'));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'cancellation_fee.reversed','cancellation_fee',fee_row.id::text,jsonb_build_object('driver_id',v_driver_id,'clawback',v_clawback));
  return jsonb_build_object('ok',true,'already_reversed',false,'clawback',v_clawback);
end;
$$;
