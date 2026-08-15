// APOIS — mutações administrativas de motoristas.
// O painel usa a sessão real do administrador no Supabase oficial.
// Bloqueio/suspensão passam pela Edge Function canônica, que aplica a mutação
// administrativa no banco e redistribui automaticamente corridas pré-embarque.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const APPROVAL_STATUSES = ["aprovado", "reprovado", "bloqueado", "em_analise"] as const;
type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

const statusSchema = z.enum(APPROVAL_STATUSES);
const reasonSchema = z.string().trim().max(500).optional().nullable();
const noteSchema = z.string().trim().min(1).max(2000);

type AuthedCtx = {
  supabase: any;
  userId: string;
};

type DriverOperationalResult = {
  ok?: boolean;
  error?: string;
  driver?: Record<string, unknown>;
  released_count?: number;
  redispatch?: "triggered" | "deferred" | string;
};

async function assertAdmin(ctx: AuthedCtx) {
  const { data, error } = await ctx.supabase.rpc("admin_is_authorized");
  if (error) throw new Error("role_check_failed");
  if (!data) throw new Error("forbidden");
}

async function applyDriverOperationalStatus(
  ctx: AuthedCtx,
  body: Record<string, unknown>,
): Promise<DriverOperationalResult> {
  const { data, error } = await ctx.supabase.functions.invoke("admin-driver-operational-status", {
    body,
  });
  if (error) throw new Error(error.message || "admin_driver_status_failed");

  const result = (data ?? {}) as DriverOperationalResult;
  if (!result.ok) throw new Error(result.error || "admin_driver_status_failed");
  return result;
}

/**
 * Aprova, reprova, bloqueia ou devolve o cadastro para análise.
 * A Edge Function chama a RPC SECURITY DEFINER oficial e, quando o motorista
 * fica inelegível, libera apenas corridas pré-embarque e dispara redispatch.
 * Corridas já em viagem nunca são liberadas por este fluxo.
 */
export const updateDriverApprovalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: ApprovalStatus; reason?: string | null }) =>
    z.object({ id: uuid, status: statusSchema, reason: reasonSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthedCtx;
    await assertAdmin(ctx);

    const result = await applyDriverOperationalStatus(ctx, {
      driver_id: data.id,
      action: "approval",
      status: data.status,
      reason: data.reason ?? null,
    });

    const driver = result.driver ?? {};
    const patch = {
      approval_status: String(driver.approval_status ?? data.status),
      motivo_reprovacao:
        data.status === "reprovado"
          ? String(driver.motivo_reprovacao ?? data.reason?.trim() ?? "") || null
          : null,
      documents_status:
        driver.documents_status ??
        (data.status === "aprovado"
          ? "approved"
          : data.status === "reprovado"
            ? "rejected"
            : undefined),
      approved_at: driver.approved_at ?? (data.status === "aprovado" ? new Date().toISOString() : null),
      blocked_at: driver.blocked_at ?? (data.status === "bloqueado" ? new Date().toISOString() : null),
      is_online: typeof driver.is_online === "boolean" ? driver.is_online : data.status === "aprovado" ? undefined : false,
    };

    return {
      ok: true as const,
      patch,
      driver,
      releasedCount: Number(result.released_count ?? 0),
      redispatch: result.redispatch ?? "triggered",
    };
  });

export const setDriverSuspension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; suspend: boolean }) =>
    z.object({ id: uuid, suspend: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthedCtx;
    await assertAdmin(ctx);

    const result = await applyDriverOperationalStatus(ctx, {
      driver_id: data.id,
      action: "suspension",
      suspended: data.suspend,
    });

    const driver = result.driver ?? {};
    const patch = {
      suspended_at:
        driver.suspended_at ?? (data.suspend ? new Date().toISOString() : null),
      approval_status: String(driver.approval_status ?? (data.suspend ? "suspenso" : "aprovado")),
      is_online: typeof driver.is_online === "boolean" ? driver.is_online : false,
    };

    return {
      ok: true as const,
      patch,
      driver,
      releasedCount: Number(result.released_count ?? 0),
      redispatch: result.redispatch ?? "triggered",
    };
  });

export const addDriverAdminNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { driverId: string; note: string }) =>
    z.object({ driverId: uuid, note: noteSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthedCtx;
    await assertAdmin(ctx);
    const { data: row, error } = await ctx.supabase
      .from("admin_driver_notes")
      .insert({ driver_id: data.driverId, admin_id: ctx.userId, note: data.note })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as {
      id: string;
      driver_id: string;
      admin_id: string;
      note: string;
      created_at: string;
    };
  });

export const deleteDriverAdminNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthedCtx;
    await assertAdmin(ctx);
    const { error } = await ctx.supabase.from("admin_driver_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
