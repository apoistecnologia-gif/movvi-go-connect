create table if not exists public.driver_wallets (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  available_balance numeric(12,2) not null default 0 check (available_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  direction text not null check (direction in ('credit','debit')),
  source text not null,
  source_id uuid,
  description text,
  created_at timestamptz not null default now(),
  unique(driver_id, source, source_id)
);
create index if not exists driver_wallet_transactions_driver_created_idx on public.driver_wallet_transactions(driver_id,created_at desc);

create table if not exists public.driver_withdrawals (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','cancelled')),
  provider text,
  provider_transfer_id text,
  failure_reason text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists driver_withdrawals_driver_requested_idx on public.driver_withdrawals(driver_id,requested_at desc);

alter table public.driver_wallets enable row level security;
alter table public.driver_wallet_transactions enable row level security;
alter table public.driver_withdrawals enable row level security;

drop policy if exists driver_wallets_read_own on public.driver_wallets;
create policy driver_wallets_read_own on public.driver_wallets for select to authenticated using (exists (select 1 from public.drivers d where d.id=driver_wallets.driver_id and d.user_id=public.mobility_user_id()));
drop policy if exists driver_wallet_transactions_read_own on public.driver_wallet_transactions;
create policy driver_wallet_transactions_read_own on public.driver_wallet_transactions for select to authenticated using (exists (select 1 from public.drivers d where d.id=driver_wallet_transactions.driver_id and d.user_id=public.mobility_user_id()));
drop policy if exists driver_withdrawals_read_own on public.driver_withdrawals;
create policy driver_withdrawals_read_own on public.driver_withdrawals for select to authenticated using (exists (select 1 from public.drivers d where d.id=driver_withdrawals.driver_id and d.user_id=public.mobility_user_id()));

create or replace function public.credit_driver_cancellation_fee()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_driver_id uuid; v_inserted_id uuid; v_amount numeric; v_paid boolean;
begin
  v_paid:=lower(coalesce(new.status,''))='paid' or coalesce(new.is_paid,false)=true or lower(coalesce(new.mp_payment_status,''))='approved';
  if not v_paid then return new; end if;
  if tg_op='UPDATE' and (lower(coalesce(old.status,''))='paid' or coalesce(old.is_paid,false)=true or lower(coalesce(old.mp_payment_status,''))='approved') then return new; end if;
  v_amount:=coalesce(new.amount,new.fee_amount,new.value,0);
  if v_amount<=0 then return new; end if;
  select r.driver_id into v_driver_id from public.rides r where r.id=new.ride_id;
  if v_driver_id is null then return new; end if;
  insert into public.driver_wallets(driver_id) values(v_driver_id) on conflict(driver_id) do nothing;
  insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
  values(v_driver_id,v_amount,'credit','cancellation_fee',new.id,'Multa de cancelamento paga pelo passageiro')
  on conflict(driver_id,source,source_id) do nothing returning id into v_inserted_id;
  if v_inserted_id is not null then
    update public.driver_wallets set balance=balance+v_amount,available_balance=available_balance+v_amount,updated_at=now() where driver_id=v_driver_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists cancellation_fee_credit_driver_wallet on public.cancellation_fees;
create trigger cancellation_fee_credit_driver_wallet after insert or update on public.cancellation_fees for each row execute function public.credit_driver_cancellation_fee();

insert into public.driver_wallets(driver_id) select d.id from public.drivers d on conflict(driver_id) do nothing;
