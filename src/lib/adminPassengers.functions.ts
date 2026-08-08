import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const reason = z.string().trim().min(1).max(500);
const optionalReason = z.string().trim().max(500).optional().nullable();

async function setPassengerStatus(
  context: { supabase: any },
  id: string,
  action: "suspend" | "unsuspend" | "block" | "unblock" | "soft_delete",
  reasonValue?: string | null,
) {
  const { data, error } = await context.supabase.rpc("admin_set_passenger_status", {
    _passenger_id: id,
    _action: action,
    _reason: reasonValue ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export const suspendPassenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; reason?: string | null }) =>
    z.object({ id: uuid, reason: optionalReason }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = await setPassengerStatus(context as any, data.id, "suspend", data.reason ?? null);
    return { ok: true as const, passenger: row };
  });

export const unsuspendPassenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const row = await setPassengerStatus(context as any, data.id, "unsuspend");
    return { ok: true as const, passenger: row };
  });

export const blockPassenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; reason: string }) =>
    z.object({ id: uuid, reason }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = await setPassengerStatus(context as any, data.id, "block", data.reason);
    return { ok: true as const, passenger: row };
  });

export const unblockPassenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const row = await setPassengerStatus(context as any, data.id, "unblock");
    return { ok: true as const, passenger: row };
  });

/**
 * Compatibility name retained for the current UI. This is deliberately a
 * server-audited operational soft delete, not a direct DELETE from public.users
 * and not a claim that auth.users has been erased.
 */
export const deletePassenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const row = await setPassengerStatus(
      context as any,
      data.id,
      "soft_delete",
      "Exclusão operacional solicitada no painel administrativo.",
    );
    return { ok: true as const, passenger: row, softDeleted: true as const };
  });
