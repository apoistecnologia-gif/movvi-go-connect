import { supabase } from "@/integrations/supabase/client";

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

export async function getAdminFinanceSummary(from: Date, to: Date): Promise<AdminFinanceSummary> {
  const { data, error } = await (supabase as any).rpc("admin_get_finance_summary", {
    _from: from.toISOString(),
    _to: to.toISOString(),
  });
  if (error) throw new Error(error.message || "admin_finance_summary_failed");
  return data as AdminFinanceSummary;
}
