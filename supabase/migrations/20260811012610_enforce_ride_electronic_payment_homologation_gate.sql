-- APOIS CORRIDAS — enforce the electronic ride-payment homologation gate at the database boundary.
--
-- The passenger client already hides PIX/credit/debit while
-- finance.ride_electronic_payments_enabled=false, but a custom/stale client could still
-- call passenger-ride-request directly. Because rides are written server-side with the
-- service role, this invariant must also exist below the Edge Function boundary.
--
-- This migration is intentionally non-destructive: it does not mutate existing rides,
-- payment methods, balances, or the homologation setting.

create or replace function private.enforce_ride_electronic_payment_homologation_gate()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  gate_enabled boolean := false;
  raw_gate jsonb;
begin
  if lower(coalesce(new.payment_method, '')) not in ('pix', 'credit', 'debit') then
    return new;
  end if;

  select s.value
    into raw_gate
  from public.app_settings s
  where s.key = 'finance.ride_electronic_payments_enabled'
  limit 1;

  -- Fail closed. Only an explicit true-like value enables real electronic ride rails.
  gate_enabled := case
    when raw_gate is null then false
    when jsonb_typeof(raw_gate) = 'boolean' then coalesce((raw_gate #>> '{}')::boolean, false)
    when jsonb_typeof(raw_gate) = 'string' then lower(coalesce(raw_gate #>> '{}', '')) in ('true', '1', 'yes', 'on')
    when jsonb_typeof(raw_gate) = 'number' then coalesce((raw_gate #>> '{}')::numeric, 0) <> 0
    else false
  end;

  if gate_enabled is not true then
    raise exception 'ride_electronic_payments_not_homologated'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_ride_electronic_payment_homologation_gate() from public;
revoke all on function private.enforce_ride_electronic_payment_homologation_gate() from anon;
revoke all on function private.enforce_ride_electronic_payment_homologation_gate() from authenticated;

drop trigger if exists trg_enforce_ride_electronic_payment_homologation_gate on public.rides;
create trigger trg_enforce_ride_electronic_payment_homologation_gate
before insert or update of payment_method on public.rides
for each row
execute function private.enforce_ride_electronic_payment_homologation_gate();

-- Migration assertions: the trigger must be enabled and its implementation must remain
-- SECURITY INVOKER so this hardening does not expand the SECURITY DEFINER surface.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'enforce_ride_electronic_payment_homologation_gate'
      and p.prosecdef is false
  ) then
    raise exception 'assertion_failed: electronic payment gate function must be SECURITY INVOKER';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.rides'::regclass
      and t.tgname = 'trg_enforce_ride_electronic_payment_homologation_gate'
      and not t.tgisinternal
      and t.tgenabled = 'O'
  ) then
    raise exception 'assertion_failed: electronic payment gate trigger is not enabled';
  end if;
end;
$$;
