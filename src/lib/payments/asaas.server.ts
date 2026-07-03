// Server-only Asaas HTTP client. Never import this from client code.
// Keys are read from process.env at call time (server functions / routes only).

import type {
  CreateMonthlyChargeInput,
  EnsureCustomerInput,
  EnsureCustomerResult,
  PaymentProvider,
  SubscriptionChargeResult,
} from "./types";

const ASAAS_BASE = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};

function envMode(): "sandbox" | "production" {
  const raw = (process.env.ASAAS_ENVIRONMENT ?? "sandbox").toLowerCase();
  return raw === "production" ? "production" : "sandbox";
}

function envKey(): string | null {
  return process.env.ASAAS_API_KEY?.trim() || null;
}

async function asaasFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = envKey();
  if (!key) throw new Error("ASAAS_API_KEY_MISSING");
  const base = ASAAS_BASE[envMode()];
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: key,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ASAAS_HTTP_${res.status}:${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// ---------- Public provider implementation ----------

export const asaasProvider: PaymentProvider = {
  id: "asaas",

  isConfigured() {
    return Boolean(envKey());
  },

  async ensureCustomer(input: EnsureCustomerInput): Promise<EnsureCustomerResult> {
    if (!this.isConfigured()) {
      // Safe dev fallback: pseudo customer id so the flow keeps moving locally.
      return { provider: "asaas", customerId: `dev_${input.driverId}` };
    }
    const body = {
      name: input.name,
      email: input.email,
      mobilePhone: input.phone ?? undefined,
      cpfCnpj: input.cpfCnpj ?? undefined,
      externalReference: input.driverId,
    };
    const data = await asaasFetch<{ id: string }>("/customers", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { provider: "asaas", customerId: data.id };
  },

  async createMonthlyCharge(input: CreateMonthlyChargeInput): Promise<SubscriptionChargeResult> {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);
    const isoDue = dueDate.toISOString().slice(0, 10);

    if (!this.isConfigured()) {
      // Safe dev fallback — returns a pending mock charge without hitting Asaas.
      return {
        provider: "asaas",
        providerReference: `dev_charge_${Date.now()}`,
        status: "pending",
        amount: input.amount,
        currency: "BRL",
        method: input.method,
        invoiceUrl: null,
        pixQrCode: null,
        pixCopyPaste: null,
        dueDate: isoDue,
      };
    }

    const billingType = input.method === "pix" ? "PIX" : "CREDIT_CARD";
    const payment = await asaasFetch<{
      id: string;
      status: string;
      value: number;
      invoiceUrl?: string;
      dueDate?: string;
    }>("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: input.customerId,
        billingType,
        value: input.amount,
        dueDate: isoDue,
        description: input.description ?? "Mensalidade Motorista MOVVI",
        externalReference: input.driverId,
      }),
    });

    let pixQrCode: string | null = null;
    let pixCopyPaste: string | null = null;
    if (billingType === "PIX") {
      try {
        const qr = await asaasFetch<{ encodedImage?: string; payload?: string }>(
          `/payments/${payment.id}/pixQrCode`,
        );
        pixQrCode = qr.encodedImage ?? null;
        pixCopyPaste = qr.payload ?? null;
      } catch {
        // ignore — user can still open invoiceUrl
      }
    }

    return {
      provider: "asaas",
      providerReference: payment.id,
      status: payment.status?.toUpperCase() === "CONFIRMED" ? "paid" : "pending",
      amount: payment.value ?? input.amount,
      currency: "BRL",
      method: input.method,
      invoiceUrl: payment.invoiceUrl ?? null,
      pixQrCode,
      pixCopyPaste,
      dueDate: payment.dueDate ?? isoDue,
    };
  },

  parseWebhook(payload: unknown) {
    const p = (payload ?? {}) as {
      event?: string;
      payment?: { id?: string; status?: string; paymentDate?: string; confirmedDate?: string };
    };
    const ref = p.payment?.id ?? null;
    const event = (p.event ?? "").toUpperCase();
    const paidAt = p.payment?.paymentDate ?? p.payment?.confirmedDate ?? null;

    if (event.includes("CONFIRMED") || event.includes("RECEIVED")) {
      return { providerReference: ref, status: "paid" as const, paidAt };
    }
    if (event.includes("REFUNDED")) {
      return { providerReference: ref, status: "refunded" as const, paidAt: null };
    }
    if (event.includes("OVERDUE") || event.includes("EXPIRED")) {
      return { providerReference: ref, status: "expired" as const, paidAt: null };
    }
    if (event.includes("DELETED") || event.includes("FAILED") || event.includes("CHARGEBACK")) {
      return { providerReference: ref, status: "failed" as const, paidAt: null };
    }
    return { providerReference: ref, status: "unknown" as const, paidAt: null };
  },
};

export function getWebhookSecret(): string | null {
  return process.env.ASAAS_WEBHOOK_SECRET?.trim() || null;
}
