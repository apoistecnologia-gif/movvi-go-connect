-- Trigger-only financial gate functions must not be callable as public RPCs.
-- Their helper is internal as well. The trigger functions become SECURITY DEFINER
-- so authenticated DML continues to enforce the gate after direct helper EXECUTE
-- is revoked from client roles.

alter function public.apois_enforce_passenger_ride_financial_gate() security definer;
alter function public.apois_enforce_passenger_ride_financial_gate() set search_path = pg_catalog, public;
revoke all on function public.apois_enforce_passenger_ride_financial_gate() from public, anon, authenticated;
grant execute on function public.apois_enforce_passenger_ride_financial_gate() to service_role;

alter function public.apois_lock_cancellation_fee_change() security definer;
alter function public.apois_lock_cancellation_fee_change() set search_path = pg_catalog, public;
revoke all on function public.apois_lock_cancellation_fee_change() from public, anon, authenticated;
grant execute on function public.apois_lock_cancellation_fee_change() to service_role;

alter function public.apois_lock_passenger_ride_financial_gate(uuid) set search_path = pg_catalog, public;
revoke all on function public.apois_lock_passenger_ride_financial_gate(uuid) from public, anon, authenticated;
grant execute on function public.apois_lock_passenger_ride_financial_gate(uuid) to service_role;
