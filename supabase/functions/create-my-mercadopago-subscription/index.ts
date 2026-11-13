// Edge Function: motorista autenticado gera (ou reaproveita) a própria
// preference de mensalidade no Mercado Pago.
//
// - Requer JWT do motorista (verify_jwt = true no config.toml).
// - external_reference SEMPRE = driver.id (garante que o webhook libere apenas
//   aquele motorista específico).
// - Idempotente: se já existe uma init_point pendente para o motorista, retorna
//   ela em vez de criar outra.
//
// Secrets: MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_BASE_URL (opcional),
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";

function resolveBase(v: string | undefined): string {
  const official = "https://api.mercadopago.com";
  const n = v?.trim().replace(/\/+$/, "");
  return !n || n !== official ? official : n;
}
const MP_BASE_URL = resolveBase(Deno.env.get("MERCADOPAGO_BASE_URL"));

const MONTHLY_FEE = 59.9;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    if (req.method === "OPTIONS")
      return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer "))
      return json({ error: "unauthorized" }, 401);

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

    const { data: driver, error: dErr } = await admin
      .from("drivers")
      .select(
        "id,user_id,name,email,phone,cpf,city,state,approval_status,financial_status,mercadopago_init_point,mercadopago_preapproval_id",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (dErr || !driver) return json({ error: "driver_not_found" }, 404);
    if (driver.approval_status !== "aprovado")
      return json({ error: "driver_not_approved" }, 403);
    if (driver.financial_status === "active")
      return json({ error: "already_active" }, 409);

    // Idempotência: reaproveita link pendente vigente.
    if (
      driver.mercadopago_init_point &&
      (driver.financial_status === "pending" ||
        driver.financial_status === "inactive")
    ) {
      return json({
        ok: true,
        reused: true,
        initPoint: driver.mercadopago_init_point,
        preapprovalId: driver.mercadopago_preapproval_id,
      });
    }

    const missing: string[] = [];
    if (!driver.name?.trim()) missing.push("nome");
    if (!driver.email?.trim()) missing.push("email");
    if (missing.length)
      return json({ error: "missing_required_fields", missing }, 422);

    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 3);
    const nextDueDate = nextDue.toISOString().slice(0, 10);

    let preference: {
      id: string;
      init_point?: string;
      sandbox_init_point?: string;
    };
    try {
      preference = await mpFetch("/checkout/preferences", {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              id: `mensalidade-${driver.id}-${Date.now()}`,
              title: "Mensalidade Motorista MOVVI",
              description: "Mensalidade mensal do motorista MOVVI",
              quantity: 1,
              currency_id: "BRL",
              unit_price: MONTHLY_FEE,
            },
          ],
          // CRÍTICO: identifica o motorista específico no webhook.
          external_reference: driver.id,
          metadata: {
            driver_id: driver.id,
            user_id: driver.user_id,
            subscription_type: "monthly",
            kind: "monthly_fee",
            source: "driver_self_service",
          },
          back_urls: {
            success:
              "https://movvi-go-connect.lovable.app/motorista/assinatura",
            failure:
              "https://movvi-go-connect.lovable.app/motorista/assinatura",
            pending:
              "https://movvi-go-connect.lovable.app/motorista/assinatura",
          },
          auto_return: "approved",
          notification_url: `${SUPABASE_URL}/functions/v1/mercadopago-webhook`,
        }),
      });
    } catch (e) {
      const detail = String(e);
      console.error("[create-my-mp] preference failed", detail);
      return json({ error: "mercadopago_preference_failed", detail }, 502);
    }

    const initPoint =
      preference.init_point ?? preference.sandbox_init_point ?? null;
    const nowIso = new Date().toISOString();
    const periodEnd = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

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
      event_type: "preference.driver_self_created",
      asaas_event: "PREFERENCE_SELF_CREATED",
      mp_preapproval_id: preference.id,
      status: "pending",
      value: MONTHLY_FEE,
      due_date: nextDueDate,
      invoice_url: initPoint,
      raw_payload: {
        source: "edge:create-my-mercadopago-subscription",
        triggered_by: userId,
        preference,
      },
    });

    return json({
      ok: true,
      reused: false,
      initPoint,
      preapprovalId: preference.id,
      dueDate: nextDueDate,
    });
  } catch (e) {
    console.error("[create-my-mp] unexpected", e);
    return json(
      { error: "unexpected_error", detail: String(e).slice(0, 300) },
      500,
    );
  }
});
