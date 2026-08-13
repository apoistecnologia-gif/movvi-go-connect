-- APOIS CORRIDAS — CANONICAL BASELINE 005
-- Phase 2 security hardening for a FRESH database only.
-- Do not run this file as an ad-hoc production script.

-- A driver must read a searching ride only when it was actually offered to
-- that mobility user. candidate_driver_ids is internal dispatch bookkeeping;
-- offered_driver_ids is the client-visible offer authorization boundary.
drop policy if exists rides_driver_read_relevant on public.rides;
create policy rides_driver_read_relevant on public.rides
for select to authenticated
using (
  public.mobility_user_id() = any(coalesce(offered_driver_ids, '{}'::uuid[]))
  or exists (
    select 1
    from public.drivers d
    where d.user_id = public.mobility_user_id()
      and (d.id = rides.driver_id or d.id = rides.accepted_driver_id)
  )
);

-- Baseline invariant: no client may write payment webhook receipts.
-- Kept explicit here because this table is a financial trust boundary.
drop policy if exists payment_webhook_receipts_no_client_access on public.payment_webhook_receipts;
create policy payment_webhook_receipts_no_client_access on public.payment_webhook_receipts
for all to anon, authenticated
using (false)
with check (false);
