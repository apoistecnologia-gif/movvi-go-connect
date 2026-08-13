export type PaymentMethodCode = "pix" | "credit" | "debit" | "wallet" | "cash";
export type ElectronicPaymentMethod = Exclude<PaymentMethodCode, "wallet" | "cash">;
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type ProviderPaymentEvent = {
  provider: string;
  eventKey: string;
  providerReference: string;
  rideId: string;
  amountCents: number;
  providerFeeCents: number;
  status: PaymentStatus;
  rawPayload?: unknown;
};

export type CreateRideCharge = {
  rideId: string;
  passengerId: string;
  method: ElectronicPaymentMethod;
  amountCents: number;
  idempotencyKey: string;
  description: string;
};

export type CreateRideChargeResult = {
  provider: string;
  providerReference: string;
  status: PaymentStatus;
  amountCents: number;
  checkoutUrl?: string | null;
  pixCopyPaste?: string | null;
  pixQrCodeBase64?: string | null;
  expiresAt?: string | null;
};

export type CreatePayout = {
  withdrawalId: string;
  driverId: string;
  amountCents: number;
  idempotencyKey: string;
};

export type CreatePayoutResult = {
  provider: string;
  providerTransferId: string;
  status: "processing" | "paid" | "failed";
  failureReason?: string | null;
};

/**
 * Provider port for money that crosses APOIS' custody boundary.
 *
 * Implementations MUST be server-only. A provider implementation never gets
 * to choose the fare, Driver earning or platform revenue; those values come
 * from the persisted RideSettlement.
 */
export interface PaymentProvider {
  readonly id: string;
  isConfigured(): boolean;
  createRideCharge?(input: CreateRideCharge): Promise<CreateRideChargeResult>;
  parseWebhook?(request: Request): Promise<ProviderPaymentEvent | null>;
  createPayout?(input: CreatePayout): Promise<CreatePayoutResult>;
}

export function requirePositiveCents(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`invalid_${field}`);
  return parsed;
}

export function normalizeProviderId(value: unknown): string {
  const id = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(id)) throw new Error("invalid_payment_provider");
  return id;
}
