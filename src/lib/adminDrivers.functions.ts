// APOIS — mutações administrativas de motoristas.
// O painel usa a sessão real do administrador no Supabase oficial.
// Nenhuma aprovação depende de alteração manual no banco.

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

async function assertAdmin(ctx: AuthedCtx) {
  const { data, error } = await ctx.supabase.rpc("admin_is_authorized");
  if (error) throw new Error("role_check_failed");
  if (!data) throw new Error("forbidden");
}

/**
 * Aprova, reprova, bloqueia ou devolve o cadastro para análise.
 * A mutação final acontece dentro da RPC SECURITY DEFINER do Supabase oficial,
 * que valida private.has_permission('users.manage').
 */
export const updateDriverApprovalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: ApprovalStatus; reason?: string | null }) =>
    z.object({ id: uuid, status: statusSchema, reason: reasonSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthedCtx;
    await assertAdmin(ctx);
    const { data: driver, error } = await ctx.supabase.rpc("admin_set_driver_approval", {
      _driver_id: data.id,
      _status: data.status,
      _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);

    const patch = {
      approval_status: data.status,
      motivo_reprovacao: data.status === "reprovado" ? (data.reason?.trim() || null) : null,
      documents_status:
        data.status === "aprovado"
          ? "approved"
          : data.status === "reprovado"
            ? "rejected"
            : undefined,
      approved_at: data.status === "aprovado" ? new Date().toISOString() : undefined,
      blocked_at: data.status === "bloqueado" ? new Date().toISOString() : null,
    };

    return { ok: true as const, patch, driver };
  });

export const setDriverSuspension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; suspend: boolean }) =>
    z.object({ id: uuid, suspend: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthedCtx;
    await assertAdmin(ctx);
    const patch = { suspended_at: data.suspend ? new Date().toISOString() : null };
    const { error } = await ctx.supabase.from("drivers").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const, patch };
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
