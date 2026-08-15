import { supabase } from "@/integrations/supabase/client";

export type SafetyRole = "driver" | "passenger";

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
  is_primary: boolean;
}

async function resolveOperationalIds(authUserId: string): Promise<{ profileId: string; driverId: string | null }> {
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .is("deleted_at", null)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("Perfil operacional não encontrado.");

  const { data: driver, error: driverError } = await supabase
    .from("drivers")
    .select("id")
    .eq("user_id", profile.id)
    .maybeSingle();
  if (driverError) throw new Error(driverError.message);
  return { profileId: profile.id, driverId: driver?.id ?? null };
}

export async function listContacts(role: SafetyRole, authUserId: string): Promise<EmergencyContact[]> {
  const ids = await resolveOperationalIds(authUserId);
  if (role === "driver") {
    if (!ids.driverId) return [];
    const { data, error } = await supabase
      .from("driver_emergency_contacts")
      .select("id,name,phone,relation,is_primary")
      .eq("driver_id", ids.driverId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  const { data, error } = await supabase
    .from("passenger_emergency_contacts")
    .select("id,name,phone,relationship,is_primary")
    .eq("passenger_id", ids.profileId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((contact) => ({ ...contact, relation: contact.relationship }));
}

export async function createContact(
  role: SafetyRole,
  authUserId: string,
  input: { name: string; phone: string; relation?: string | null; is_primary?: boolean },
) {
  const ids = await resolveOperationalIds(authUserId);
  const name = input.name.trim();
  const phone = input.phone.trim();
  const relation = input.relation?.trim() || null;

  if (role === "driver") {
    if (!ids.driverId) throw new Error("Cadastro de motorista não encontrado.");
    const { error } = await supabase.from("driver_emergency_contacts").insert({
      driver_id: ids.driverId,
      name,
      phone,
      relation,
      is_primary: !!input.is_primary,
    });
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("passenger_emergency_contacts").insert({
    passenger_id: ids.profileId,
    name,
    phone,
    relationship: relation,
    is_primary: !!input.is_primary,
  });
  if (error) throw new Error(error.message);
}

export async function deleteContact(role: SafetyRole, id: string) {
  const table = role === "driver" ? "driver_emergency_contacts" : "passenger_emergency_contacts";
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setPrimaryContact(role: SafetyRole, authUserId: string, id: string) {
  const ids = await resolveOperationalIds(authUserId);
  if (role === "driver") {
    if (!ids.driverId) throw new Error("Cadastro de motorista não encontrado.");
    const { error: clearError } = await supabase
      .from("driver_emergency_contacts")
      .update({ is_primary: false })
      .eq("driver_id", ids.driverId);
    if (clearError) throw new Error(clearError.message);
    const { error } = await supabase.from("driver_emergency_contacts").update({ is_primary: true }).eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error: clearError } = await supabase
    .from("passenger_emergency_contacts")
    .update({ is_primary: false })
    .eq("passenger_id", ids.profileId);
  if (clearError) throw new Error(clearError.message);
  const { error } = await supabase.from("passenger_emergency_contacts").update({ is_primary: true }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getPrimaryContact(role: SafetyRole, authUserId: string): Promise<EmergencyContact | null> {
  const list = await listContacts(role, authUserId);
  return list.find((c) => c.is_primary) ?? list[0] ?? null;
}
