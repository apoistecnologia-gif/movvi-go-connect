-- Applied in production; synchronized from actual Supabase migration history.
-- Q19: least-privilege on Corridas administrative audit trails.
-- Retains SELECT for authenticated users under the existing
-- RLS policy private.has_permission('audit.read'), requiring AAL2.
-- Service role retains its explicit permissions for secure server logging.
revoke select,insert,update,delete,truncate on table public.audit_logs from anon;
revoke insert,update,delete,truncate on table public.audit_logs from authenticated;
alter table public.audit_logs enable row level security;
