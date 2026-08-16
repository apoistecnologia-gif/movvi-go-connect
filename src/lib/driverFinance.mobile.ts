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

export interface DriverPayoutState {
  enabled: boolean;
  provider: string | null;
  reason: string | null;
  minWithdrawalCents: number;
  destinationConfirmed: boolean;
  payoutAvailableAt: string | null;
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
  payout: DriverPayoutState;
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
  if (!Number.isSafeInteger(value)) throw new Error("driver_finance_invalid_response");
  return value;
}

function nonNegativeInteger(record: Record<string, unknown>, key: string): number {
  const value = integer(record, key);
  if (value < 0) throw new Error("driver_finance_invalid_response");
  return value;
}

function nullableNumber(record: Record<string, unknown>, key: string): number | null {
  if (record[key] === null || record[key] === undefined) return null;
  const value = Number(record[key]);
  return Number.isFinite(value) && value >= 0 ? value : null;
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
    driverEarningCents: nonNegativeInteger(value, "driver_earning_cents"),
    platformFeeCents: nonNegativeInteger(value, "platform_fee_cents"),
    createdAt: requiredString(value, "created_at"),
    settledAt: nullableString(value, "settled_at"),
  };
}

function withdrawal(value: unknown): DriverWithdrawalItem {
  if (!isRecord(value)) throw new Error("driver_finance_invalid_response");
  return {
    id: requiredString(value, "id"),
    amountCents: nonNegativeInteger(value, "amount_cents"),
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

  const payoutState: DriverPayoutState = {
    enabled: payout["enabled"] === true,
    provider: nullableString(payout, "provider"),
    reason: nullableString(payout, "reason"),
    minWithdrawalCents: Math.max(1, nonNegativeInteger(payout, "min_withdrawal_cents")),
    destinationConfirmed: payout["destination_confirmed"] === true,
    payoutAvailableAt: nullableString(payout, "payout_available_at"),
  };

  return {
    driverId: requiredString(value, "driver_id"),
    period: {
      from: requiredString(period, "from"),
      to: requiredString(period, "to"),
      settledEarningsCents: nonNegativeInteger(period, "settled_earnings_cents"),
      settledRides: nonNegativeInteger(period, "settled_rides"),
    },
    kpis: {
      todayCents: nonNegativeInteger(kpis, "today_cents"),
      last7DaysCents: nonNegativeInteger(kpis, "last_7_days_cents"),
      monthCents: nonNegativeInteger(kpis, "month_cents"),
    },
    wallet: {
      balanceCents: integer(wallet, "balance_cents"),
      availableBalanceCents: nonNegativeInteger(wallet, "available_balance_cents"),
      pendingBalanceCents: nonNegativeInteger(wallet, "pending_balance_cents"),
      debtBalanceCents: nonNegativeInteger(wallet, "debt_balance_cents"),
      updatedAt: requiredString(wallet, "updated_at"),
    },
    payoutEnabled: payoutState.enabled,
    payout: payoutState,
    settlements: value["settlements"].map(settlement),
    withdrawals: value["withdrawals"].map(withdrawal),
  };
}

export async function loadDriverFinancialDashboard(
  from: Date,
  to: Date,
): Promise<DriverFinancialDashboard> {
  if (!Number.isFinite(from?.getTime()) || !Number.isFinite(to?.getTime()) || from.getTime() > to.getTime()) {
    throw new Error("Período financeiro inválido.");
  }
  const rpc = supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("get_driver_financial_dashboard", {
    _from: from.toISOString(),
    _to: to.toISOString(),
  });
  if (error) {
    console.error("[APOIS Driver Finance] dashboard failed", { code: error.code, message: error.message });
    throw new Error("Não foi possível carregar o financeiro agora.");
  }
  try {
    return parseDashboard(data);
  } catch (error) {
    console.error("[APOIS Driver Finance] invalid dashboard response", error);
    throw new Error("Não foi possível validar os dados financeiros agora.");
  }
}

function secureUuid(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("Não foi possível criar uma solicitação segura de saque neste aparelho.");
  }
  return crypto.randomUUID();
}

export async function requestDriverWithdrawal(amountCents: number): Promise<void> {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Informe um valor de saque válido.");

  const idempotencyKey = secureUuid();
  const { data, error } = await supabase.functions.invoke("request-driver-payout", {
    body: { amountCents, idempotencyKey },
  });

  const payload = isRecord(data) ? data : null;
  const backendError = payload && typeof payload["error"] === "string" ? payload["error"] : "";
  const backendDetail = payload && typeof payload["detail"] === "string" ? payload["detail"] : "";
  if (!error && !backendError) return;

  const message = `${backendError} ${backendDetail} ${error?.message ?? ""}`.trim();
  if (/driver_payouts_not_homologated|payout_provider_not_(?:asaas|configured|homologated)/i.test(message)) {
    throw new Error("Os saques ainda não estão liberados porque o provedor de transferência não foi homologado.");
  }
  if (/driver_not_eligible_for_payout/i.test(message)) {
    throw new Error("Seu cadastro não está elegível para solicitar saques agora.");
  }
  if (/asaas_subaccount_not_approved/i.test(message)) {
    throw new Error("Sua conta financeira de motorista ainda não está aprovada para receber saques.");
  }
  if (/asaas_subaccount_secret_missing|asaas_payout_webhook_not_ready/i.test(message)) {
    throw new Error("A integração de saque ainda não está pronta para esta conta. Tente novamente mais tarde.");
  }
  if (/pix_payout_destination_(?:not_confirmed|missing)/i.test(message)) {
    throw new Error("Confirme sua chave Pix na carteira antes de solicitar o saque.");
  }
  if (/pix_payout_destination_cooldown/i.test(message)) {
    throw new Error("Sua chave Pix está no período de segurança. Aguarde a liberação para solicitar o saque.");
  }
  if (/insufficient_available_balance/i.test(message)) throw new Error("Saldo disponível insuficiente.");
  if (/min_withdrawal_amount/i.test(message)) throw new Error("O valor solicitado é menor que o mínimo permitido para saque.");
  if (/driver_wallet_debt/i.test(message)) throw new Error("Sua carteira possui pendência financeira e não pode sacar agora.");
  if (/asaas_transfer_reconciliation_required/i.test(message)) {
    throw new Error("O saque foi registrado e está em conciliação com o provedor. Consulte o histórico antes de tentar novamente.");
  }
  if (/withdrawal_closed/i.test(message)) {
    throw new Error("Esta solicitação de saque já foi encerrada. Atualize o histórico antes de tentar novamente.");
  }
  if (/asaas_transfer_rejected|asaas_transfer_failed/i.test(message)) {
    throw new Error("O provedor não concluiu a transferência. O sistema preservará ou estornará o saldo conforme a conciliação.");
  }

  console.error("[APOIS Driver Finance] withdrawal failed", {
    message,
    idempotencyKey,
  });
  throw new Error("Não foi possível solicitar o saque agora.");
}
