/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { supabase } from "@/integrations/supabase/client";
import { validateSettlementAmounts } from "@/lib/finance/settlementValidation";

export type AdminFinanceSettlement = {
  id: string;
  ride_id: string;
  driver_id: string;
  passenger_id: string;
  payment_method: string;
  payment_status: string;
  status: string;
  passenger_charge_cents: number;
  driver_earning_cents: number;
  platform_fee_cents: number;
  payment_provider_fee_cents: number;
  refunded_amount_cents: number;
  created_at: string;
  settled_at: string | null;
};

export type AdminFinanceWithdrawal = {
  id: string;
  driver_id: string;
  amount_cents: number;
  status: string;
  provider: string | null;
  provider_transfer_id: string | null;
  failure_reason: string | null;
  requested_at: string;
  processed_at: string | null;
};

export type AdminFinanceSummary = {
  from: string;
  to: string;
  settlements: {
    gmv_cents: number;
    driver_earnings_cents: number;
    platform_revenue_cents: number;
    provider_fees_cents: number;
    refunds_cents: number;
    settled_count: number;
    pending_count: number;
    failed_count: number;
  };
  withdrawals: {
    pending_cents: number;
    paid_cents: number;
  };
  providers: {
    electronic_payment_provider: string | null;
    payout_provider: string | null;
  };
  recent_settlements: AdminFinanceSettlement[];
  recent_withdrawals: AdminFinanceWithdrawal[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeNonNegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error("admin_finance_invalid_response");
  return Number(value);
}

function safeString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("admin_finance_invalid_response");
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function validDateString(value: unknown): string {
  const text = safeString(value);
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) throw new Error("admin_finance_invalid_response");
  return text;
}

function parseWithdrawal(value: unknown): AdminFinanceWithdrawal {
  if (!isRecord(value)) throw new Error("admin_finance_invalid_response");
  return {
    id: safeString(value.id),
    driver_id: safeString(value.driver_id),
    amount_cents: safeNonNegativeInteger(value.amount_cents),
    status: safeString(value.status),
    provider: nullableString(value.provider),
    provider_transfer_id: nullableString(value.provider_transfer_id),
    failure_reason: nullableString(value.failure_reason),
    requested_at: validDateString(value.requested_at),
    processed_at: value.processed_at == null ? null : validDateString(value.processed_at),
  };
}

function validateSummary(value: unknown): AdminFinanceSummary {
  if (!isRecord(value) || !isRecord(value.settlements) || !isRecord(value.withdrawals) || !isRecord(value.providers)) {
    throw new Error("admin_finance_invalid_response");
  }
  if (!Array.isArray(value.recent_settlements) || !Array.isArray(value.recent_withdrawals)) {
    throw new Error("admin_finance_invalid_response");
  }

  const recentSettlements = value.recent_settlements as AdminFinanceSettlement[];
  for (const settlement of recentSettlements) {
    if (!isRecord(settlement)) throw new Error("admin_finance_invalid_response");
    validateSettlementAmounts(settlement);
    safeString(settlement.id);
    safeString(settlement.ride_id);
    safeString(settlement.driver_id);
    safeString(settlement.passenger_id);
    validDateString(settlement.created_at);
    if (settlement.settled_at != null) validDateString(settlement.settled_at);
  }

  const settlements = value.settlements;
  const withdrawals = value.withdrawals;
  const providers = value.providers;

  return {
    from: validDateString(value.from),
    to: validDateString(value.to),
    settlements: {
      gmv_cents: safeNonNegativeInteger(settlements.gmv_cents),
      driver_earnings_cents: safeNonNegativeInteger(settlements.driver_earnings_cents),
      platform_revenue_cents: safeNonNegativeInteger(settlements.platform_revenue_cents),
      provider_fees_cents: safeNonNegativeInteger(settlements.provider_fees_cents),
      refunds_cents: safeNonNegativeInteger(settlements.refunds_cents),
      settled_count: safeNonNegativeInteger(settlements.settled_count),
      pending_count: safeNonNegativeInteger(settlements.pending_count),
      failed_count: safeNonNegativeInteger(settlements.failed_count),
    },
    withdrawals: {
      pending_cents: safeNonNegativeInteger(withdrawals.pending_cents),
      paid_cents: safeNonNegativeInteger(withdrawals.paid_cents),
    },
    providers: {
      electronic_payment_provider: nullableString(providers.electronic_payment_provider),
      payout_provider: nullableString(providers.payout_provider),
    },
    recent_settlements: recentSettlements,
    recent_withdrawals: value.recent_withdrawals.map(parseWithdrawal),
  };
}

export async function getAdminFinanceSummary(from: Date, to: Date): Promise<AdminFinanceSummary> {
  if (!Number.isFinite(from?.getTime()) || !Number.isFinite(to?.getTime()) || from.getTime() > to.getTime()) {
    throw new Error("admin_finance_invalid_period");
  }

  const { data, error } = await (supabase as any).rpc("admin_get_finance_summary", {
    _from: from.toISOString(),
    _to: to.toISOString(),
  });
  if (error) {
    if (import.meta.env.DEV) console.warn("[APOIS Admin Finance] summary failed", error);
    throw new Error("admin_finance_summary_failed");
  }

  try {
    return validateSummary(data);
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[APOIS Admin Finance] invalid summary payload", error);
    throw new Error("admin_finance_invalid_response");
  }
}
