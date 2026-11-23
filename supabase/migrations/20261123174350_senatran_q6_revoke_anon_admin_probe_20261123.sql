-- SENATRAN Q6: elimina execução anônima da verificação administrativa.
-- Migração aplicada na produção Corridas via Supabase em 23/11/2026 (version 20261123174350).
-- Mantém chamada para sessões autenticadas e não altera a função nem usuários existentes.
REVOKE EXECUTE ON FUNCTION public.admin_is_authorized() FROM anon;

-- Reversão, apenas mediante avaliação de risco:
-- GRANT EXECUTE ON FUNCTION public.admin_is_authorized() TO anon;
