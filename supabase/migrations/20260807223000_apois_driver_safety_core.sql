create table if not exists public.driver_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  name text not null,
  phone text not null,
  relation text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists driver_emergency_contacts_driver_idx on public.driver_emergency_contacts(driver_id,is_primary desc,created_at);
create unique index if not exists driver_emergency_contacts_one_primary_idx on public.driver_emergency_contacts(driver_id) where is_primary=true;

create table if not exists public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  lat numeric,
  lng numeric,
  message text,
  status text not null default 'open' check(status in ('open','acknowledged','resolved','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sos_alerts_user_created_idx on public.sos_alerts(user_id,created_at desc);

alter table public.driver_emergency_contacts enable row level security;
alter table public.sos_alerts enable row level security;

drop policy if exists driver_emergency_contacts_own_all on public.driver_emergency_contacts;
create policy driver_emergency_contacts_own_all on public.driver_emergency_contacts for all to authenticated
using(exists(select 1 from public.drivers d where d.id=driver_emergency_contacts.driver_id and d.user_id=public.mobility_user_id()))
with check(exists(select 1 from public.drivers d where d.id=driver_emergency_contacts.driver_id and d.user_id=public.mobility_user_id()));

drop policy if exists sos_alerts_insert_own on public.sos_alerts;
create policy sos_alerts_insert_own on public.sos_alerts for insert to authenticated
with check(user_id=public.mobility_user_id() and (driver_id is null or exists(select 1 from public.drivers d where d.id=sos_alerts.driver_id and d.user_id=public.mobility_user_id())));

drop policy if exists sos_alerts_read_own on public.sos_alerts;
create policy sos_alerts_read_own on public.sos_alerts for select to authenticated
using(user_id=public.mobility_user_id());
