import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message || `${name}_failed`);
  return data as T;
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
  return rpc<Record<string, unknown>>("admin_update_ride_category", {
    _category_id: input.id,
    _name: input.name,
    _description: input.description,
    _icon: input.icon,
    _image_url: input.imageUrl,
    _capacity_label: input.capacityLabel,
    _eta_label: input.etaLabel,
    _sort_order: input.sortOrder,
    _is_active: input.isActive,
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
  return rpc<Record<string, unknown>>("admin_upsert_tariff_rule", {
    _category_code: input.categoryCode,
    _city: input.city,
    _base_fare: input.baseFare,
    _min_fare: input.minFare,
    _per_km: input.perKm,
    _per_min: input.perMin,
    _stop_fee: input.stopFee,
    _fixed_fee: input.fixedFee,
    _dynamic_multiplier: input.dynamicMultiplier,
    _helper1_fee: input.helper1Fee,
    _helper2_fee: input.helper2Fee,
    _heavy_furniture_fee: input.heavyFurnitureFee,
    _assembly_fee: input.assemblyFee,
    _packing_fee: input.packingFee,
    _difficult_access_fee: input.difficultAccessFee,
    _stair_fee: input.stairFee,
    _heavy_vehicle_fee: input.heavyVehicleFee,
    _accident_fee: input.accidentFee,
    _platform_fee: input.platformFee,
    _locked_wheels_fee: input.lockedWheelsFee,
    _garage_fee: input.garageFee,
    _max_weight_kg: input.maxWeightKg,
    _per_kg: input.perKg,
    _is_active: input.isActive,
  });
}

export async function setAdminDriverApproval(
  driverId: string,
  status: "em_analise" | "aprovado" | "reprovado" | "bloqueado",
  reason?: string | null,
) {
  return rpc<Record<string, unknown>>("admin_set_driver_approval", {
    _driver_id: driverId,
    _status: status,
    _reason: reason ?? null,
  });
}

export async function setAdminDriverSuspension(
  driverId: string,
  suspended: boolean,
  reason?: string | null,
) {
  return rpc<Record<string, unknown>>("admin_set_driver_suspension", {
    _driver_id: driverId,
    _suspended: suspended,
    _reason: reason ?? null,
  });
}

export async function setAdminPassengerStatus(
  passengerId: string,
  action: "suspend" | "unsuspend" | "block" | "unblock" | "soft_delete",
  reason?: string | null,
) {
  return rpc<Record<string, unknown>>("admin_set_passenger_status", {
    _passenger_id: passengerId,
    _action: action,
    _reason: reason ?? null,
  });
}

export async function setAdminStaffProfile(input: {
  authUserId: string;
  role: "administrator" | "editor" | "marketing" | "support" | "reader";
  active: boolean;
  displayName?: string | null;
}) {
  return rpc<Record<string, unknown>>("admin_set_staff_profile", {
    _auth_user_id: input.authUserId,
    _role: input.role,
    _active: input.active,
    _display_name: input.displayName ?? null,
  });
}

export async function updateAdminSosAlert(
  alertId: string,
  status: "open" | "acknowledged" | "resolved" | "cancelled",
) {
  return rpc<Record<string, unknown>>("admin_update_sos_alert", {
    _alert_id: alertId,
    _status: status,
  });
}

export async function updateAdminSupportTicket(
  ticketId: string,
  status: "open" | "in_progress" | "resolved" | "closed",
  priority: "low" | "normal" | "high" | "urgent",
) {
  return rpc<Record<string, unknown>>("admin_update_support_ticket", {
    _ticket_id: ticketId,
    _status: status,
    _priority: priority,
  });
}
