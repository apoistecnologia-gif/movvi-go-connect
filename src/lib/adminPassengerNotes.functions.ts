// Admin-only passenger notes mutations moved server-side. Server verifies
// the caller is authenticated AND holds the `admin` role before writing.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const noteSchema = z.string().trim().min(1).max(2000);

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error("role_check_failed");
  if (!data) throw new Error("forbidden");
}

export const addPassengerNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { passengerId: string; note: string }) =>
    z.object({ passengerId: uuid, note: noteSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { data: row, error } = await (context as any).supabase
      .from("admin_passenger_notes")
      .insert({
        passenger_id: data.passengerId,
        admin_id: (context as any).userId,
        note: data.note,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePassengerNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { error } = await (context as any).supabase
      .from("admin_passenger_notes")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
