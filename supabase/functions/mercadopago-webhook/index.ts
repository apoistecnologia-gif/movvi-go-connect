// Edge Function: recebe webhooks do Mercado Pago.
// Configurar no painel MP: URL = https://ekddifjpbieuainvjlbl.supabase.co/functions/v1/mercadopago-webhook
// Eventos: payment, subscription_authorized_payment, subscription_preapproval.
//
// Secrets: MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET,
// MERCADOPAGO_BASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";
const MP_WEBHOOK_SECRET = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET")?.trim() ?? "";
const MP_BASE_URL =
  Deno.env.get("MERCADOPAGO_BASE_URL")?.trim() || "https://api.mercadopago.com";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

async function mpFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${MP_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MP_HTTP_${res.status}:${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

// Verifica assinatura HMAC do webhook do Mercado Pago.
// Formato do header x-signature: "ts=<ts>,v1=<hash>"
// Manifest: `id:<dataId>;request-id:<x-request-id>;ts:<ts>;`
async function verifySignature(
  dataId: string,
  xRequestId: string,
  xSignature: string,
): Promise<boolean> {
  if (!MP_WEBHOOK_SECRET) return true; // sem secret configurado, aceita (dev)
  if (!xSignature) return false;
  const parts = Object.fromEntries(
    xSignature.split(",").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k, rest.join("=")];
    }),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(manifest),
  );
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === v1;
}

function mapPaymentToFinancial(status: string): {
  financial: "active" | "pending" | "overdue" | "cancelled";
  subscription: "active" | "pending" | "overdue" | "cancelled";
} {
  switch (status) {
    case "approved":
      return { financial: "active", subscription: "active" };
    case "pending":
    case "in_process":
    case "authorized":
      return { financial: "pending", subscription: "pending" };
    case "rejected":
    case "cancelled":
    case "refunded":
    case "charged_back":
      return { financial: "overdue", subscription: "overdue" };
    default:
      return { financial: "pending", subscription: "pending" };
  }
}

function mapPreapprovalStatus(status: string): {
  financial: "active" | "pending" | "overdue" | "cancelled";
  subscription: "active" | "pending" | "overdue" | "cancelled";
} {
  switch (status) {
    case "authorized":
      return { financial: "active", subscription: "active" };
    case "pending":
      return { financial: "pending", subscription: "pending" };
    case "paused":
      return { financial: "overdue", subscription: "overdue" };
    case "cancelled":
    case "finished":
      return { financial: "cancelled", subscription: "cancelled" };
    default:
      return { financial: "pending", subscription: "pending" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: {
    type?: string;
    action?: string;
    data?: { id?: string | number };
    id?: string | number;
  };
  const rawBody = await req.text();
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const url = new URL(req.url);
  const qType = url.searchParams.get("type") ?? url.searchParams.get("topic");
  const qId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  const type = (payload.type ?? qType ?? "").toString();
  const dataId = String(payload.data?.id ?? payload.id ?? qId ?? "");
  const xSignature = req.headers.get("x-signature") ?? "";
  const xRequestId = req.headers.get("x-request-id") ?? "";

  // Log preliminar
  await admin.from("driver_payment_events").insert({
    provider: "mercadopago",
    event_type: `${type}${payload.action ? `:${payload.action}` : ""}`,
    asaas_event: `MP_${(type || "unknown").toUpperCase()}`,
    status: "received",
    raw_payload: { headers: { xRequestId, xSignature: xSignature ? "present" : "absent" }, body: payload, query: Object.fromEntries(url.searchParams) },
  });

  if (!dataId) {
    return json({ ok: true, ignored: "no_data_id" });
  }

  const validSig = await verifySignature(dataId, xRequestId, xSignature).catch(() => false);
  if (!validSig && MP_WEBHOOK_SECRET) {
    return json({ error: "invalid_signature" }, 401);
  }

  try {
    if (type === "payment") {
      const pay = await mpFetch<{
        id: number;
        status: string;
        status_detail?: string;
        transaction_amount?: number;
        date_approved?: string | null;
        external_reference?: string | null;
        preapproval_id?: string | null;
        metadata?: Record<string, unknown>;
      }>(`/v1/payments/${dataId}`);

      const preapprovalId =
        pay.preapproval_id ??
        (pay.metadata?.preapproval_id as string | undefined) ??
        null;

      let driverId: string | null = null;
      let driverUserId: string | null = null;
      if (preapprovalId) {
        const { data: d } = await admin
          .from("drivers")
          .select("id,user_id")
          .eq("mercadopago_preapproval_id", preapprovalId)
          .maybeSingle();
        driverId = d?.id ?? null;
        driverUserId = d?.user_id ?? null;
      }
      if (!driverId && pay.external_reference) {
        const { data: d } = await admin
          .from("drivers")
          .select("id,user_id")
          .eq("id", pay.external_reference)
          .maybeSingle();
        driverId = d?.id ?? pay.external_reference;
        driverUserId = d?.user_id ?? null;
      }

      const mapped = mapPaymentToFinancial(pay.status);

      if (driverId) {
        const patch: Record<string, unknown> = {
          last_payment_id: String(pay.id),
          last_payment_status: pay.status,
          financial_status: mapped.financial,
          subscription_status: mapped.subscription,
        };
        if (pay.status === "approved") {
          const nextDue = new Date();
          nextDue.setDate(nextDue.getDate() + 30);
          patch.next_due_date = nextDue.toISOString().slice(0, 10);
          patch.subscription_expires_at = nextDue.toISOString();
        }
        await admin.from("drivers").update(patch).eq("id", driverId);

        if (driverUserId) {
          await admin.from("subscriptions").insert({
            driver_id: driverUserId,
            status: pay.status === "approved" ? "active" : mapped.subscription,
            amount: pay.transaction_amount ?? null,
            period_start: new Date().toISOString(),
            period_end:
              pay.status === "approved"
                ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                : null,
            provider_reference: preapprovalId,
            payment_method: "credit_card",
            paid_at: pay.date_approved ?? null,
          });

          if (pay.status === "approved") {
            await admin.from("notification_inbox").insert({
              user_id: driverUserId,
              title: "Mensalidade paga com sucesso",
              body: "Sua mensalidade MOVVI foi confirmada. Bons rolês!",
              category: "billing",
              data: { payment_id: String(pay.id), amount: pay.transaction_amount ?? null },
            });
          }
        }
      }

      await admin.from("driver_payment_events").insert({
        driver_id: driverId,
        provider: "mercadopago",
        event_type: `payment.${pay.status}`,
        asaas_event: `MP_PAYMENT_${pay.status.toUpperCase()}`,
        mp_payment_id: String(pay.id),
        mp_preapproval_id: preapprovalId,
        status: pay.status,
        value: pay.transaction_amount ?? null,
        paid_at: pay.date_approved ?? null,
        raw_payload: { payment: pay },
      });

      return json({ ok: true, processed: "payment", driverId, status: pay.status });
    }

    if (type === "preapproval" || type === "subscription_preapproval") {
      const pa = await mpFetch<{
        id: string;
        status: string;
        external_reference?: string | null;
        payer_id?: number | string;
        init_point?: string;
      }>(`/preapproval/${dataId}`);

      let driverId: string | null = null;
      const { data: d } = await admin
        .from("drivers")
        .select("id")
        .eq("mercadopago_preapproval_id", pa.id)
        .maybeSingle();
      driverId = d?.id ?? pa.external_reference ?? null;

      const mapped = mapPreapprovalStatus(pa.status);
      if (driverId) {
        await admin
          .from("drivers")
          .update({
            mercadopago_preapproval_id: pa.id,
            mercadopago_init_point: pa.init_point ?? undefined,
            mercadopago_payer_id: pa.payer_id ? String(pa.payer_id) : undefined,
            financial_status: mapped.financial,
            subscription_status: mapped.subscription,
          })
          .eq("id", driverId);
      }

      await admin.from("driver_payment_events").insert({
        driver_id: driverId,
        provider: "mercadopago",
        event_type: `preapproval.${pa.status}`,
        asaas_event: `MP_PREAPPROVAL_${pa.status.toUpperCase()}`,
        mp_preapproval_id: pa.id,
        status: pa.status,
        raw_payload: { preapproval: pa },
      });

      return json({ ok: true, processed: "preapproval", driverId, status: pa.status });
    }

    return json({ ok: true, ignored: type });
  } catch (e) {
    await admin.from("driver_payment_events").insert({
      provider: "mercadopago",
      event_type: `error:${type}`,
      asaas_event: "MP_ERROR",
      status: "error",
      raw_payload: { error: String(e), body: payload },
    });
    return json({ error: "processing_failed", detail: String(e) }, 500);
  }
});
