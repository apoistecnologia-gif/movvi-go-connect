// Admin-only coupon mutations. Server verifies admin role.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const codeSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Z0-9_\-]+$/, "invalid_code")
  .transform((s) => s.toUpperCase());
const typeSchema = z.enum(["percent", "fixed", "first_ride", "free_delivery"]);
const nonNegNumber = z.number().finite().min(0).max(1_000_000);
const optionalPositive = z.number().finite().min(0).max(1_000_000).nullable().optional();
const optionalInt = z.number().int().min(0).max(10_000_000).nullable().optional();
const optionalDate = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional();
const optionalStr = (max: number) =>
  z.string().trim().max(max).nullable().optional();

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error("role_check_failed");
  if (!data) throw new Error("forbidden");
}

export const createCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => z.object({ code: codeSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { error } = await (context as any).supabase
      .from("coupons")
      .insert({ code: data.code, type: "percent", value: 10, enabled: true });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    code: string;
    description: string | null;
    type: string;
    value: number;
    max_discount: number | null;
    valid_from: string | null;
    valid_to: string | null;
    usage_limit: number | null;
    scope_category: string | null;
    enabled: boolean;
  }) =>
    z
      .object({
        id: uuid,
        code: codeSchema,
        description: optionalStr(500),
        type: typeSchema,
        value: nonNegNumber,
        max_discount: optionalPositive,
        valid_from: optionalDate,
        valid_to: optionalDate,
        usage_limit: optionalInt,
        scope_category: optionalStr(64),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { id, ...patch } = data;
    const { error } = await (context as any).supabase
      .from("coupons")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setCouponEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; enabled: boolean }) =>
    z.object({ id: uuid, enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { error } = await (context as any).supabase
      .from("coupons")
      .update({ enabled: data.enabled })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { error } = await (context as any).supabase.from("coupons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
