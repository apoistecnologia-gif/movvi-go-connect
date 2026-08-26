-- SOS creation and status mutation are canonical RPC operations.
-- Keep authenticated SELECT governed by RLS for own alerts/Admin operations.read,
-- but remove direct client mutation privileges as defense in depth.

REVOKE INSERT, UPDATE, DELETE ON TABLE public.sos_alerts FROM anon, authenticated;
GRANT SELECT ON TABLE public.sos_alerts TO authenticated;
