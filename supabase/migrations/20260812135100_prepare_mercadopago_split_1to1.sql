create table if not exists public.driver_mercadopago_accounts (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  mercadopago_user_id text unique,
  public_key text,
  live_mode boolean not null default false,
  scopes text[] not null default '{}'::text[],
  status text not null default 'disconnected' check (status in ('disconnected','connected','expired','revoked','error')),
  token_expires_at timestamptz,
  connected_at timestamptz,
  refreshed_at timestamptz,
  disconnected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_mercadopago_credentials (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  encryption_key_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_mercadopago_credentials_not_plaintext check (
    (access_token_ciphertext is null or access_token_ciphertext not like 'APP_USR-%')
    and (refresh_token_ciphertext is null or refresh_token_ciphertext not like 'TG-%')
  )
);

create table if not exists public.mercadopago_oauth_states (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  state_hash text not null unique,
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists mercadopago_oauth_states_driver_idx
  on public.mercadopago_oauth_states(driver_id, created_at desc);
create index if not exists mercadopago_oauth_states_expiry_idx
  on public.mercadopago_oauth_states(expires_at)
  where consumed_at is null;

alter table public.driver_mercadopago_accounts enable row level security;
alter table public.driver_mercadopago_credentials enable row level security;
alter table public.mercadopago_oauth_states enable row level security;

revoke all on public.driver_mercadopago_accounts from anon, authenticated;
revoke all on public.driver_mercadopago_credentials from anon, authenticated;
revoke all on public.mercadopago_oauth_states from anon, authenticated;

grant all on public.driver_mercadopago_accounts to service_role;
grant all on public.driver_mercadopago_credentials to service_role;
grant all on public.mercadopago_oauth_states to service_role;

insert into public.app_settings(key, value)
values
  ('finance.mercadopago_split_1to1_enabled', 'false'::jsonb),
  ('finance.marketplace_ride_commission_cents', '0'::jsonb)
on conflict (key) do update set value = excluded.value;
