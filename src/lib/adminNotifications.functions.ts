/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
// APOIS CORRIDAS — Admin notification broadcast.
// Audience resolution uses canonical public.users.id and delivery is delegated
// to the FCM notification engine (send-ride-push). The UI never claims an
// inbox insert is a delivered push.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AUDIENCES = [
  "all",
  "drivers",
  "passengers",
  "city",
  "category",
  "driver",
  "passenger",
] as const;
type Audience = (typeof AUDIENCES)[number];

const MAX_RECIPIENTS = 50_000;
const audienceSchema = z.enum(AUDIENCES);
const titleSchema = z.string().trim().min(1).max(100);
const bodySchema = z.string().trim().min(1).max(500);
const filterSchema = z.string().trim().max(120).optional().nullable();

async function assertPermission(ctx: { supabase: any }, permission: string) {
  const { data, error } = await ctx.supabase.rpc("admin_has_permission", {
    _permission: permission,
  });
  if (error) throw new Error("permission_check_failed");
  if (data !== true) throw new Error("forbidden");
}

async function resolveSpecificProfileId(supabase: any, rawId: string): Promise<string | null> {
  const { data: direct } = await supabase
    .from("users")
    .select("id")
    .eq("id", rawId)
    .is("deleted_at", null)
    .maybeSingle();
  if (direct?.id) return String(direct.id);

  const { data: authMatch } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", rawId)
    .is("deleted_at", null)
    .maybeSingle();
  if (authMatch?.id) return String(authMatch.id);

  const { data: driverMatch } = await supabase
    .from("drivers")
    .select("user_id")
    .eq("id", rawId)
    .maybeSingle();
  return driverMatch?.user_id ? String(driverMatch.user_id) : null;
}

async function resolveRecipients(
  supabase: any,
  audience: Audience,
  filter: string | null,
): Promise<string[]> {
  const needsFilter = ["city", "category", "driver", "passenger"].includes(audience);
  if (needsFilter && !filter) throw new Error("missing_filter");

  if (audience === "driver" || audience === "passenger") {
    const id = filter ? await resolveSpecificProfileId(supabase, filter) : null;
    return id ? [id] : [];
  }

  if (audience === "drivers") {
    const { data, error } = await supabase.from("drivers").select("user_id");
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row: { user_id?: unknown }) => String(row.user_id ?? ""))
      .filter(Boolean);
  }

  if (audience === "passengers") {
    const { data, error } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "passenger");
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row: { user_id?: unknown }) => String(row.user_id ?? ""))
      .filter(Boolean);
  }

  if (audience === "city") {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .ilike("city", filter!)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: { id?: unknown }) => String(row.id ?? "")).filter(Boolean);
  }

  if (audience === "category") {
    const { data, error } = await supabase
      .from("drivers")
      .select("user_id")
      .eq("category", filter!);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row: { user_id?: unknown }) => String(row.user_id ?? ""))
      .filter(Boolean);
  }

  const { data, error } = await supabase.from("users").select("id").is("deleted_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { id?: unknown }) => String(row.id ?? "")).filter(Boolean);
}

export const sendAdminBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { title: string; body: string; audience: Audience; filter: string | null }) =>
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
    await assertPermission(context as any, "notifications.send");
    const supabase = (context as any).supabase;
    const filter = data.filter?.trim() || null;
    const recipients = [...new Set(await resolveRecipients(supabase, data.audience, filter))];
    if (recipients.length === 0) throw new Error("no_recipients");
    if (recipients.length > MAX_RECIPIENTS) throw new Error("too_many_recipients");

    const { data: delivery, error } = await supabase.functions.invoke("send-ride-push", {
      body: {
        user_ids: recipients,
        event: "admin.broadcast",
        title: data.title,
        body: data.body,
        url: "/notificacoes",
        data: { audience: data.audience, audience_filter: filter ?? "" },
      },
    });
    if (error) throw new Error(error.message || "notification_delivery_failed");

    const payload = (delivery ?? {}) as {
      ok?: boolean;
      sent?: number;
      failed_users?: number;
      recipients?: number;
      no_tokens?: number;
      suppressed?: number;
    };
    return {
      ok: payload.ok !== false,
      selected: recipients.length,
      sent: Number(payload.sent ?? 0),
      failed: Number(payload.failed_users ?? 0),
      noTokens: Number(payload.no_tokens ?? 0),
      suppressed: Number(payload.suppressed ?? 0),
    };
  });

export const getAdminNotificationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context as any, "notifications.send");
    const { data, error } = await (context as any).supabase
      .from("notification_logs")
      .select("id,event,channel,title,body,status,created_at,user_id")
      .eq("event", "admin.broadcast")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      event: string;
      channel: string;
      title: string;
      body: string | null;
      status: "sent" | "failed" | "suppressed" | "no_token";
      created_at: string;
      user_id: string;
    }>;
  });
