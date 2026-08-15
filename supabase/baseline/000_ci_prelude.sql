-- CI ONLY — emulates the minimum Supabase-managed schemas/roles needed to syntax-test
-- the APOIS baseline on an empty PostgreSQL database. Never deploy this file to Supabase.

create extension if not exists pgcrypto;

do $$ begin create role anon noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role noinherit bypassrls; exception when duplicate_object then null; end $$;

create schema if not exists auth;
create schema if not exists storage;

grant usage on schema public,auth,storage to anon,authenticated,service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id) on delete cascade,
  name text not null,
  owner_id text
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select regexp_split_to_array(trim(both '/' from coalesce(name,'')),'/');
$$;
