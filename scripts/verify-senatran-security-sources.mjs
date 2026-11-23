// SENATRAN: static assertions in GitHub CI (not a functional substitute for database tests).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync('supabase/config.toml', 'utf8');
assert.match(config, /^project_id\s*=\s*["']tbbzkrfupmqdywnzgnms["']/m, 'Supabase CLI config must refer to official project');
const auditMigration = readFileSync('supabase/migrations/20261123190002_senatran_q19_append_only_audit_logs.sql', 'utf8');
assert.match(auditMigration, /CREATE TRIGGER apois_senatran_audit_append_only/);
assert.match(auditMigration, /BEFORE UPDATE OR DELETE ON public\.audit_logs/);
assert.match(auditMigration, /RAISE EXCEPTION/);
assert.match(auditMigration, /REVOKE ALL ON FUNCTION private\./);
console.info('SENATRAN source controls OK (not deployed or runtime tested)');
