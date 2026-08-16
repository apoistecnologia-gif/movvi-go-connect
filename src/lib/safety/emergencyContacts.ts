import { supabase } from "@/integrations/supabase/client";

export type SafetyRole = "driver" | "passenger";

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
  is_primary: boolean;
}

const MAX_NAME_LENGTH = 80;
const MAX_RELATION_LENGTH = 80;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tableFor(role: SafetyRole): "driver_emergency_contacts" | "passenger_emergency_contacts" {
  return role === "driver" ? "driver_emergency_contacts" : "passenger_emergency_contacts";
}

function requireId(value: string, field: string): string {
  const normalized = value.trim();
  if (!UUID_RE.test(normalized)) throw new Error(`${field}_invalid`);
  return normalized;
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (normalized.length < 10 || normalized.length > 11) throw new Error("invalid_phone");
  return normalized;
}

function normalizeContact(value: unknown): EmergencyContact | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim().slice(0, MAX_NAME_LENGTH) : "";
  const phoneRaw = typeof row.phone === "string" ? row.phone : "";
  if (!UUID_RE.test(id) || !name) return null;

  let phone: string;
  try {
    phone = normalizePhone(phoneRaw);
  } catch {
    return null;
  }

  const relationSource = typeof row.relation === "string" ? row.relation : row.relationship;
  const relation = typeof relationSource === "string" && relationSource.trim()
    ? relationSource.trim().slice(0, MAX_RELATION_LENGTH)
    : null;

  return {
    id,
    name,
    phone,
    relation,
    is_primary: row.is_primary === true,
  };
}

// Some safety tables/RPCs are newer than the generated Supabase client types.
type AnyBuilder = {
  select: (columns: string) => AnyBuilder;
  insert: (row: unknown) => AnyBuilder;
  update: (row: unknown) => AnyBuilder;
  delete: () => AnyBuilder;
  eq: (col: string, val: unknown) => AnyBuilder;
  order: (col: string, opts: { ascending: boolean }) => AnyBuilder;
  then: Promise<{ data: unknown; error: { message: string } | null }>["then"];
};

type RpcResult = { data: unknown; error: { message: string } | null };

function tbl(role: SafetyRole): AnyBuilder {
  return (supabase as unknown as { from: (t: string) => AnyBuilder }).from(tableFor(role));
}

async function driverSafetyRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const client = supabase as unknown as {
    rpc: (rpcName: string, rpcArgs: Record<string, unknown>) => Promise<RpcResult>;
  };
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error("driver_contact_operation_failed");
  return data;
}

export async function listContacts(
  role: SafetyRole,
  userId: string,
): Promise<EmergencyContact[]> {
  const normalizedUserId = requireId(userId, "user_id");

  // Driver contacts are keyed by drivers.id (not auth/public user id). RLS already
  // scopes SELECT to the current driver's canonical mobility identity, so adding a
  // nonexistent driver_user_id predicate would make the query fail.
  const query = role === "driver"
    ? tbl(role).select("id,name,phone,relation,is_primary").order("is_primary", { ascending: false })
    : tbl(role)
        .select("id,name,phone,relationship,is_primary")
        .eq("passenger_id", normalizedUserId)
        .order("is_primary", { ascending: false });

  const res = (await query) as unknown as {
    data: unknown[] | null;
    error: { message: string } | null;
  };
  if (res.error) throw new Error("contacts_load_failed");
  const seen = new Set<string>();
  return (res.data ?? [])
    .map(normalizeContact)
    .filter((contact): contact is EmergencyContact => {
      if (!contact || seen.has(contact.id)) return false;
      seen.add(contact.id);
      return true;
    });
}

export async function createContact(
  role: SafetyRole,
  userId: string,
  input: { name: string; phone: string; relation?: string | null; is_primary?: boolean },
) {
  const normalizedUserId = requireId(userId, "user_id");
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
  if (name.length < 2) throw new Error("invalid_name");
  const phone = normalizePhone(input.phone);
  const relation = input.relation?.trim().replace(/\s+/g, " ").slice(0, MAX_RELATION_LENGTH) || null;

  if (role === "driver") {
    await driverSafetyRpc("driver_add_emergency_contact", {
      _name: name,
      _phone: phone,
      _relation: relation,
    });
    return;
  }

  const row: Record<string, unknown> = {
    passenger_id: normalizedUserId,
    name,
    phone,
    relationship: relation,
    is_primary: input.is_primary === true,
  };
  const res = (await tbl(role).insert(row)) as unknown as {
    error: { message: string } | null;
  };
  if (res.error) throw new Error("contact_create_failed");
}

export async function deleteContact(role: SafetyRole, id: string) {
  const normalizedId = requireId(id, "contact_id");

  if (role === "driver") {
    await driverSafetyRpc("driver_delete_emergency_contact", { _contact_id: normalizedId });
    return;
  }

  const res = (await tbl(role).delete().eq("id", normalizedId)) as unknown as {
    error: { message: string } | null;
  };
  if (res.error) throw new Error("contact_delete_failed");
}

export async function setPrimaryContact(role: SafetyRole, userId: string, id: string) {
  const normalizedUserId = requireId(userId, "user_id");
  const normalizedId = requireId(id, "contact_id");

  if (role === "driver") {
    await driverSafetyRpc("driver_set_emergency_contact_primary", { _contact_id: normalizedId });
    return;
  }

  const clearResult = (await tbl(role)
    .update({ is_primary: false })
    .eq("passenger_id", normalizedUserId)) as unknown as {
    error: { message: string } | null;
  };
  if (clearResult.error) throw new Error("contact_primary_clear_failed");

  const res = (await tbl(role)
    .update({ is_primary: true })
    .eq("id", normalizedId)
    .eq("passenger_id", normalizedUserId)) as unknown as {
    error: { message: string } | null;
  };
  if (res.error) throw new Error("contact_primary_update_failed");
}

export async function getPrimaryContact(
  role: SafetyRole,
  userId: string,
): Promise<EmergencyContact | null> {
  const list = await listContacts(role, userId);
  return list.find((c) => c.is_primary) ?? list[0] ?? null;
}
