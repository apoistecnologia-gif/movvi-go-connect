// Edge Function: aprovar motorista + criar cliente e assinatura na Asaas.
// Chamada pelo painel admin autenticado. Idempotente: reaprovar não duplica.
//
// Requer secrets: ASAAS_API_KEY, ASAAS_BASE_URL (opcional — default sandbox),
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")?.trim() ?? "";
const ASAAS_BASE_URL =
  Deno.env.get("ASAAS_BASE_URL")?.trim() || "https://api-sandbox.asaas.com/v3";

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

async function asaasFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!ASAAS_API_KEY) throw new Error("ASAAS_API_KEY_MISSING");
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: ASAAS_API_KEY,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ASAAS_HTTP_${res.status}:${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  // Cliente com o JWT do usuário para descobrir quem é
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return json({ error: "unauthorized" }, 401);

  // Cliente admin para operações
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
      "id,user_id,name,email,phone,cpf,city,state,approval_status,asaas_customer_id,asaas_subscription_id,next_due_date",
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
  if (driver.asaas_subscription_id) {
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
      subscriptionId: driver.asaas_subscription_id,
      dueDate: driver.next_due_date,
    });
  }

  // 1) Cliente Asaas
  let customerId = driver.asaas_customer_id as string | null;
  if (!customerId) {
    try {
      const c = await asaasFetch<{ id: string }>("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: driver.name,
          email: driver.email,
          mobilePhone: driver.phone,
          cpfCnpj: driver.cpf,
          externalReference: driver.id,
        }),
      });
      customerId = c.id;
      await admin.from("drivers").update({ asaas_customer_id: customerId }).eq("id", driver.id);
    } catch (e) {
      return json({ error: "asaas_customer_failed", detail: String(e) }, 502);
    }
  }

  // 2) Assinatura mensal
  const due = new Date();
  due.setDate(due.getDate() + 3);
  const nextDueDate = due.toISOString().slice(0, 10);

  let sub: { id: string; status: string; nextDueDate?: string };
  try {
    sub = await asaasFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "UNDEFINED",
        value: MONTHLY_FEE,
        nextDueDate,
        cycle: "MONTHLY",
        description: "Mensalidade Motorista MOVVI",
        externalReference: driver.id,
      }),
    });
  } catch (e) {
    return json({ error: "asaas_subscription_failed", detail: String(e) }, 502);
  }

  // 3) Primeira cobrança gerada
  let firstPayment:
    | { id: string; status: string; invoiceUrl?: string; bankSlipUrl?: string; dueDate?: string }
    | null = null;
  try {
    const list = await asaasFetch<{ data: Array<typeof firstPayment> }>(
      `/subscriptions/${sub.id}/payments`,
    );
    firstPayment = list.data?.[0] ?? null;
  } catch {
    /* ignore */
  }

  const invoiceUrl = firstPayment?.invoiceUrl ?? firstPayment?.bankSlipUrl ?? null;
  const nowIso = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await admin
    .from("drivers")
    .update({
      approval_status: "aprovado",
      approved_at: nowIso,
      documents_status: "approved",
      asaas_subscription_id: sub.id,
      subscription_value: MONTHLY_FEE,
      next_due_date: sub.nextDueDate ?? nextDueDate,
      financial_status: "pending",
      last_payment_id: firstPayment?.id ?? null,
      last_payment_status: firstPayment?.status ?? "PENDING",
      last_invoice_url: invoiceUrl,
    })
    .eq("id", driver.id);

  await admin.from("subscriptions").insert({
    driver_id: driver.id,
    status: "pending",
    amount: MONTHLY_FEE,
    period_start: nowIso,
    period_end: periodEnd,
    provider_reference: sub.id,
    asaas_payment_id: firstPayment?.id ?? null,
    payment_method: "pix",
    invoice_url: invoiceUrl,
  });

  await admin.from("driver_payment_events").insert({
    driver_id: driver.id,
    asaas_event: "SUBSCRIPTION_CREATED",
    asaas_payment_id: firstPayment?.id ?? null,
    asaas_subscription_id: sub.id,
    status: "PENDING",
    value: MONTHLY_FEE,
    due_date: sub.nextDueDate ?? nextDueDate,
    invoice_url: invoiceUrl,
    raw_payload: { source: "edge:approve-driver-and-create-subscription", subscription: sub },
  });

  return json({
    ok: true,
    alreadyExists: false,
    subscriptionId: sub.id,
    firstPaymentId: firstPayment?.id ?? null,
    invoiceUrl,
    dueDate: sub.nextDueDate ?? nextDueDate,
  });
});
