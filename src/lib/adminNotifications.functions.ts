// Admin-only notification broadcast. Server verifies admin role, resolves the
// recipient scope, enforces size limits, and inserts inbox + broadcast rows.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AUDIENCES = ["all", "drivers", "passengers", "city", "category", "driver", "passenger"] as const;
type Audience = (typeof AUDIENCES)[number];

const MAX_RECIPIENTS = 50_000;
const MAX_INSERT_BATCH = 500;

const audienceSchema = z.enum(AUDIENCES);
const titleSchema = z.string().trim().min(1).max(120);
const bodySchema = z.string().trim().min(1).max(2000);
const filterSchema = z.string().trim().max(120).optional().nullable();

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error("role_check_failed");
  if (!data) throw new Error("forbidden");
}

async function resolveRecipients(
  supabase: any,
  audience: Audience,
  filter: string | null,
): Promise<string[]> {
  const needsFilter = audience === "city" || audience === "category" || audience === "driver" || audience === "passenger";
  if (needsFilter && !filter) throw new Error("missing_filter");

  if (audience === "driver" || audience === "passenger") {
    return filter ? [filter] : [];
  }
  if (audience === "all") {
    const [d, p] = await Promise.all([
      supabase.from("drivers").select("user_id"),
      supabase.from("users").select("auth_user_id"),
    ]);
    const ids = new Set<string>();
    for (const r of (d.data ?? []) as { user_id: string }[]) r.user_id && ids.add(r.user_id);
    for (const r of (p.data ?? []) as { auth_user_id: string }[]) r.auth_user_id && ids.add(r.auth_user_id);
    return Array.from(ids);
  }
  if (audience === "drivers") {
    const { data } = await supabase.from("drivers").select("user_id");
    return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id).filter(Boolean);
  }
  if (audience === "passengers") {
    const { data } = await supabase.from("users").select("auth_user_id");
    return ((data ?? []) as { auth_user_id: string }[]).map((r) => r.auth_user_id).filter(Boolean);
  }
  if (audience === "city") {
    const [d, p] = await Promise.all([
      supabase.from("drivers").select("user_id").ilike("city", filter!),
      supabase.from("users").select("auth_user_id").ilike("city", filter!),
    ]);
    const ids = new Set<string>();
    for (const r of (d.data ?? []) as { user_id: string }[]) r.user_id && ids.add(r.user_id);
    for (const r of (p.data ?? []) as { auth_user_id: string }[]) r.auth_user_id && ids.add(r.auth_user_id);
    return Array.from(ids);
  }
  if (audience === "category") {
    const { data } = await supabase.from("drivers").select("user_id").eq("category", filter as never);
    return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id).filter(Boolean);
  }
  return [];
}

export const sendAdminBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title: string; body: string; audience: Audience; filter: string | null }) =>
    z
      .object({
        title: titleSchema,
        body: bodySchema,
        audience: audienceSchema,
        filter: filterSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;

    const filter = data.filter?.trim() || null;
    const recipients = await resolveRecipients(supabase, data.audience, filter);
    if (recipients.length === 0) throw new Error("no_recipients");
    if (recipients.length > MAX_RECIPIENTS) throw new Error("too_many_recipients");

    // Dedupe defensively
    const unique = Array.from(new Set(recipients));

    // Insert inbox rows in batches to avoid oversized payloads.
    for (let i = 0; i < unique.length; i += MAX_INSERT_BATCH) {
      const chunk = unique.slice(i, i + MAX_INSERT_BATCH);
      const rows = chunk.map((user_id) => ({
        user_id,
        title: data.title,
        body: data.body,
        category: "admin",
        data: { audience: data.audience, filter },
      }));
      const { error } = await supabase.from("notification_inbox").insert(rows);
      if (error) throw new Error(error.message);
    }

    const { error: bErr } = await supabase.from("notifications_broadcast").insert({
      title: data.title,
      body: data.body,
      audience_type: data.audience,
      audience_filter: filter ? { value: filter } : null,
      sent_by: userId,
      delivery_count: unique.length,
    });
    if (bErr) throw new Error(bErr.message);

    return { ok: true as const, delivered: unique.length };
  });
