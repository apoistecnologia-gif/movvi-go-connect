const environment = (Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox").trim().toLowerCase();
const rootApiKey = Deno.env.get("ASAAS_API_KEY")?.trim() ?? "";

export const ASAAS_BASE_URL = environment === "production"
  ? "https://api.asaas.com/v3"
  : "https://api-sandbox.asaas.com/v3";

export const ASAAS_ENVIRONMENT = environment === "production" ? "production" : "sandbox";

export function asaasConfigured(): boolean {
  return rootApiKey.length > 20;
}

export function rootAsaasApiKey(): string {
  if (!asaasConfigured()) throw new Error("ASAAS_API_KEY_MISSING");
  return rootApiKey;
}

export async function asaasFetch<T>(
  path: string,
  init: RequestInit = {},
  apiKey: string = rootAsaasApiKey(),
): Promise<T> {
  const response = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": `APOIS-Corridas/1.0 (${ASAAS_ENVIRONMENT}; Supabase Edge)`,
      "access_token": apiKey,
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`ASAAS_HTTP_${response.status}:${detail.slice(0, 500)}`);
  }
  return body as T;
}

export function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function centsToBrl(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("invalid_amount_cents");
  return Number((cents / 100).toFixed(2));
}

export type AsaasPayment = {
  id: string;
  customer?: string;
  subscription?: string;
  billingType?: string;
  value?: number;
  netValue?: number;
  status?: string;
  dueDate?: string;
  paymentDate?: string;
  clientPaymentDate?: string;
  externalReference?: string;
};

export type AsaasPixQr = {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
};
