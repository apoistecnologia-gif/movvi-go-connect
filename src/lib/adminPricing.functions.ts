// APOIS CORRIDAS — Admin pricing mutations aligned with the canonical live schema.
// The database write is performed by a SECURITY DEFINER RPC that validates the
// authenticated admin and records the audit entry in the same transaction.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const citySchema = z.string().trim().min(1).max(120).default("default");
const money = z.number().finite().min(0).max(1_000_000);
const multiplier = z.number().finite().gt(0).max(100);

const canonicalTariffPatch = z
  .object({
    base_fare: money.optional(),
    min_fare: money.optional(),
    per_km: money.optional(),
    per_min: money.optional(),
    stop_fee: money.optional(),
    fixed_fee: money.optional(),
    dynamic_multiplier: multiplier.optional(),
    helper1_fee: money.optional(),
    helper2_fee: money.optional(),
    heavy_furniture_fee: money.optional(),
    assembly_fee: money.optional(),
    packing_fee: money.optional(),
    difficult_access_fee: money.optional(),
    stair_fee: money.optional(),
    heavy_vehicle_fee: money.optional(),
    accident_fee: money.optional(),
    platform_fee: money.optional(),
    locked_wheels_fee: money.optional(),
    garage_fee: money.optional(),
    max_weight_kg: money.optional(),
    per_kg: money.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "empty_patch");

const upsertInput = z.object({
  category_id: uuid,
  city: citySchema,
  patch: canonicalTariffPatch,
});

async function assertAdmin(ctx: { supabase: any }) {
  const { data, error } = await ctx.supabase.rpc("admin_is_authorized");
  if (error) throw new Error("admin_authorization_failed");
  if (!data) throw new Error("forbidden");
}

export const upsertTariffRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof upsertInput>) => upsertInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any };
    await assertAdmin(ctx);

    const { data: saved, error } = await ctx.supabase.rpc("admin_upsert_tariff_rule", {
      _category_id: data.category_id,
      _city: data.city,
      _patch: data.patch,
    });

    if (error) {
      // During consolidation the RPC is intentionally introduced by a reviewed
      // migration. Surface a deterministic error instead of falling back to a
      // client-side/RLS-bypassing write.
      if (error.code === "PGRST202" || /admin_upsert_tariff_rule/i.test(error.message ?? "")) {
        throw new Error("pricing_backend_not_deployed");
      }
      throw new Error(error.message || "pricing_update_failed");
    }

    return { ok: true as const, rule: saved };
  });
