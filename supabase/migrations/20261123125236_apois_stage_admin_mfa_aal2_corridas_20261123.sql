-- APOIS / SENATRAN — preparo reversível da exigência de MFA (AAL2).
-- Migração já aplicada em produção; sincronizada com o histórico do Supabase.
-- NÃO ativar enforce_aal2 até que o fluxo TOTP do painel oficial tenha sido
-- publicado, testado por administradores reais e exista recuperação de acesso.
create table if not exists private.apois_admin_mfa_enforcement (
  singleton boolean primary key default true check (singleton),
  enforce_aal2 boolean not null default false,
  updated_at timestamptz not null default now()
);
revoke all on table private.apois_admin_mfa_enforcement from public, anon, authenticated;
alter table private.apois_admin_mfa_enforcement enable row level security;
insert into private.apois_admin_mfa_enforcement (singleton, enforce_aal2)
values (true, false) on conflict (singleton) do nothing;

create or replace function private.apois_admin_mfa_ok()
returns boolean
language sql stable security invoker set search_path = ''
as $f$
  select not coalesce(
    (select enforce_aal2 from private.apois_admin_mfa_enforcement where singleton),
    false
  ) or coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$f$;
revoke all on function private.apois_admin_mfa_ok() from public, anon, authenticated;

create or replace function private.has_permission(required_permission text)
returns boolean
language sql stable security definer set search_path to ''
as $f$
  select (select auth.uid()) is not null
    and private.apois_admin_mfa_ok()
    and exists (
      select 1 from public.profiles p
      join public.role_permissions rp on rp.role = p.role
      where p.user_id = (select auth.uid())
        and p.active
        and rp.permission = required_permission
    );
$f$;
