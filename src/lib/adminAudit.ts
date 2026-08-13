type LegacyAdminAuditParams = {
  action: string;
  entity: string;
  entity_id?: string | null;
  before?: unknown;
  after?: unknown;
};

/**
 * Compatibility shim for legacy Admin screens while Phase 8 is migrated.
 *
 * DO NOT write audit events from the browser. Critical actions are audited in
 * the canonical SECURITY DEFINER RPC that performs the mutation, so the action
 * and its audit record share one authoritative backend path. The old
 * `admin_audit_logs` table does not exist in the canonical schema.
 *
 * Existing callers may keep awaiting this function during the migration, but
 * it intentionally performs no persistence and must not be treated as audit.
 */
export async function logAdminAction(_params: LegacyAdminAuditParams): Promise<void> {
  return Promise.resolve();
}
