import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const APPROVAL_STATUSES = ["aprovado", "reprovado", "bloqueado", "em_analise"] as const;
type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

const statusSchema = z.enum(APPROVAL_STATUSES);
const reasonSchema = z.string().trim().max(500).optional().nullable();
const noteSchema = z.string().trim().min(1).max(2000);

async function assertPermission(ctx: { supabase: any }, permission: string) {
  const { data, error } = await ctx.supabase.rpc("admin_has_permission", {
    _permission: permission,
  });
  if (error) throw new Error("permission_check_failed");
  if (data !== true) throw new Error("forbidden");
}

export const updateDriverApprovalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: ApprovalStatus; reason?: string | null }) =>
    z.object({ id: uuid, status: statusSchema, reason: reasonSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any).rpc("admin_set_driver_approval", {
      _driver_id: data.id,
      _status: data.status,
      _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, driver: row };
  });

export const setDriverSuspension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; suspend: boolean; reason?: string | null }) =>
    z.object({ id: uuid, suspend: z.boolean(), reason: reasonSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any).rpc("admin_set_driver_suspension", {
      _driver_id: data.id,
      _suspended: data.suspend,
      _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, driver: row };
  });

export const addDriverAdminNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { driverId: string; note: string }) =>
    z.object({ driverId: uuid, note: noteSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context as any, "drivers.manage");
    const { data: row, error } = await (context.supabase as any)
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
    await assertPermission(context as any, "drivers.manage");
    const { error } = await (context.supabase as any)
      .from("admin_driver_notes")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
