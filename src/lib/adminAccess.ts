/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { supabase } from "@/integrations/supabase/client";

export type AdminAccessContext = {
  authorized: boolean;
  role: string;
  displayName: string | null;
  email: string | null;
  permissions: string[];
};

type ProfileRow = {
  role: string;
  display_name: string | null;
  email: string | null;
  active: boolean;
};

const MAX_PERMISSION_COUNT = 250;
const MAX_PERMISSION_LENGTH = 120;

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function cleanRole(value: unknown): string {
  return cleanText(value, 64).toLowerCase();
}

function cleanEmail(value: unknown): string | null {
  const email = cleanText(value, 254).toLowerCase();
  if (!email || !email.includes("@") || email.startsWith("@") || email.endsWith("@")) return null;
  return email;
}

function normalizePermissions(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of rows) {
    if (result.length >= MAX_PERMISSION_COUNT) break;
    const permission = cleanText((item as { permission?: unknown } | null)?.permission, MAX_PERMISSION_LENGTH)
      .toLowerCase();
    if (!permission || !/^[a-z0-9_.:-]+$/.test(permission) || seen.has(permission)) continue;
    seen.add(permission);
    result.push(permission);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

/**
 * Canonical Admin identity is auth.users.id -> public.profiles.user_id.
 * Mobility public.user_roles is deliberately NOT consulted here.
 *
 * Falhas de infraestrutura/autenticação lançam erro para que a UI possa
 * diferenciar indisponibilidade temporária de uma conta realmente não-admin.
 * Ausência de autorização/perfil ativo continua retornando null.
 */
export async function loadAdminAccess(): Promise<AdminAccessContext | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error("admin_auth_unavailable");
  const authUserId = cleanText(authData.user?.id, 128);
  if (!authUserId || !authData.user) return null;

  const db = supabase as any;
  const { data: allowed, error: accessError } = await db.rpc("admin_is_authorized");
  if (accessError) throw new Error("admin_authorization_unavailable");
  if (allowed !== true) return null;

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("role,display_name,email,active")
    .eq("user_id", authUserId)
    .maybeSingle();
  if (profileError) throw new Error("admin_profile_unavailable");
  if (!profile || profile.active !== true) return null;

  const row = profile as ProfileRow;
  const role = cleanRole(row.role);
  if (!role || !/^[a-z0-9_-]+$/.test(role)) return null;

  const { data: permissionRows, error: permissionError } = await db
    .from("role_permissions")
    .select("permission")
    .eq("role", role)
    .order("permission", { ascending: true });
  if (permissionError) throw new Error("admin_permissions_unavailable");

  return {
    authorized: true,
    role,
    displayName: cleanText(row.display_name, 120) || null,
    email: cleanEmail(row.email) ?? cleanEmail(authData.user.email),
    permissions: normalizePermissions(permissionRows),
  };
}

export function hasAdminPermission(
  access: AdminAccessContext | null | undefined,
  permission: string,
): boolean {
  const normalized = cleanText(permission, MAX_PERMISSION_LENGTH).toLowerCase();
  if (!normalized || !access?.authorized) return false;
  return access.permissions.includes(normalized);
}
