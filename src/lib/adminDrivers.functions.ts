// Admin-only driver mutations — moved off the browser so the write only
// happens after the server verifies the caller is authenticated AND holds the
// `admin` role. Covers approval status transitions (aprovado / reprovado /
// bloqueado / em_analise = "request correction"), suspension toggle, and
// admin note create/delete.
//
// NOTE: This module intentionally does NOT touch rideLifecycle.ts, dispatch,
// GPS, realtime, PIN, Asaas, or subscription sync. Approval status is a
// driver-profile field only; the ride flow is untouched.

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
  supabase: {
    from: (t: string) => {
      update: (patch: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => { single: () => Promise<{ data: unknown; error: { message: string } | null }> };
      };
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

type ApprovalPatch = {
  approval_status: ApprovalStatus;
  motivo_reprovacao: string | null;
  approved_at: string | null;
  blocked_at: string | null;
  documents_status?: "approved" | "rejected";
};

function buildApprovalPatch(status: ApprovalStatus, reason: string | null | undefined): ApprovalPatch {
  const patch: ApprovalPatch = {
    approval_status: status,
    motivo_reprovacao: status === "reprovado" ? (reason ? reason.trim() : null) : null,
    approved_at: status === "aprovado" ? new Date().toISOString() : null,
    blocked_at: status === "bloqueado" ? new Date().toISOString() : null,
  };
  // Ao aprovar/reprovar, sincronizamos documents_status — caso contrário a UI
  // do motorista segue mostrando "em análise / faltam documentos" mesmo depois
  // que o admin já liberou (ou recusou) a conta.
  if (status === "aprovado") patch.documents_status = "approved";
  if (status === "reprovado") patch.documents_status = "rejected";
  return patch;
}

/**
 * Approve / reject / block / request-correction (em_analise) a driver.
 * All four transitions share the same shape; the status enum is validated.
 */
export const updateDriverApprovalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: ApprovalStatus; reason?: string | null }) =>
    z.object({ id: uuid, status: statusSchema, reason: reasonSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthedCtx);
    const patch = buildApprovalPatch(data.status, data.reason ?? null);
    const { error } = await context.supabase.from("drivers").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const, patch };
  });

export const setDriverSuspension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; suspend: boolean }) =>
    z.object({ id: uuid, suspend: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthedCtx);
    const patch = { suspended_at: data.suspend ? new Date().toISOString() : null };
    const { error } = await context.supabase.from("drivers").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const, patch };
  });

export const addDriverAdminNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { driverId: string; note: string }) =>
    z.object({ driverId: uuid, note: noteSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthedCtx);
    const { data: row, error } = await context.supabase
      .from("admin_driver_notes")
      .insert({ driver_id: data.driverId, admin_id: context.userId, note: data.note })
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
    await assertAdmin(context as unknown as AuthedCtx);
    const { error } = await context.supabase
      .from("admin_driver_notes")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
