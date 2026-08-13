import { supabase } from "@/integrations/supabase/client";

type RpcErrorLike = { code?: string; message: string };
type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike | null }>;
};

export interface DriverSettlementItem {
  settlementId: string;
  rideId: string;
  originName: string;
  destinationName: string;
  category: string;
  distanceKm: number | null;
  durationMin: number | null;
  paymentMethod: string;
  paymentStatus: string;
  settlementStatus: string;
  driverEarningCents: number;
  platformFeeCents: number;
  createdAt: string;
  settledAt: string | null;
}

export interface DriverWithdrawalItem {
  id: string;
  amountCents: number;
  status: string;
  provider: string | null;
  failureReason: string | null;
  requestedAt: string;
  processedAt: string | null;
}

export interface DriverFinancialDashboard {
  driverId: string;
  period: {
    from: string;
    to: string;
    settledEarningsCents: number;
    settledRides: number;
  };
  kpis: {
    todayCents: number;
    last7DaysCents: number;
    monthCents: number;
  };
  wallet: {
    balanceCents: number;
    availableBalanceCents: number;
    pendingBalanceCents: number;
    debtBalanceCents: number;
    updatedAt: string;
  };
  payoutEnabled: boolean;
  payout: {
    enabled: boolean;
    provider: string | null;
    reason: string | null;
    minWithdrawalCents: number;
    destinationConfirmed: boolean;
    payoutAvailableAt: string | null;
  };
  settlements: DriverSettlementItem[];
  withdrawals: DriverWithdrawalItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error("driver_finance_invalid_response");
  return value;
}

function nullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function integer(record: Record<string, unknown>, key: string): number {
  const value = Number(record[key]);
  if (!Number.isInteger(value)) throw new Error("driver_finance_invalid_response");
  return value;
}

function nullableNumber(record: Record<string, unknown>, key: string): number | null {
  if (record[key] === null || record[key] === undefined) return null;
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : null;
}

function settlement(value: unknown): DriverSettlementItem {
  if (!isRecord(value)) throw new Error("driver_finance_invalid_response");
  return {
    settlementId: requiredString(value, "settlement_id"),
    rideId: requiredString(value, "ride_id"),
    originName: requiredString(value, "origin_name"),
    destinationName: requiredString(value, "destination_name"),
    category: requiredString(value, "category"),
    distanceKm: nullableNumber(value, "distance_km"),
    durationMin: nullableNumber(value, "duration_min"),
    paymentMethod: requiredString(value, "payment_method"),
    paymentStatus: requiredString(value, "payment_status"),
    settlementStatus: requiredString(value, "settlement_status"),
    driverEarningCents: integer(value, "driver_earning_cents"),
    platformFeeCents: integer(value, "platform_fee_cents"),
    createdAt: requiredString(value, "created_at"),
    settledAt: nullableString(value, "settled_at"),
  };
}

function withdrawal(value: unknown): DriverWithdrawalItem {
  if (!isRecord(value)) throw new Error("driver_finance_invalid_response");
  return {
    id: requiredString(value, "id"),
    amountCents: integer(value, "amount_cents"),
    status: requiredString(value, "status"),
    provider: nullableString(value, "provider"),
    failureReason: nullableString(value, "failure_reason"),
    requestedAt: requiredString(value, "requested_at"),
    processedAt: nullableString(value, "processed_at"),
  };
}

function parseDashboard(value: unknown): DriverFinancialDashboard {
  if (!isRecord(value) || value["ok"] !== true) throw new Error("driver_finance_invalid_response");
  const period = value["period"];
  const kpis = value["kpis"];
  const wallet = value["wallet"];
  const payout = value["payout"];
  if (!isRecord(period) || !isRecord(kpis) || !isRecord(wallet) || !isRecord(payout)) {
    throw new Error("driver_finance_invalid_response");
  }
  if (!Array.isArray(value["settlements"]) || !Array.isArray(value["withdrawals"])) {
    throw new Error("driver_finance_invalid_response");
  }

  const payoutEnabled = payout["enabled"] === true;
  return {
    driverId: requiredString(value, "driver_id"),
    period: {
      from: requiredString(period, "from"),
      to: requiredString(period, "to"),
      settledEarningsCents: integer(period, "settled_earnings_cents"),
      settledRides: integer(period, "settled_rides"),
    },
    kpis: {
      todayCents: integer(kpis, "today_cents"),
      last7DaysCents: integer(kpis, "last_7_days_cents"),
      monthCents: integer(kpis, "month_cents"),
    },
    wallet: {
      balanceCents: integer(wallet, "balance_cents"),
      availableBalanceCents: integer(wallet, "available_balance_cents"),
      pendingBalanceCents: integer(wallet, "pending_balance_cents"),
      debtBalanceCents: integer(wallet, "debt_balance_cents"),
      updatedAt: requiredString(wallet, "updated_at"),
    },
    payoutEnabled,
    payout: {
      enabled: payoutEnabled,
      provider: nullableString(payout, "provider"),
      reason: nullableString(payout, "reason"),
      minWithdrawalCents: integer(payout, "min_withdrawal_cents"),
      destinationConfirmed: payout["destination_confirmed"] === true,
      payoutAvailableAt: nullableString(payout, "payout_available_at"),
    },
    settlements: value["settlements"].map(settlement),
    withdrawals: value["withdrawals"].map(withdrawal),
  };
}

async function fetchDriverFinancialDashboard(
  from: Date,
  to: Date,
): Promise<DriverFinancialDashboard> {
  const rpc = supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("get_driver_financial_dashboard", {
    _from: from.toISOString(),
    _to: to.toISOString(),
  });
  if (error) {
    console.error("[APOIS Driver Finance] dashboard failed", { code: error.code, message: error.message });
    throw new Error("Não foi possível carregar o financeiro agora.");
  }
  return parseDashboard(data);
}

function payoutDestinationReady(dashboard: DriverFinancialDashboard): boolean {
  if (!dashboard.payout.destinationConfirmed) return false;
  if (!dashboard.payout.payoutAvailableAt) return true;
  const availableAt = Date.parse(dashboard.payout.payoutAvailableAt);
  return Number.isFinite(availableAt) && availableAt <= Date.now();
}

async function ensureWooviPaymentAccountIfReady(
  dashboard: DriverFinancialDashboard,
): Promise<boolean> {
  if (dashboard.payout.provider !== "woovi" || !payoutDestinationReady(dashboard)) return false;
  if (dashboard.payout.reason !== "woovi_subaccount_not_active") return false;

  const { data, error } = await supabase.functions.invoke("driver-woovi-payment-account", {
    body: {},
  });
  if (error || (isRecord(data) && typeof data.error === "string")) {
    console.warn("[APOIS Driver Finance] Woovi account binding pending", {
      message: error?.message,
      providerError: isRecord(data) ? data.error : undefined,
    });
    return false;
  }
  return true;
}

export async function loadDriverFinancialDashboard(
  from: Date,
  to: Date,
): Promise<DriverFinancialDashboard> {
  const dashboard = await fetchDriverFinancialDashboard(from, to);
  const bound = await ensureWooviPaymentAccountIfReady(dashboard);
  return bound ? fetchDriverFinancialDashboard(from, to) : dashboard;
}

function payoutErrorMessage(code: string): string {
  if (/driver_payouts_not_homologated|homologation_disabled/i.test(code)) {
    return "Os saques Pix ainda estão em homologação. Seu saldo permanece protegido na carteira.";
  }
  if (/payout_provider_not_woovi|payout_provider_not_supported/i.test(code)) {
    return "O provedor de saques ainda não foi ativado pela APOIS.";
  }
  if (/woovi_subaccount_not_active/i.test(code)) {
    return "Sua conta Pix ainda está sendo vinculada ao provedor. Atualize o financeiro em instantes.";
  }
  if (/pix_payout_destination_not_confirmed/i.test(code)) {
    return "Confirme sua chave Pix na carteira antes de solicitar o saque.";
  }
  if (/pix_payout_destination_cooldown/i.test(code)) {
    return "Sua chave Pix está no período de segurança. O saque será liberado após o prazo exibido na carteira.";
  }
  if (/min_withdrawal_amount/i.test(code)) return "O valor solicitado está abaixo do mínimo permitido para saque.";
  if (/insufficient_available_balance/i.test(code)) return "Saldo disponível insuficiente.";
  if (/withdrawal_already_in_progress/i.test(code)) return "Já existe um saque em processamento. Aguarde a conclusão.";
  if (/driver_wallet_debt/i.test(code)) return "Sua carteira possui pendência financeira e não pode sacar agora.";
  return "Não foi possível solicitar o saque agora.";
}

export async function requestDriverWithdrawal(amountCents: number): Promise<void> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Informe um valor de saque válido.");

  const idempotencyKey = crypto.randomUUID();
  const { data, error } = await supabase.functions.invoke("request-driver-payout", {
    body: { amountCents, idempotencyKey },
  });

  if (!error && (!isRecord(data) || typeof data.error !== "string")) return;

  const providerCode = isRecord(data) && typeof data.error === "string" ? data.error : "";
  const detail = `${providerCode} ${error?.message ?? ""}`.trim();
  console.error("[APOIS Driver Finance] withdrawal failed", { detail });
  throw new Error(payoutErrorMessage(detail));
}
