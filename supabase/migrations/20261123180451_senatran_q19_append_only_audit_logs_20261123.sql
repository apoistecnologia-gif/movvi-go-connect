-- SENATRAN Q19. Applied to the respective production Supabase project on 2026-11-23.
-- Restrict modifications of the main audit log; preserve INSERT for privileged logging.
CREATE OR REPLACE FUNCTION private.apois_q19_block_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $q19$
BEGIN
  RAISE EXCEPTION 'APOIS Q19: audit log is append-only (operation %, table %)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$q19$;
REVOKE ALL ON FUNCTION private.apois_q19_block_audit_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER apois_q19_audit_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION private.apois_q19_block_audit_mutation();
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM anon, authenticated, service_role;

-- Reversal (approved change only):
-- DROP TRIGGER apois_q19_audit_append_only ON public.audit_logs;
-- GRANT UPDATE, DELETE, TRUNCATE ON public.audit_logs TO service_role;
-- DROP FUNCTION private.apois_q19_block_audit_mutation();
