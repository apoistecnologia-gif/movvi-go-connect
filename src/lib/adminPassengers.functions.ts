// Admin-only passenger mutations — moved off the browser so the write only
// happens after the server verifies the caller is authenticated AND holds the
// `admin` role. RLS on public.users already restricts these columns to
// admins, but we add defense in depth + input validation here.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const reason = z.string().trim().min(1).max(500);
const optionalReason = z.string().trim().max(500).optional().nullable();

type AuthedCtx = {
  supabase: {
    from: (t: string) => {
      update: (patch: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
      delete: () => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
    };
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  userId: string;
};

async function assertAdmin(ctx: AuthedCtx) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error("role_check_failed");
  if (!data) throw new Error("forbidden");
}

export const suspendPassenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; reason?: string | null }) =>
    z.object({ id: uuid, reason: optionalReason }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthedCtx);
    const patch = {
      suspended_at: new Date().toISOString(),
      block_reason: data.reason ? data.reason.trim() : null,
    };
    const { error } = await context.supabase.from("users").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const unsuspendPassenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthedCtx);
    const { error } = await context.supabase
      .from("users")
      .update({ suspended_at: null, block_reason: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const blockPassenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; reason: string }) =>
    z.object({ id: uuid, reason }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthedCtx);
    const { error } = await context.supabase
      .from("users")
      .update({ blocked_at: new Date().toISOString(), block_reason: data.reason })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const unblockPassenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthedCtx);
    const { error } = await context.supabase
      .from("users")
      .update({ blocked_at: null, block_reason: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deletePassenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthedCtx);
    const { error } = await context.supabase.from("users").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
