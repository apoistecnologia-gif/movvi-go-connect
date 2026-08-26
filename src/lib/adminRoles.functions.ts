// Admin-only role management server functions.
//
// Grant / revoke of privileged roles on public.user_roles is the single most
// dangerous mutation surface in the admin panel — a rogue INSERT here promotes
// any user to admin. RLS already restricts this table, but we add defense in
// depth: the mutation only happens server-side after we verify the caller is
// authenticated AND already holds the `admin` role via the has_role RPC.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["super_admin", "admin", "financial", "operations", "support", "readonly"] as const;
type AdminRole = (typeof ROLES)[number];

function parseRole(role: unknown): AdminRole {
  if (typeof role !== "string" || !ROLES.includes(role as AdminRole)) {
    throw new Error("invalid_role");
  }
  return role as AdminRole;
}

function parseUserId(userId: unknown): string {
  if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error("invalid_user_id");
  }
  return userId;
}

async function assertCallerIsAdmin(ctx: {
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  userId: string;
}) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error("role_check_failed");
  if (!data) throw new Error("forbidden");
}

export const grantAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: string }) => ({
    userId: parseUserId(input.userId),
    role: parseRole(input.role),
  }))
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(
      context as unknown as {
        supabase: {
          rpc: (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{ data: unknown; error: unknown }>;
        };
        userId: string;
      },
    );
    const { supabase } = context;
    // Idempotent: unique(user_id, role) prevents duplicates.
    const { error } = await supabase
      .from("user_roles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ user_id: data.userId, role: data.role } as any);
    if (error && !/duplicate/i.test(error.message)) {
      throw new Error(error.message);
    }
    return { ok: true as const };
  });

export const revokeAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: string }) => ({
    userId: parseUserId(input.userId),
    role: parseRole(input.role),
  }))
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(
      context as unknown as {
        supabase: {
          rpc: (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{ data: unknown; error: unknown }>;
        };
        userId: string;
      },
    );
    const { supabase, userId } = context;
    // Guard: never let an admin revoke their own last `admin` role,
    // otherwise the panel becomes unrecoverable from the UI.
    if (data.role === "admin" && data.userId === userId) {
      throw new Error("cannot_revoke_self_admin");
    }
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("role", data.role as any);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
