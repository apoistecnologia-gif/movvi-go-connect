// Admin-only ride category mutations. Server verifies admin role.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9_]+$/, "invalid_key");
const labelSchema = z.string().trim().min(1).max(64);
const iconSchema = z.string().trim().min(1).max(64);
const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{3,8}$/, "invalid_color");
const sortSchema = z.number().int().min(0).max(9999);

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error("role_check_failed");
  if (!data) throw new Error("forbidden");
}

export const createRideCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string; label: string; sort_order: number }) =>
    z
      .object({
        key: keySchema,
        label: labelSchema,
        sort_order: sortSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { error } = await (context as any).supabase.from("ride_categories").insert({
      key: data.key,
      label: data.label,
      icon: "Car",
      color: "#8DD92B",
      enabled: true,
      sort_order: data.sort_order,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateRideCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      label: string;
      icon: string;
      color: string;
      enabled: boolean;
      sort_order: number;
    }) =>
      z
        .object({
          id: uuid,
          label: labelSchema,
          icon: iconSchema,
          color: colorSchema,
          enabled: z.boolean(),
          sort_order: sortSchema,
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { id, ...patch } = data;
    const { error } = await (context as any).supabase
      .from("ride_categories")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setRideCategoryEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; enabled: boolean }) =>
    z.object({ id: uuid, enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { error } = await (context as any).supabase
      .from("ride_categories")
      .update({ enabled: data.enabled })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteRideCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { error } = await (context as any).supabase
      .from("ride_categories")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const reorderRideCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { updates: { id: string; sort_order: number }[] }) =>
      z
        .object({
          updates: z
            .array(z.object({ id: uuid, sort_order: sortSchema }))
            .min(1)
            .max(100),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    for (const u of data.updates) {
      const { error } = await (context as any).supabase
        .from("ride_categories")
        .update({ sort_order: u.sort_order })
        .eq("id", u.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });
