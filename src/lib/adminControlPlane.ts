/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORY_CODES = ["carros", "motos", "fretes", "guincho", "envios"] as const;
const STAFF_ROLES = ["administrator", "editor", "marketing", "support", "reader"] as const;
const DRIVER_APPROVAL = ["em_analise", "aprovado", "reprovado", "bloqueado"] as const;
const PASSENGER_ACTIONS = ["suspend", "unsuspend", "block", "unblock", "soft_delete"] as const;
const SOS_STATUSES = ["open", "acknowledged", "resolved", "cancelled"] as const;
const SUPPORT_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function nullableText(value: unknown, maxLength: number): string | null {
  return cleanText(value, maxLength) || null;
}

function requireUuid(value: unknown, field: string): string {
  const normalized = cleanText(value, 128);
  if (!UUID_RE.test(normalized)) throw new Error(`${field}_invalid`);
  return normalized;
}

function requireEnum<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  const normalized = cleanText(value, 80).toLowerCase();
  if (!allowed.includes(normalized as T[number])) throw new Error(`${field}_invalid`);
  return normalized as T[number];
}

function nonNegative(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field}_invalid`);
  return parsed;
}

function safeSortOrder(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) throw new Error("sort_order_invalid");
  return parsed;
}

function safeBoolean(value: unknown): boolean {
  return value === true;
}

function safeImageUrl(value: unknown): string | null {
  const raw = cleanText(value, 2_048);
  if (!raw) return null;
  if (/^(?:javascript|data|vbscript):/i.test(raw) || raw.startsWith("//") || raw.includes("\\")) {
    throw new Error("image_url_invalid");
  }
  if (raw.startsWith("/")) {
    if (/[?#]/.test(raw.slice(1, 2)) || /[\u0000-\u001f\u007f]/.test(raw)) {
      throw new Error("image_url_invalid");
    }
    return raw;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") throw new Error("image_url_invalid");
    return parsed.toString();
  } catch {
    throw new Error("image_url_invalid");
  }
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const rpcName = cleanText(name, 120);
  if (!/^admin_[a-z0-9_]+$/.test(rpcName)) throw new Error("admin_rpc_invalid");
  try {
    const { data, error } = await db.rpc(rpcName, args);
    if (error) {
      if (import.meta.env.DEV) console.warn(`[APOIS Admin] RPC ${rpcName} falhou`, error);
      throw new Error("admin_operation_failed");
    }
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.message === "admin_operation_failed") throw error;
    if (import.meta.env.DEV) console.warn(`[APOIS Admin] RPC ${rpcName} indisponível`, error);
    throw new Error("admin_operation_failed");
  }
}

export type AdminDashboardMetrics = {
  drivers: { total: number; online: number; pending_review: number };
  passengers: { total: number };
  rides: { active: number; completed_today: number; cancelled_today: number };
  operations: { open_sos: number; open_support: number };
  finance: {
    today: {
      gmv_cents: number;
      driver_earnings_cents: number;
      platform_revenue_cents: number;
      provider_fees_cents: number;
    };
    month: {
      gmv_cents: number;
      driver_earnings_cents: number;
      platform_revenue_cents: number;
      provider_fees_cents: number;
    };
  };
};

export async function getAdminDashboardMetrics() {
  return rpc<AdminDashboardMetrics>("admin_get_dashboard_metrics");
}

export type AdminRideCategoryInput = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  imageUrl: string | null;
  capacityLabel: string | null;
  etaLabel: string | null;
  sortOrder: number;
  isActive: boolean;
};

export async function updateAdminRideCategory(input: AdminRideCategoryInput) {
  const id = requireUuid(input.id, "category_id");
  const name = cleanText(input.name, 100);
  if (name.length < 2) throw new Error("category_name_invalid");
  return rpc<Record<string, unknown>>("admin_update_ride_category", {
    _category_id: id,
    _name: name,
    _description: nullableText(input.description, 500),
    _icon: nullableText(input.icon, 80),
    _image_url: safeImageUrl(input.imageUrl),
    _capacity_label: nullableText(input.capacityLabel, 80),
    _eta_label: nullableText(input.etaLabel, 80),
    _sort_order: safeSortOrder(input.sortOrder),
    _is_active: safeBoolean(input.isActive),
  });
}

export type AdminTariffInput = {
  categoryCode: string;
  city: string;
  baseFare: number;
  minFare: number;
  perKm: number;
  perMin: number;
  stopFee: number;
  fixedFee: number;
  dynamicMultiplier: number;
  helper1Fee: number;
  helper2Fee: number;
  heavyFurnitureFee: number;
  assemblyFee: number;
  packingFee: number;
  difficultAccessFee: number;
  stairFee: number;
  heavyVehicleFee: number;
  accidentFee: number;
  platformFee: number;
  lockedWheelsFee: number;
  garageFee: number;
  maxWeightKg: number;
  perKg: number;
  isActive: boolean;
};

export async function upsertAdminTariffRule(input: AdminTariffInput) {
  const categoryCode = requireEnum(input.categoryCode, CATEGORY_CODES, "category_code");
  const city = cleanText(input.city, 120).toLowerCase();
  if (!city) throw new Error("city_invalid");
  const dynamicMultiplier = nonNegative(input.dynamicMultiplier, "dynamic_multiplier");
  if (dynamicMultiplier < 0.001 || dynamicMultiplier > 100) throw new Error("dynamic_multiplier_invalid");

  return rpc<Record<string, unknown>>("admin_upsert_tariff_rule", {
    _category_code: categoryCode,
    _city: city,
    _base_fare: nonNegative(input.baseFare, "base_fare"),
    _min_fare: nonNegative(input.minFare, "min_fare"),
    _per_km: nonNegative(input.perKm, "per_km"),
    _per_min: nonNegative(input.perMin, "per_min"),
    _stop_fee: nonNegative(input.stopFee, "stop_fee"),
    _fixed_fee: nonNegative(input.fixedFee, "fixed_fee"),
    _dynamic_multiplier: dynamicMultiplier,
    _helper1_fee: nonNegative(input.helper1Fee, "helper1_fee"),
    _helper2_fee: nonNegative(input.helper2Fee, "helper2_fee"),
    _heavy_furniture_fee: nonNegative(input.heavyFurnitureFee, "heavy_furniture_fee"),
    _assembly_fee: nonNegative(input.assemblyFee, "assembly_fee"),
    _packing_fee: nonNegative(input.packingFee, "packing_fee"),
    _difficult_access_fee: nonNegative(input.difficultAccessFee, "difficult_access_fee"),
    _stair_fee: nonNegative(input.stairFee, "stair_fee"),
    _heavy_vehicle_fee: nonNegative(input.heavyVehicleFee, "heavy_vehicle_fee"),
    _accident_fee: nonNegative(input.accidentFee, "accident_fee"),
    _platform_fee: nonNegative(input.platformFee, "platform_fee"),
    _locked_wheels_fee: nonNegative(input.lockedWheelsFee, "locked_wheels_fee"),
    _garage_fee: nonNegative(input.garageFee, "garage_fee"),
    _max_weight_kg: nonNegative(input.maxWeightKg, "max_weight_kg"),
    _per_kg: nonNegative(input.perKg, "per_kg"),
    _is_active: safeBoolean(input.isActive),
  });
}

export async function setAdminDriverApproval(
  driverId: string,
  status: "em_analise" | "aprovado" | "reprovado" | "bloqueado",
  reason?: string | null,
) {
  const normalizedStatus = requireEnum(status, DRIVER_APPROVAL, "driver_status");
  const normalizedReason = nullableText(reason, 500);
  if (normalizedStatus === "reprovado" && !normalizedReason) throw new Error("driver_rejection_reason_required");
  return rpc<Record<string, unknown>>("admin_set_driver_approval", {
    _driver_id: requireUuid(driverId, "driver_id"),
    _status: normalizedStatus,
    _reason: normalizedReason,
  });
}

export async function setAdminDriverSuspension(
  driverId: string,
  suspended: boolean,
  reason?: string | null,
) {
  const shouldSuspend = safeBoolean(suspended);
  const normalizedReason = nullableText(reason, 500);
  if (shouldSuspend && !normalizedReason) throw new Error("driver_suspension_reason_required");
  return rpc<Record<string, unknown>>("admin_set_driver_suspension", {
    _driver_id: requireUuid(driverId, "driver_id"),
    _suspended: shouldSuspend,
    _reason: normalizedReason,
  });
}

export async function setAdminPassengerStatus(
  passengerId: string,
  action: "suspend" | "unsuspend" | "block" | "unblock" | "soft_delete",
  reason?: string | null,
) {
  const normalizedAction = requireEnum(action, PASSENGER_ACTIONS, "passenger_action");
  const normalizedReason = nullableText(reason, 500);
  if (["suspend", "block", "soft_delete"].includes(normalizedAction) && !normalizedReason) {
    throw new Error("passenger_action_reason_required");
  }
  return rpc<Record<string, unknown>>("admin_set_passenger_status", {
    _passenger_id: requireUuid(passengerId, "passenger_id"),
    _action: normalizedAction,
    _reason: normalizedReason,
  });
}

export type CanonicalStaffRole = (typeof STAFF_ROLES)[number];

function normalizeStaffInput(input: {
  authUserId: string;
  role: CanonicalStaffRole;
  displayName?: string | null;
}) {
  return {
    authUserId: requireUuid(input.authUserId, "auth_user_id"),
    role: requireEnum(input.role, STAFF_ROLES, "staff_role"),
    displayName: nullableText(input.displayName, 120),
  };
}

export async function setAdminStaffProfile(input: {
  authUserId: string;
  role: CanonicalStaffRole;
  active: boolean;
  displayName?: string | null;
}) {
  const normalized = normalizeStaffInput(input);
  return rpc<Record<string, unknown>>("admin_set_staff_profile", {
    _auth_user_id: normalized.authUserId,
    _role: normalized.role,
    _active: safeBoolean(input.active),
    _display_name: normalized.displayName,
  });
}

export async function provisionAdminStaff(input: {
  authUserId: string;
  role: CanonicalStaffRole;
  displayName?: string | null;
}) {
  const normalized = normalizeStaffInput(input);
  return rpc<Record<string, unknown>>("admin_provision_staff", {
    _auth_user_id: normalized.authUserId,
    _role: normalized.role,
    _display_name: normalized.displayName,
  });
}

export async function updateAdminSosAlert(
  alertId: string,
  status: "open" | "acknowledged" | "resolved" | "cancelled",
) {
  return rpc<Record<string, unknown>>("admin_update_sos_alert", {
    _alert_id: requireUuid(alertId, "alert_id"),
    _status: requireEnum(status, SOS_STATUSES, "sos_status"),
  });
}

export async function updateAdminSupportTicket(
  ticketId: string,
  status: "open" | "in_progress" | "resolved" | "closed",
  priority: "low" | "normal" | "high" | "urgent",
) {
  return rpc<Record<string, unknown>>("admin_update_support_ticket", {
    _ticket_id: requireUuid(ticketId, "ticket_id"),
    _status: requireEnum(status, SUPPORT_STATUSES, "support_status"),
    _priority: requireEnum(priority, SUPPORT_PRIORITIES, "support_priority"),
  });
}
