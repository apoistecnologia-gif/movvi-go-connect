-- APOIS Corridas: harden private SOS/share function entrypoints.
-- Public wrappers remain the only client-callable surface; implementation
-- functions in apois_rpc_private are executable only by trusted owners/service role.

ALTER FUNCTION public.create_driver_sos(numeric, numeric, text, text) SECURITY DEFINER;
ALTER FUNCTION public.create_passenger_sos(uuid, numeric, numeric, text, text) SECURITY DEFINER;
ALTER FUNCTION public.create_passenger_share_token(uuid) SECURITY DEFINER;
ALTER FUNCTION public.revoke_passenger_share_token(uuid) SECURITY DEFINER;
ALTER FUNCTION public.get_shared_passenger_ride(uuid) SECURITY DEFINER;

REVOKE ALL ON FUNCTION apois_rpc_private.create_driver_sos(numeric, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION apois_rpc_private.create_passenger_sos(uuid, numeric, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION apois_rpc_private.create_passenger_share_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION apois_rpc_private.revoke_passenger_share_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION apois_rpc_private.get_shared_passenger_ride(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION apois_rpc_private.create_driver_sos(numeric, numeric, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION apois_rpc_private.create_passenger_sos(uuid, numeric, numeric, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION apois_rpc_private.create_passenger_share_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION apois_rpc_private.revoke_passenger_share_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION apois_rpc_private.get_shared_passenger_ride(uuid) TO service_role;

-- Preserve the intended client-facing grants explicitly.
REVOKE ALL ON FUNCTION public.create_driver_sos(numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_driver_sos(numeric, numeric, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_passenger_sos(uuid, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_passenger_sos(uuid, numeric, numeric, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_passenger_share_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_passenger_share_token(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revoke_passenger_share_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_passenger_share_token(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_shared_passenger_ride(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_passenger_ride(uuid) TO anon, authenticated, service_role;
