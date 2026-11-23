-- SENATRAN Q19 - proposal for controlled rollout, NOT applied to production.
-- Keep application INSERT behavior intact; UPDATE/DELETE on the audit log is blocked.
-- Preflight: verify no legitimate workflow updates/deletes the table. 
-- This is a defense-in-depth measure, not a substitute for offsite immutable storage.
CREATE OR REPLACE FUNCTION private.apois_senatran_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'APOIS security: audit records are append-only'
    USING ERRCODE = '42501';
END
$$;

REVOKE ALL ON FUNCTION private.apois_senatran_reject_audit_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS apois_senatran_audit_append_only ON public.audit_logs;
CREATE TRIGGER apois_senatran_audit_append_only
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION private.apois_senatran_reject_audit_mutation();

-- Rollback in a new, separately reviewed migration:
-- DROP TRIGGER IF EXISTS apois_senatran_audit_append_only ON public.audit_logs;
-- Do not drop the function automatically, because it may be referenced by other triggers.
