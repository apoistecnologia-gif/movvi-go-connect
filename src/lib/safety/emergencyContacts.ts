import { supabase } from "@/integrations/supabase/client";

export type SafetyRole = "driver" | "passenger";

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
  is_primary: boolean;
}

function tableFor(role: SafetyRole): "driver_emergency_contacts" | "passenger_emergency_contacts" {
  return role === "driver" ? "driver_emergency_contacts" : "passenger_emergency_contacts";
}

function userColumnFor(role: SafetyRole): "driver_user_id" | "passenger_user_id" {
  return role === "driver" ? "driver_user_id" : "passenger_user_id";
}

// The passenger_emergency_contacts table was just added and may not appear in the
// generated Supabase types yet — bypass strict column typing where necessary.
type AnyBuilder = {
  select: (columns: string) => AnyBuilder;
  insert: (row: unknown) => AnyBuilder;
  update: (row: unknown) => AnyBuilder;
  delete: () => AnyBuilder;
  eq: (col: string, val: unknown) => AnyBuilder;
  order: (col: string, opts: { ascending: boolean }) => AnyBuilder;
  then: Promise<{ data: unknown; error: { message: string } | null }>["then"];
};

function tbl(role: SafetyRole): AnyBuilder {
  return (supabase as unknown as { from: (t: string) => AnyBuilder }).from(tableFor(role));
}

export async function listContacts(
  role: SafetyRole,
  userId: string,
): Promise<EmergencyContact[]> {
  const res = (await tbl(role)
    .select("id,name,phone,relation,is_primary")
    .eq(userColumnFor(role), userId)
    .order("is_primary", { ascending: false })) as unknown as {
    data: EmergencyContact[] | null;
    error: { message: string } | null;
  };
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

export async function createContact(
  role: SafetyRole,
  userId: string,
  input: { name: string; phone: string; relation?: string | null; is_primary?: boolean },
) {
  const row: Record<string, unknown> = {
    [userColumnFor(role)]: userId,
    name: input.name.trim(),
    phone: input.phone.trim(),
    relation: input.relation?.trim() || null,
    is_primary: !!input.is_primary,
  };
  const res = (await tbl(role).insert(row)) as unknown as {
    error: { message: string } | null;
  };
  if (res.error) throw new Error(res.error.message);
}

export async function deleteContact(role: SafetyRole, id: string) {
  const res = (await tbl(role).delete().eq("id", id)) as unknown as {
    error: { message: string } | null;
  };
  if (res.error) throw new Error(res.error.message);
}

export async function setPrimaryContact(role: SafetyRole, userId: string, id: string) {
  await tbl(role).update({ is_primary: false }).eq(userColumnFor(role), userId);
  const res = (await tbl(role).update({ is_primary: true }).eq("id", id)) as unknown as {
    error: { message: string } | null;
  };
  if (res.error) throw new Error(res.error.message);
}

export async function getPrimaryContact(
  role: SafetyRole,
  userId: string,
): Promise<EmergencyContact | null> {
  const list = await listContacts(role, userId);
  return list.find((c) => c.is_primary) ?? list[0] ?? null;
}

