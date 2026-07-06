// Public webhook endpoint que o Asaas chama para notificar mudanças de cobrança.
// Deploy: verify_jwt = false (config.toml). Segurança feita via header
// `asaas-access-token` comparado ao secret ASAAS_WEBHOOK_TOKEN.
//
// URL pública (produção):
//   https://ekddifjpbieuainvjlbl.supabase.co/functions/v1/asaas-webhook
//
// Configure este endpoint no painel Asaas em Integrações > Webhooks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token, x-asaas-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AsaasWebhookPayload {
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    value?: number;
    subscription?: string;
    dueDate?: string;
    paymentDate?: string;
    confirmedDate?: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    customer?: string;
  };
}

function parseWebhook(payload: AsaasWebhookPayload) {
  const event = (payload.event ?? "").toUpperCase();
  const p = payload.payment ?? {};
  let status: "paid" | "pending" | "refunded" | "expired" | "failed" | "unknown" = "unknown";
  if (event.includes("CONFIRMED") || event.includes("RECEIVED")) status = "paid";
  else if (event.includes("REFUNDED")) status = "refunded";
  else if (event.includes("OVERDUE") || event.includes("EXPIRED")) status = "expired";
  else if (event.includes("DELETED") || event.includes("FAILED") || event.includes("CHARGEBACK"))
    status = "failed";
  else if (event.includes("CREATED") || event.includes("UPDATED")) status = "pending";

  return {
    event,
    providerReference: p.id ?? null,
    status,
    paidAt: p.paymentDate ?? p.confirmedDate ?? null,
    subscriptionId: p.subscription ?? null,
    customerId: p.customer ?? null,
    value: typeof p.value === "number" ? p.value : null,
    dueDate: p.dueDate ?? null,
    invoiceUrl: p.invoiceUrl ?? null,
    bankSlipUrl: p.bankSlipUrl ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405, headers: corsHeaders });
  }

  const expected = Deno.env.get("ASAAS_WEBHOOK_TOKEN")?.trim() ?? "";
  if (!expected) {
    return new Response("webhook_secret_not_configured", { status: 503, headers: corsHeaders });
  }
  const provided =
    req.headers.get("asaas-access-token") ?? req.headers.get("x-asaas-token") ?? "";
  if (!provided || provided !== expected) {
    return new Response("invalid_signature", { status: 401, headers: corsHeaders });
  }

  const raw = await req.text();
  let payload: AsaasWebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("invalid_json", { status: 400, headers: corsHeaders });
  }

  const parsed = parseWebhook(payload);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Localizar motorista
  let driverId: string | null = null;
  if (parsed.subscriptionId) {
    const { data } = await supabase
      .from("drivers")
      .select("id")
      .eq("asaas_subscription_id", parsed.subscriptionId)
      .maybeSingle();
    driverId = data?.id ?? null;
  }
  if (!driverId && parsed.customerId) {
    const { data } = await supabase
      .from("drivers")
      .select("id")
      .eq("asaas_customer_id", parsed.customerId)
      .maybeSingle();
    driverId = data?.id ?? null;
  }
  if (!driverId && parsed.providerReference) {
    const { data } = await supabase
      .from("drivers")
      .select("id")
      .eq("last_payment_id", parsed.providerReference)
      .maybeSingle();
    driverId = data?.id ?? null;
  }

  // Log evento
  await supabase.from("driver_payment_events").insert({
    driver_id: driverId,
    asaas_event: parsed.event || "UNKNOWN",
    asaas_payment_id: parsed.providerReference,
    asaas_subscription_id: parsed.subscriptionId,
    status: parsed.status,
    value: parsed.value,
    due_date: parsed.dueDate,
    paid_at: parsed.paidAt,
    invoice_url: parsed.invoiceUrl ?? parsed.bankSlipUrl,
    raw_payload: payload as unknown as Record<string, unknown>,
  });

  if (!driverId) {
    return new Response(JSON.stringify({ ok: true, note: "driver_not_matched" }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const driverPatch: Record<string, unknown> = {
    last_payment_id: parsed.providerReference,
    last_payment_status: parsed.status.toUpperCase(),
    last_invoice_url: parsed.invoiceUrl ?? parsed.bankSlipUrl,
  };
  if (parsed.dueDate) driverPatch.next_due_date = parsed.dueDate;
  if (parsed.status === "paid") driverPatch.financial_status = "active";
  else if (parsed.status === "expired" || parsed.status === "failed")
    driverPatch.financial_status = "overdue";
  else if (parsed.status === "refunded") driverPatch.financial_status = "cancelled";
  else if (parsed.status === "pending") driverPatch.financial_status = "pending";

  await supabase.from("drivers").update(driverPatch).eq("id", driverId);

  if (parsed.providerReference) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id")
      .or(
        `asaas_payment_id.eq.${parsed.providerReference},provider_reference.eq.${parsed.providerReference}`,
      )
      .maybeSingle();
    if (sub) {
      const subPatch: Record<string, unknown> = {};
      if (parsed.status === "paid") {
        subPatch.status = "active";
        subPatch.paid_at = parsed.paidAt ?? new Date().toISOString();
        subPatch.period_end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      } else if (parsed.status === "expired") subPatch.status = "expired";
      else if (parsed.status === "failed") subPatch.status = "blocked";
      else if (parsed.status === "refunded") subPatch.status = "cancelled";
      if (Object.keys(subPatch).length) {
        await supabase.from("subscriptions").update(subPatch).eq("id", sub.id);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
