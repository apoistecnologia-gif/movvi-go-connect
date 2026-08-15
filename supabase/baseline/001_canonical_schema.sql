-- APOIS CORRIDAS — CANONICAL BASELINE 001
-- Derived from the live schema of vqtucstyduxrqjgyigfk on 2026-08-08.
-- Intended for a FRESH Supabase-compatible database only.
-- NEVER run this file over production as an incremental migration.

create extension if not exists pgcrypto;
create schema if not exists private;

create type public.app_role as enum ('administrator','editor','marketing','support','reader');
create type public.asset_kind as enum ('image','video','pdf','logo','icon','banner','document');
create type public.content_status as enum ('draft','scheduled','published','archived');
create type public.submission_kind as enum ('company','contact','newsletter','download');
create type public.submission_status as enum ('new','in_progress','completed','spam','archived');

create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  avatar_url text,
  city text,
  cpf text,
  birth_date date,
  gender text,
  average_rating numeric(3,2),
  total_ratings integer not null default 0 check (total_ratings >= 0),
  completed_rides integer not null default 0 check (completed_rides >= 0),
  preferences jsonb not null default '{}'::jsonb,
  blocked_at timestamptz,
  block_reason text,
  suspended_at timestamptz,
  suspended_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  terms_accepted_at timestamptz,
  terms_version text,
  privacy_accepted_at timestamptz,
  privacy_version text,
  legal_acceptance_source text
);
create unique index users_email_unique_active on public.users (lower(email)) where email is not null and deleted_at is null;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('passenger','driver','admin','support','operations','financial')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role public.app_role not null default 'reader',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_permissions (
  role public.app_role not null,
  permission text not null,
  primary key (role, permission)
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  category text,
  vehicle_plate text,
  vehicle_model text,
  vehicle_color text,
  photo_url text,
  approval_status text not null default 'pendente',
  subscription_status text not null default 'teste',
  is_online boolean not null default false,
  rating numeric(3,2),
  total_ratings integer not null default 0,
  current_lat numeric(10,8),
  current_lng numeric(11,8),
  current_heading numeric,
  last_location_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cpf text,
  birth_date date,
  city text,
  state text,
  vehicle_year integer,
  selfie_url text,
  cnh_url text,
  cnh_back_url text,
  vehicle_document_url text,
  documents_status text,
  motivo_reprovacao text,
  current_speed numeric,
  approved_at timestamptz,
  blocked_at timestamptz,
  suspended_at timestamptz,
  vehicle_photo_url text
);
create index drivers_dispatch_idx on public.drivers(category,is_online,approval_status,subscription_status,last_location_at);

create table public.ride_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('carros','motos','fretes','guincho','envios')),
  name text not null,
  description text,
  icon text,
  image_url text,
  capacity_label text,
  eta_label text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tariff_rules (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.ride_categories(id) on delete cascade,
  city text not null default 'default',
  base_fare numeric(10,2) not null default 0 check (base_fare >= 0),
  min_fare numeric(10,2) not null default 0 check (min_fare >= 0),
  per_km numeric(10,2) not null default 0 check (per_km >= 0),
  per_min numeric(10,2) not null default 0 check (per_min >= 0),
  stop_fee numeric(10,2) not null default 0 check (stop_fee >= 0),
  fixed_fee numeric(10,2) not null default 0 check (fixed_fee >= 0),
  dynamic_multiplier numeric(6,3) not null default 1 check (dynamic_multiplier > 0),
  is_active boolean not null default true,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  helper1_fee numeric(10,2) not null default 0 check (helper1_fee >= 0),
  helper2_fee numeric(10,2) not null default 0 check (helper2_fee >= 0),
  heavy_furniture_fee numeric(10,2) not null default 0 check (heavy_furniture_fee >= 0),
  assembly_fee numeric(10,2) not null default 0 check (assembly_fee >= 0),
  packing_fee numeric(10,2) not null default 0 check (packing_fee >= 0),
  difficult_access_fee numeric(10,2) not null default 0 check (difficult_access_fee >= 0),
  stair_fee numeric(10,2) not null default 0 check (stair_fee >= 0),
  heavy_vehicle_fee numeric(10,2) not null default 0 check (heavy_vehicle_fee >= 0),
  accident_fee numeric(10,2) not null default 0 check (accident_fee >= 0),
  platform_fee numeric(10,2) not null default 0 check (platform_fee >= 0),
  locked_wheels_fee numeric(10,2) not null default 0 check (locked_wheels_fee >= 0),
  garage_fee numeric(10,2) not null default 0 check (garage_fee >= 0),
  max_weight_kg numeric(10,2) not null default 0 check (max_weight_kg >= 0),
  per_kg numeric(10,2) not null default 0 check (per_kg >= 0),
  unique(category_id,city)
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('pix','credit','debit','cash','wallet','credit_card','debit_card')),
  name text not null,
  description text,
  icon text,
  requires_balance boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create table public.rides (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.users(id),
  driver_id uuid references public.drivers(id),
  accepted_driver_id uuid references public.drivers(id),
  category text not null check (category in ('carros','motos','fretes','guincho','envios')),
  status text not null default 'procurar_motorista' check (status in ('agendada','procurar_motorista','motorista_a_caminho','motorista_chegou','em_viagem','finalizada','cancelada_passageiro','cancelada_motorista','expired')),
  origin jsonb not null,
  destination jsonb not null,
  intermediates jsonb not null default '[]'::jsonb,
  origin_name text not null,
  destination_name text not null,
  origin_lat numeric(10,8) not null,
  origin_lng numeric(11,8) not null,
  destination_lat numeric(10,8) not null,
  destination_lng numeric(11,8) not null,
  encoded_polyline text,
  estimated_price numeric(10,2) not null check (estimated_price >= 0),
  final_price numeric(10,2),
  distance_km numeric(10,2),
  duration_min numeric(10,2),
  payment_method text not null,
  service_details jsonb,
  request_key uuid not null unique,
  candidate_driver_ids uuid[] not null default '{}',
  offered_driver_ids uuid[] not null default '{}',
  rejected_driver_ids uuid[] not null default '{}',
  current_offer_driver_id uuid,
  dispatch_attempts integer not null default 0,
  request_expires_at timestamptz,
  search_expires_at timestamptz,
  scheduled_for timestamptz,
  security_code text,
  driver_name text,
  driver_photo text,
  driver_phone text,
  driver_vehicle_model text,
  driver_vehicle_color text,
  driver_vehicle_plate text,
  driver_rating numeric(3,2),
  driver_latitude numeric(10,8),
  driver_longitude numeric(11,8),
  driver_heading numeric,
  passenger_rating numeric(2,1),
  passenger_rating_comment text,
  share_token uuid unique,
  cancellation_fee numeric(10,2),
  cancellation_reason text,
  cancelled_by text,
  accepted_at timestamptz,
  driver_arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  pickup_label text,
  pickup_short_label text,
  pickup_address text,
  pickup_place_id text,
  pickup_source text,
  driver_rated_at timestamptz,
  passenger_rated_at timestamptz,
  queued_after_ride_id uuid references public.rides(id) on delete set null,
  queued_at timestamptz
);
create index rides_active_driver_idx on public.rides(driver_id,status) where driver_id is not null;
create index rides_active_passenger_idx on public.rides(passenger_id,status) where status in ('agendada','procurar_motorista','motorista_a_caminho','motorista_chegou','em_viagem');
create index rides_driver_active_idx on public.rides(driver_id,status) where driver_id is not null and status in ('motorista_a_caminho','motorista_chegou','em_viagem');
create unique index rides_one_active_per_passenger_idx on public.rides(passenger_id) where status in ('procurar_motorista','motorista_a_caminho','motorista_chegou','em_viagem');
create unique index rides_one_queued_per_driver_idx on public.rides(driver_id) where queued_after_ride_id is not null and status='procurar_motorista' and driver_id is not null;
create index rides_passenger_created_idx on public.rides(passenger_id,created_at desc);
create index rides_queued_after_idx on public.rides(queued_after_ride_id,queued_at) where queued_after_ride_id is not null;
create index rides_request_key_passenger_idx on public.rides(passenger_id,request_key);

create table public.cancellation_fees (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid references public.rides(id),
  passenger_id uuid not null references public.users(id),
  amount numeric(10,2) not null check (amount > 0),
  reason text,
  status text not null default 'pending' check (status in ('pending','open','unpaid','processing','paid','cancelled','failed')),
  provider text,
  provider_payment_id text,
  qr_code text,
  qr_code_base64 text,
  ticket_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fee_amount numeric(10,2),
  value numeric(10,2),
  is_paid boolean not null default false,
  mp_payment_id text,
  mp_payment_status text,
  mp_qr_code text,
  mp_qr_code_base64 text,
  mp_ticket_url text,
  mp_expires_at timestamptz,
  mp_order_id text,
  mp_order_status text,
  mp_order_status_detail text
);
create unique index cancellation_fees_one_per_ride_idx on public.cancellation_fees(ride_id) where ride_id is not null;
create unique index cancellation_fees_mp_payment_id_uidx on public.cancellation_fees(mp_payment_id) where mp_payment_id is not null;
create index cancellation_fees_mp_order_id_idx on public.cancellation_fees(mp_order_id) where mp_order_id is not null;
create index cancellation_fees_passenger_status_idx on public.cancellation_fees(passenger_id,status,created_at);

create table public.passenger_wallets (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null unique references public.users(id) on delete cascade,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  currency text not null default 'BRL' check (currency='BRL'),
  is_blocked boolean not null default false,
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.driver_wallets (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  available_balance numeric(12,2) not null default 0 check (available_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.driver_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  direction text not null check (direction in ('credit','debit')),
  source text not null,
  source_id uuid,
  description text,
  created_at timestamptz not null default now(),
  unique(driver_id,source,source_id)
);
create index driver_wallet_transactions_driver_created_idx on public.driver_wallet_transactions(driver_id,created_at desc);

create table public.driver_withdrawals (
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
create index driver_withdrawals_driver_requested_idx on public.driver_withdrawals(driver_id,requested_at desc);

create table public.payment_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null unique,
  request_id text,
  status text not null default 'processing',
  detail text,
  raw_payload jsonb not null default '{}',
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications(user_id,created_at desc);

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  ride_id uuid references public.rides(id) on delete set null,
  event text not null,
  channel text not null default 'fcm',
  title text not null,
  body text,
  data jsonb not null default '{}',
  status text not null check (status in ('sent','failed','suppressed','no_token')),
  created_at timestamptz not null default now()
);

create table public.user_notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  ride_updates boolean not null default true,
  promotions boolean not null default false,
  safety_alerts boolean not null default true,
  payment_updates boolean not null default true,
  accessibility_large_text boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ride_requests boolean not null default true
);

create table public.user_notification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android','ios','web')),
  device_id text,
  permission_status text not null default 'granted',
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,token)
);
alter table public.user_notification_tokens add constraint user_notification_tokens_permission_status_check check (permission_status in ('granted','provisional','denied')) not valid;
create index user_notification_tokens_active_user_idx on public.user_notification_tokens(user_id) where is_active=true;
create index user_notification_tokens_device_idx on public.user_notification_tokens(platform,device_id) where device_id is not null;

create table public.passenger_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  phone text not null check (char_length(regexp_replace(phone,'\D','','g')) between 10 and 15),
  relationship text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index passenger_one_primary_emergency_contact on public.passenger_emergency_contacts(passenger_id) where is_primary;

create table public.driver_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  name text not null,
  phone text not null,
  relation text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index driver_emergency_contacts_one_primary_idx on public.driver_emergency_contacts(driver_id) where is_primary=true;
create index driver_emergency_contacts_driver_idx on public.driver_emergency_contacts(driver_id,is_primary desc,created_at);

create table public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  lat numeric,
  lng numeric,
  message text,
  status text not null default 'open' check (status in ('open','acknowledged','resolved','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sos_alerts_user_created_idx on public.sos_alerts(user_id,created_at desc);

create table public.passenger_support_tickets (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique,
  passenger_id uuid not null references public.users(id),
  ride_id uuid references public.rides(id),
  category text not null,
  subject text not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  priority text not null default 'normal'
);

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'passageiro',
  status text not null default 'requested',
  reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index account_deletion_requests_user_idx on public.account_deletion_requests(user_id,created_at desc);

create table public.admin_driver_notes (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  admin_id uuid not null references auth.users(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- Admin/CMS tables retained because the Admin is part of the same ecosystem.
create table public.content_documents (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('home','drivers','passengers','companies','blog','help','faq','downloads','banners','seo','settings','social','contact','footer','map')),
  slug text not null,
  locale text not null default 'pt-BR' check (locale in ('pt-BR','en-US','es')),
  title text not null,
  payload jsonb not null default '{}' check (jsonb_typeof(payload)='object'),
  status public.content_status not null default 'draft',
  sort_order integer not null default 0,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(domain,slug,locale),
  check (status <> 'scheduled' or scheduled_at is not null)
);
create index content_documents_created_by_idx on public.content_documents(created_by) where created_by is not null;
create index content_documents_payload_gin on public.content_documents using gin(payload jsonb_path_ops);
create index content_documents_publication_idx on public.content_documents(domain,status,scheduled_at,sort_order);
create index content_documents_slug_idx on public.content_documents(slug,locale);
create index content_documents_updated_by_idx on public.content_documents(updated_by) where updated_by is not null;

create table public.content_versions (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.content_documents(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  change_kind text not null check (change_kind in ('create','update','delete','publish','unpublish','schedule','duplicate','autosave')),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(document_id,version_number)
);
create index content_versions_actor_id_idx on public.content_versions(actor_id) where actor_id is not null;
create index content_versions_document_idx on public.content_versions(document_id,version_number desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_actor_idx on public.audit_logs(actor_id,created_at desc) where actor_id is not null;
create index audit_logs_entity_idx on public.audit_logs(entity_type,entity_id,created_at desc);

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  kind public.submission_kind not null,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  status public.submission_status not null default 'new',
  consent boolean not null default false,
  source text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index form_submissions_assigned_to_idx on public.form_submissions(assigned_to) where assigned_to is not null;
create index form_submissions_kind_status_idx on public.form_submissions(kind,status,created_at desc);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (bucket in ('public-media','documents')),
  path text not null,
  kind public.asset_kind not null,
  title text not null,
  alt_text text not null default '',
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  category text,
  tags text[] not null default '{}',
  status public.content_status not null default 'draft',
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bucket,path)
);
create index media_assets_kind_status_idx on public.media_assets(kind,status,created_at desc);
create index media_assets_owner_id_idx on public.media_assets(owner_id) where owner_id is not null;
create index media_assets_tags_gin on public.media_assets using gin(tags);

-- Every public application table is RLS-protected. Policies are defined in 003_rls.sql.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;
