import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  ASAAS_ENVIRONMENT,
  AsaasPayment,
  AsaasPixQr,
  asaasConfigured,
  asaasFetch,
  onlyDigits,
} from "../_shared/asaas.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MONTHLY_FEE = 49.90;
const MONTHLY_FEE_CENTS = 4990;

const corsHeaders = {
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    if (!asaasConfigured()) return json({ error: "asaas_not_configured" }, 503);

    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authResult, error: authError } = await userClient.auth.getUser();
    if (authError || !authResult.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("id")
      .eq("auth_user_id", authResult.user.id)
      .maybeSingle();
    if (profileError || !profile) return json({ error: "profile_missing" }, 404);

    const { data: driver, error: driverError } = await admin
      .from("drivers")
      .select("id,user_id,name,email,phone,cpf,approval_status,subscription_status")
      .eq("user_id", profile.id)
      .maybeSingle();
    if (driverError || !driver) return json({ error: "driver_not_found" }, 404);
    if (driver.approval_status !== "aprovado") return json({ error: "driver_not_approved" }, 403);

    const cpfCnpj = onlyDigits(driver.cpf);
    if (!driver.name?.trim() || cpfCnpj.length !== 11) {
      return json({ error: "driver_billing_identity_incomplete", missing: [
        ...(!driver.name?.trim() ? ["name"] : []),
        ...(cpfCnpj.length !== 11 ? ["cpf"] : []),
      ] }, 422);
    }

    const externalReference = `apois-driver-${driver.id}`;
    const { data: account } = await admin
      .from("driver_asaas_accounts")
      .select("root_customer_id")
      .eq("driver_id", driver.id)
      .maybeSingle();

    let customerId = account?.root_customer_id ?? null;
    if (!customerId) {
      const listed = await asaasFetch<{ data?: Array<{ id: string }> }>(
        `/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`,
        { method: "GET" },
      );
      customerId = listed.data?.[0]?.id ?? null;

      if (!customerId) {
        const customer = await asaasFetch<{ id: string }>("/customers", {
          method: "POST",
          body: JSON.stringify({
            name: driver.name.trim(),
            cpfCnpj,
            email: driver.email?.trim() || undefined,
            mobilePhone: onlyDigits(driver.phone) || undefined,
            externalReference,
            notificationDisabled: false,
          }),
        });
        customerId = customer.id;
      }

      const { error: accountUpsertError } = await admin.from("driver_asaas_accounts").upsert({
        driver_id: driver.id,
        root_customer_id: customerId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "driver_id" });
      if (accountUpsertError) throw accountUpsertError;
    }

    const { data: membership } = await admin
      .from("driver_memberships")
      .select("provider_subscription_id,status,paid_through")
      .eq("driver_id", driver.id)
      .maybeSingle();

    if (membership?.status === "active" && membership.paid_through && new Date(membership.paid_through) > new Date()) {
      return json({ ok: true, alreadyActive: true, paidThrough: membership.paid_through });
    }

    const subscriptionReference = `apois-membership-${driver.id}`;
    let subscriptionId = membership?.provider_subscription_id ?? null;
    if (!subscriptionId) {
      const existing = await asaasFetch<{ data?: Array<{ id: string; status?: string }> }>(
        `/subscriptions?externalReference=${encodeURIComponent(subscriptionReference)}&limit=1`,
        { method: "GET" },
      );
      subscriptionId = existing.data?.[0]?.id ?? null;

      if (!subscriptionId) {
        const created = await asaasFetch<{ id: string }>("/subscriptions", {
          method: "POST",
          body: JSON.stringify({
            customer: customerId,
            billingType: "PIX",
            value: MONTHLY_FEE,
            nextDueDate: today(),
            cycle: "MONTHLY",
            description: "Mensalidade Motorista APOIS",
            externalReference: subscriptionReference,
          }),
        });
        subscriptionId = created.id;
      }
    }

    const nowIso = new Date().toISOString();
    const { error: membershipUpsertError } = await admin.from("driver_memberships").upsert({
      driver_id: driver.id,
      provider: "asaas",
      provider_customer_id: customerId,
      provider_subscription_id: subscriptionId,
      monthly_fee_cents: MONTHLY_FEE_CENTS,
      status: "pending",
      next_due_date: today(),
      last_payment_status: "PENDING",
      updated_at: nowIso,
    }, { onConflict: "driver_id" });
    if (membershipUpsertError) throw membershipUpsertError;

    await admin.from("drivers").update({ subscription_status: "pending", updated_at: nowIso }).eq("id", driver.id);

    const payments = await asaasFetch<{ data?: AsaasPayment[] }>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`,
      { method: "GET" },
    );
    const payment = [...(payments.data ?? [])]
      .sort((a, b) => String(b.dueDate ?? "").localeCompare(String(a.dueDate ?? "")))[0];

    if (!payment?.id) {
      return json({
        ok: true,
        pendingGeneration: true,
        provider: "asaas",
        environment: ASAAS_ENVIRONMENT,
        subscriptionId,
      }, 202);
    }

    const pix = await asaasFetch<AsaasPixQr>(
      `/payments/${encodeURIComponent(payment.id)}/pixQrCode`,
      { method: "GET" },
    );

    const chargeStatus = String(payment.status ?? "PENDING").toUpperCase() === "OVERDUE" ? "overdue" : "pending";
    const { error: chargeError } = await admin.from("driver_membership_charges").upsert({
      driver_id: driver.id,
      provider_payment_id: payment.id,
      provider_subscription_id: subscriptionId,
      amount_cents: MONTHLY_FEE_CENTS,
      due_date: payment.dueDate ?? today(),
      status: chargeStatus,
      pix_payload: pix.payload ?? null,
      pix_expiration_at: pix.expirationDate ?? null,
      updated_at: nowIso,
    }, { onConflict: "provider_payment_id" });
    if (chargeError) throw chargeError;

    await admin.from("driver_memberships").update({
      current_payment_id: payment.id,
      next_due_date: payment.dueDate ?? today(),
      last_payment_status: String(payment.status ?? "PENDING").toUpperCase(),
      updated_at: nowIso,
    }).eq("driver_id", driver.id);

    return json({
      ok: true,
      provider: "asaas",
      environment: ASAAS_ENVIRONMENT,
      amountCents: MONTHLY_FEE_CENTS,
      subscriptionId,
      paymentId: payment.id,
      dueDate: payment.dueDate ?? today(),
      pixPayload: pix.payload ?? null,
      pixQrCodeBase64: pix.encodedImage ?? null,
      pixExpirationAt: pix.expirationDate ?? null,
    });
  } catch (error) {
    console.error("[asaas-create-driver-membership]", error);
    return json({ error: "asaas_membership_failed", detail: String(error).slice(0, 500) }, 502);
  }
});
