-- P0 security hardening: remove unintended client EXECUTE privileges from SECURITY DEFINER functions.
-- Keep only the deliberately public shared-ride lookup callable by anon.

-- Trigger-only SECURITY DEFINER functions must never be exposed through PostgREST RPC.
REVOKE ALL ON FUNCTION public.append_nearby_busy_driver_candidates() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.append_nearby_busy_driver_candidates() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_nearby_busy_driver_candidates() TO service_role;

REVOKE ALL ON FUNCTION public.credit_driver_cancellation_fee() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_driver_cancellation_fee() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_driver_cancellation_fee() TO service_role;

REVOKE ALL ON FUNCTION public.sync_driver_presence_to_active_rides() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_driver_presence_to_active_rides() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_driver_presence_to_active_rides() TO service_role;

-- Authenticated passenger/driver RPCs: function bodies enforce caller identity/ownership.
REVOKE ALL ON FUNCTION public.create_passenger_share_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_passenger_share_token(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_passenger_share_token(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_passenger_sos(uuid, numeric, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_passenger_sos(uuid, numeric, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_passenger_sos(uuid, numeric, numeric, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.driver_complete_registration_v2(text, text, text, date, text, text, text, text, text, text, integer, text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.driver_complete_registration_v2(text, text, text, date, text, text, text, text, text, text, integer, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.driver_complete_registration_v2(text, text, text, date, text, text, text, text, text, text, integer, text, text, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revoke_passenger_share_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_passenger_share_token(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_passenger_share_token(uuid) TO authenticated, service_role;

-- public.get_shared_passenger_ride(uuid) intentionally remains executable by anon:
-- it is the token-gated public share surface and returns only the limited shared-ride projection.
