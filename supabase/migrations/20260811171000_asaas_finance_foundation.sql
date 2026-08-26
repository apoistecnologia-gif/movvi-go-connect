-- APOIS CORRIDAS — Asaas financial foundation.
-- Provider credentials stay out of public/mobile storage. Subaccount API keys
-- are persisted only in Supabase Vault through service-role-only RPCs.

alter table public.drivers
  add column if not exists address text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists declared_monthly_income numeric(12,2);

create table if not exists public.driver_asaas_accounts (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  root_customer_id text unique,
  subaccount_id text unique,
  wallet_id text unique,
  status text not null default 'not_created'
    check (status in ('not_created','creating','awaiting_documents','pending','approved','rejected','blocked','error')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asaas_subaccount_credentials (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  vault_secret_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_memberships (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  provider text not null default 'asaas' check (provider='asaas'),
  provider_customer_id text,
  provider_subscription_id text unique,
  current_payment_id text,
  monthly_fee_cents bigint not null default 4990 check (monthly_fee_cents=4990),
  status text not null default 'inactive'
    check (status in ('inactive','pending','active','overdue','cancelled','error')),
  next_due_date date,
  paid_through timestamptz,
  last_payment_status text,
  last_payment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_membership_charges (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  provider_payment_id text not null unique,
  provider_subscription_id text,
  amount_cents bigint not null check (amount_cents=4990),
  due_date date not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','received','overdue','refunded','cancelled','failed')),
  pix_payload text,
  pix_expiration_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists driver_membership_charges_driver_created_idx
  on public.driver_membership_charges(driver_id,created_at desc);

create table if not exists public.ride_pix_payments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null unique references public.rides(id) on delete restrict,
  passenger_id uuid not null references public.users(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  provider text not null default 'asaas' check (provider='asaas'),
  provider_payment_id text not null unique,
  amount_cents bigint not null check (amount_cents>0),
  status text not null default 'pending'
    check (status in ('pending','confirmed','received','overdue','refunded','cancelled','failed')),
  pix_payload text,
  pix_expiration_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ride_pix_payments_passenger_created_idx
  on public.ride_pix_payments(passenger_id,created_at desc);
create index if not exists ride_pix_payments_driver_created_idx
  on public.ride_pix_payments(driver_id,created_at desc);

create table if not exists public.asaas_webhook_events (
  event_id text primary key,
  event_type text not null,
  provider_payment_id text,
  payload jsonb not null,
  status text not null default 'received'
    check (status in ('received','processed','ignored','failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.driver_asaas_accounts enable row level security;
alter table public.asaas_subaccount_credentials enable row level security;
alter table public.driver_memberships enable row level security;
alter table public.driver_membership_charges enable row level security;
alter table public.ride_pix_payments enable row level security;
alter table public.asaas_webhook_events enable row level security;

-- Never expose the Vault mapping, webhook raw payloads or provider credentials
-- to browser/mobile roles. service_role bypasses RLS for Edge Functions.
revoke all on public.asaas_subaccount_credentials from public,anon,authenticated;
revoke all on public.asaas_webhook_events from public,anon,authenticated;

create policy driver_asaas_accounts_read_own on public.driver_asaas_accounts
for select to authenticated using (
  exists(select 1 from public.drivers d
         where d.id=driver_asaas_accounts.driver_id
           and d.user_id=public.mobility_user_id())
);

create policy driver_memberships_read_own on public.driver_memberships
for select to authenticated using (
  exists(select 1 from public.drivers d
         where d.id=driver_memberships.driver_id
           and d.user_id=public.mobility_user_id())
);

create policy driver_membership_charges_read_own on public.driver_membership_charges
for select to authenticated using (
  exists(select 1 from public.drivers d
         where d.id=driver_membership_charges.driver_id
           and d.user_id=public.mobility_user_id())
);

create policy ride_pix_payments_passenger_read_own on public.ride_pix_payments
for select to authenticated using (passenger_id=public.mobility_user_id());
create policy ride_pix_payments_driver_read_own on public.ride_pix_payments
for select to authenticated using (
  exists(select 1 from public.drivers d
         where d.id=ride_pix_payments.driver_id
           and d.user_id=public.mobility_user_id())
);

create or replace function public.store_asaas_subaccount_secret(
  _driver_id uuid,
  _api_key text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_secret_id uuid;
  v_name text;
begin
  if _driver_id is null or nullif(btrim(_api_key),'') is null then
    raise exception 'invalid_asaas_secret' using errcode='22023';
  end if;
  if not exists(select 1 from public.drivers where id=_driver_id) then
    raise exception 'driver_not_found' using errcode='P0002';
  end if;

  v_name:='asaas_driver_'||_driver_id::text||'_api_key';
  select vault_secret_id into v_secret_id
  from public.asaas_subaccount_credentials
  where driver_id=_driver_id
  for update;

  if v_secret_id is null then
    select vault.create_secret(_api_key,v_name,'APOIS Corridas Asaas subaccount API key',null)
      into v_secret_id;
    insert into public.asaas_subaccount_credentials(driver_id,vault_secret_id)
    values(_driver_id,v_secret_id);
  else
    perform vault.update_secret(v_secret_id,_api_key,v_name,'APOIS Corridas Asaas subaccount API key',null);
    update public.asaas_subaccount_credentials set updated_at=now() where driver_id=_driver_id;
  end if;
  return v_secret_id;
end;
$$;
revoke all on function public.store_asaas_subaccount_secret(uuid,text) from public,anon,authenticated;
grant execute on function public.store_asaas_subaccount_secret(uuid,text) to service_role;

create or replace function public.get_asaas_subaccount_secret(_driver_id uuid)
returns text
language sql
security definer
stable
set search_path=''
as $$
  select ds.decrypted_secret
  from public.asaas_subaccount_credentials c
  join vault.decrypted_secrets ds on ds.id=c.vault_secret_id
  where c.driver_id=$1;
$$;
revoke all on function public.get_asaas_subaccount_secret(uuid) from public,anon,authenticated;
grant execute on function public.get_asaas_subaccount_secret(uuid) to service_role;

insert into public.app_settings(key,value,description) values
  ('finance.target_electronic_payment_provider','"asaas"'::jsonb,'Provedor alvo para pagamentos eletrônicos após homologação.'),
  ('finance.target_payout_provider','"asaas"'::jsonb,'Provedor alvo para saques após homologação.'),
  ('finance.driver_monthly_fee_cents','4990'::jsonb,'Mensalidade fixa do motorista em centavos: R$ 49,90.')
on conflict(key) do update set value=excluded.value,description=excluded.description,updated_at=now();
