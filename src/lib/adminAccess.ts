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

/**
 * Canonical Admin identity is auth.users.id -> public.profiles.user_id.
 * Mobility public.user_roles is deliberately NOT consulted here.
 *
 * The function uses primitives already present in the official project:
 * admin_is_authorized(), profiles and role_permissions. Baseline 011 keeps
 * those contracts and adds richer server-side Admin operations.
 */
export async function loadAdminAccess(): Promise<AdminAccessContext | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const db = supabase as any;
  const { data: allowed, error: accessError } = await db.rpc("admin_is_authorized");
  if (accessError || allowed !== true) return null;

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("role,display_name,email,active")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile || profile.active !== true) return null;

  const row = profile as ProfileRow;
  const { data: permissionRows, error: permissionError } = await db
    .from("role_permissions")
    .select("permission")
    .eq("role", row.role)
    .order("permission", { ascending: true });
  if (permissionError) return null;

  return {
    authorized: true,
    role: row.role,
    displayName: row.display_name,
    email: row.email ?? authData.user.email ?? null,
    permissions: (permissionRows ?? [])
      .map((item: { permission?: unknown }) => String(item.permission ?? "").trim())
      .filter(Boolean),
  };
}

export function hasAdminPermission(
  access: AdminAccessContext | null | undefined,
  permission: string,
): boolean {
  return Boolean(access?.authorized && access.permissions.includes(permission));
}
