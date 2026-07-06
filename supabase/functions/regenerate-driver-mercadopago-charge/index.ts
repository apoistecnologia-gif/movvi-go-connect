// Edge Function: gerar nova cobrança Mercado Pago (Checkout Pro) para um motorista.
// Diferente de approve-driver-and-create-mercadopago-subscription, esta função
// sempre cria uma nova preference — usada pelo botão "Gerar cobrança" no admin
// para renovar a mensalidade sob demanda, sem esperar o cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";

function resolveMercadoPagoBaseUrl(value: string | undefined): string {
  const official = "https://api.mercadopago.com";
  const normalized = value?.trim().replace(/\/+$/, "");
  if (!normalized) return official;
  if (normalized === official) return official;
  console.warn("[regen-mp] ignoring invalid MERCADOPAGO_BASE_URL", normalized);
  return official;
}
const MP_BASE_URL = resolveMercadoPagoBaseUrl(Deno.env.get("MERCADOPAGO_BASE_URL"));

const MONTHLY_FEE = 49.9;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

async function mpFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!MP_TOKEN) throw new Error("MERCADOPAGO_ACCESS_TOKEN_MISSING");
  const res = await fetch(`${MP_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MP_TOKEN}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MP_HTTP_${res.status}:${text.slice(0, 400)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`MP_BAD_JSON:${text.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    const userId = userRes?.user?.id;
    if (userErr || !userId) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: roleRow, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) return json({ error: "role_check_failed", detail: roleErr.message }, 500);
    if (!roleRow) return json({ error: "forbidden" }, 403);

    let body: { driverId?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const driverId = body.driverId;
    if (!driverId || typeof driverId !== "string") return json({ error: "missing_driverId" }, 400);

    const { data: driver, error: dErr } = await admin
      .from("drivers")
      .select("id,user_id,name,email,phone,cpf,city,state,approval_status")
      .eq("id", driverId)
      .maybeSingle();
    if (dErr || !driver) return json({ error: "driver_not_found" }, 404);
    if (driver.approval_status !== "aprovado") {
      return json({ error: "driver_not_approved" }, 422);
    }

    const missing: string[] = [];
    if (!driver.name?.trim()) missing.push("nome");
    if (!driver.email?.trim()) missing.push("email");
    if (missing.length) return json({ error: "missing_required_fields", missing }, 422);

    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 3);
    const nextDueDate = nextDue.toISOString().slice(0, 10);

    let preference: { id: string; init_point?: string; sandbox_init_point?: string };
    try {
      preference = await mpFetch("/checkout/preferences", {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              id: `mensalidade-${driver.id}-${Date.now()}`,
              title: "Mensalidade Motorista MOVVI",
              description: "Renovação mensal do motorista MOVVI",
              quantity: 1,
              currency_id: "BRL",
              unit_price: MONTHLY_FEE,
            },
          ],
          external_reference: driver.id,
          metadata: { driver_id: driver.id, kind: "monthly_fee", source: "manual_regenerate" },
          back_urls: {
            success: "https://movvi-go-connect.lovable.app/motorista/assinatura",
            failure: "https://movvi-go-connect.lovable.app/motorista/assinatura",
            pending: "https://movvi-go-connect.lovable.app/motorista/assinatura",
          },
          auto_return: "approved",
          notification_url: `${SUPABASE_URL}/functions/v1/mercadopago-webhook`,
        }),
      });
    } catch (e) {
      const detail = String(e);
      console.error("[regen-mp] Mercado Pago preference failed", detail);
      return json({ error: "mercadopago_preference_failed", detail }, 502);
    }

    const initPoint = preference.init_point ?? preference.sandbox_init_point ?? null;
    const nowIso = new Date().toISOString();
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await admin
      .from("drivers")
      .update({
        mercadopago_preapproval_id: preference.id,
        mercadopago_init_point: initPoint,
        subscription_value: MONTHLY_FEE,
        subscription_status: "pending",
        financial_status: "pending",
        next_due_date: nextDueDate,
        last_payment_status: "PENDING",
        last_invoice_url: initPoint,
      })
      .eq("id", driver.id);

    await admin.from("subscriptions").insert({
      driver_id: driver.user_id,
      status: "pending",
      amount: MONTHLY_FEE,
      period_start: nowIso,
      period_end: periodEnd,
      provider_reference: preference.id,
      payment_method: "checkout_pro",
      invoice_url: initPoint,
    });

    await admin.from("driver_payment_events").insert({
      driver_id: driver.id,
      provider: "mercadopago",
      event_type: "preference.manual_regenerated",
      asaas_event: "PREFERENCE_MANUAL_REGENERATED",
      mp_preapproval_id: preference.id,
      status: "pending",
      value: MONTHLY_FEE,
      due_date: nextDueDate,
      invoice_url: initPoint,
      raw_payload: {
        source: "edge:regenerate-driver-mercadopago-charge",
        triggered_by: userId,
        preference,
      },
    });

    await admin.from("notification_inbox").insert({
      user_id: driver.user_id,
      title: "Nova cobrança disponível",
      body: "Sua mensalidade MOVVI está pronta para pagamento.",
      category: "payment",
      data: { init_point: initPoint, kind: "monthly_fee_manual" },
    });

    return json({
      ok: true,
      preferenceId: preference.id,
      initPoint,
      dueDate: nextDueDate,
    });
  } catch (e) {
    console.error("[regen-mp] unexpected", e);
    return json({ error: "unexpected_error", detail: String(e).slice(0, 300) }, 500);
  }
});
