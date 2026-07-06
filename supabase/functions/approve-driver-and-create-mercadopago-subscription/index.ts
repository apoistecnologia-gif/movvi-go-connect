// Edge Function: aprovar motorista + criar assinatura (preapproval) no Mercado Pago.
// Chamada pelo painel admin autenticado. Idempotente.
//
// Secrets: MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_BASE_URL (default https://api.mercadopago.com),
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";
const MP_BASE_URL =
  Deno.env.get("MERCADOPAGO_BASE_URL")?.trim() || "https://api.mercadopago.com";

const MONTHLY_FEE = 49.9;

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
  if (!res.ok) {
    throw new Error(`MP_HTTP_${res.status}:${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`MP_BAD_JSON:${text.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (roleErr) return json({ error: "role_check_failed" }, 500);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: { driverId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const driverId = body.driverId;
  if (!driverId || typeof driverId !== "string") {
    return json({ error: "missing_driverId" }, 400);
  }

  const { data: driver, error: dErr } = await admin
    .from("drivers")
    .select(
      "id,user_id,name,email,phone,cpf,city,state,approval_status,mercadopago_preapproval_id,mercadopago_init_point,mercadopago_payer_id,next_due_date",
    )
    .eq("id", driverId)
    .maybeSingle();
  if (dErr || !driver) return json({ error: "driver_not_found" }, 404);

  const missing: string[] = [];
  if (!driver.name?.trim()) missing.push("nome");
  if (!driver.email?.trim()) missing.push("email");
  if (!driver.phone?.trim()) missing.push("telefone");
  if (!driver.cpf?.trim()) missing.push("CPF/CNPJ");
  if (!driver.city?.trim()) missing.push("cidade");
  if (!driver.state?.trim()) missing.push("estado");
  if (missing.length) return json({ error: "missing_required_fields", missing }, 422);

  // Idempotência
  if (driver.mercadopago_preapproval_id) {
    const patch: Record<string, unknown> = {};
    if (driver.approval_status !== "aprovado") {
      patch.approval_status = "aprovado";
      patch.approved_at = new Date().toISOString();
      patch.documents_status = "approved";
    }
    if (Object.keys(patch).length) {
      await admin.from("drivers").update(patch).eq("id", driver.id);
    }
    return json({
      ok: true,
      alreadyExists: true,
      preapprovalId: driver.mercadopago_preapproval_id,
      initPoint: driver.mercadopago_init_point,
      dueDate: driver.next_due_date,
    });
  }

  // Cria preapproval sem cartão vinculado — status "pending" gera init_point para
  // o motorista aceitar/pagar a assinatura no checkout do Mercado Pago.
  const nowIso = new Date().toISOString();
  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + 3);
  const nextDueDate = nextDue.toISOString().slice(0, 10);

  let preapproval: {
    id: string;
    init_point?: string;
    status?: string;
    payer_id?: number | string;
  };
  try {
    preapproval = await mpFetch("/preapproval", {
      method: "POST",
      body: JSON.stringify({
        reason: "Mensalidade Motorista MOVVI",
        external_reference: driver.id,
        payer_email: driver.email,
        back_url: "https://movvi-go-connect.lovable.app/motorista/assinatura",
        status: "pending",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: MONTHLY_FEE,
          currency_id: "BRL",
        },
      }),
    });
  } catch (e) {
    return json({ error: "mercadopago_preapproval_failed", detail: String(e) }, 502);
  }

  const initPoint = preapproval.init_point ?? null;
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await admin
    .from("drivers")
    .update({
      approval_status: "aprovado",
      approved_at: nowIso,
      documents_status: "approved",
      mercadopago_preapproval_id: preapproval.id,
      mercadopago_init_point: initPoint,
      mercadopago_payer_id: preapproval.payer_id ? String(preapproval.payer_id) : null,
      subscription_value: MONTHLY_FEE,
      subscription_status: "pending",
      financial_status: "pending",
      next_due_date: nextDueDate,
      last_payment_status: "PENDING",
      last_invoice_url: initPoint,
    })
    .eq("id", driver.id);

  await admin.from("subscriptions").insert({
    driver_id: driver.id,
    status: "pending",
    amount: MONTHLY_FEE,
    period_start: nowIso,
    period_end: periodEnd,
    provider_reference: preapproval.id,
    payment_method: "credit_card",
    invoice_url: initPoint,
  });

  await admin.from("driver_payment_events").insert({
    driver_id: driver.id,
    provider: "mercadopago",
    event_type: "preapproval.created",
    asaas_event: "PREAPPROVAL_CREATED",
    mp_preapproval_id: preapproval.id,
    status: preapproval.status ?? "pending",
    value: MONTHLY_FEE,
    due_date: nextDueDate,
    invoice_url: initPoint,
    raw_payload: {
      source: "edge:approve-driver-and-create-mercadopago-subscription",
      preapproval,
    },
  });

  return json({
    ok: true,
    alreadyExists: false,
    preapprovalId: preapproval.id,
    initPoint,
    dueDate: nextDueDate,
  });
});
