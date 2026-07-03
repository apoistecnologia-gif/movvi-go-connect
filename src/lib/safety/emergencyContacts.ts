import { supabase } from "@/integrations/supabase/client";

export type SafetyRole = "driver" | "passenger";

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
  is_primary: boolean;
}

function tableFor(role: SafetyRole) {
  return role === "driver" ? "driver_emergency_contacts" : "passenger_emergency_contacts";
}

function userColumnFor(role: SafetyRole) {
  return role === "driver" ? "driver_user_id" : "passenger_user_id";
}

export async function listContacts(
  role: SafetyRole,
  userId: string,
): Promise<EmergencyContact[]> {
  const { data, error } = await supabase
    .from(tableFor(role) as "driver_emergency_contacts")
    .select("id,name,phone,relation,is_primary")
    .eq(userColumnFor(role), userId)
    .order("is_primary", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmergencyContact[];
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
  const { error } = await supabase
    .from(tableFor(role) as "driver_emergency_contacts")
    .insert(row as never);
  if (error) throw error;
}

export async function deleteContact(role: SafetyRole, id: string) {
  const { error } = await supabase
    .from(tableFor(role) as "driver_emergency_contacts")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function setPrimaryContact(role: SafetyRole, userId: string, id: string) {
  await supabase
    .from(tableFor(role) as "driver_emergency_contacts")
    .update({ is_primary: false })
    .eq(userColumnFor(role), userId);
  const { error } = await supabase
    .from(tableFor(role) as "driver_emergency_contacts")
    .update({ is_primary: true })
    .eq("id", id);
  if (error) throw error;
}

export async function getPrimaryContact(
  role: SafetyRole,
  userId: string,
): Promise<EmergencyContact | null> {
  const list = await listContacts(role, userId);
  return list.find((c) => c.is_primary) ?? list[0] ?? null;
}
