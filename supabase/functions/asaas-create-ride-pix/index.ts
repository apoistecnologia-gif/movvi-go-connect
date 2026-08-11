import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { ASAAS_ENVIRONMENT, AsaasPixQr, asaasConfigured, asaasFetch, onlyDigits } from "../_shared/asaas.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}
function brl(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error("invalid_settlement_amount");
  return Number(n.toFixed(2));
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
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile } = await admin
      .from("users")
      .select("id,name,email,phone,cpf")
      .eq("auth_user_id", authResult.user.id)
      .maybeSingle();
    if (!profile) return json({ error: "profile_missing" }, 404);

    let body: { rideId?: string } = {};
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const rideId = String(body.rideId ?? "").trim();
    if (!rideId) return json({ error: "ride_id_required" }, 422);

    const { data: settlement, error: settlementError } = await admin
      .from("ride_settlements")
      .select("ride_id,passenger_id,driver_id,passenger_charge,payment_method,payment_status,status")
      .eq("ride_id", rideId)
      .maybeSingle();
    if (settlementError || !settlement) return json({ error: "ride_settlement_not_found" }, 404);
    if (settlement.passenger_id !== profile.id) return json({ error: "forbidden" }, 403);
    if (!settlement.driver_id) return json({ error: "ride_driver_missing" }, 409);
    if (String(settlement.payment_method).toLowerCase() !== "pix") return json({ error: "ride_payment_method_not_pix" }, 409);
    if (settlement.payment_status === "paid" || settlement.status === "settled") return json({ error: "ride_already_paid" }, 409);

    const { data: existing } = await admin
      .from("ride_pix_payments")
      .select("provider_payment_id,amount_cents,status,pix_payload,pix_expiration_at")
      .eq("ride_id", rideId)
      .maybeSingle();
    if (existing && ["pending", "confirmed"].includes(existing.status)) {
      return json({ ok: true, reused: true, provider: "asaas", environment: ASAAS_ENVIRONMENT, paymentId: existing.provider_payment_id, amountCents: existing.amount_cents, status: existing.status, pixPayload: existing.pix_payload, pixExpirationAt: existing.pix_expiration_at });
    }

    const { data: driverAccount } = await admin
      .from("driver_asaas_accounts")
      .select("wallet_id,status")
      .eq("driver_id", settlement.driver_id)
      .maybeSingle();
    if (!driverAccount?.wallet_id || ["rejected", "blocked", "error"].includes(String(driverAccount.status))) {
      return json({ error: "driver_asaas_account_not_ready" }, 409);
    }

    const cpfCnpj = onlyDigits(profile.cpf);
    if (!profile.name?.trim() || cpfCnpj.length !== 11) return json({ error: "passenger_billing_identity_incomplete", missing: [ ...(!profile.name?.trim() ? ["name"] : []), ...(cpfCnpj.length !== 11 ? ["cpf"] : []) ] }, 422);

    const customerReference = `apois-passenger-${profile.id}`;
    const listed = await asaasFetch<{ data?: Array<{ id: string }> }>(`/customers?externalReference=${encodeURIComponent(customerReference)}&limit=1`, { method: "GET" });
    let customerId = listed.data?.[0]?.id ?? null;
    if (!customerId) {
      const customer = await asaasFetch<{ id: string }>("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: profile.name.trim(),
          cpfCnpj,
          email: profile.email?.trim() || undefined,
          mobilePhone: onlyDigits(profile.phone) || undefined,
          externalReference: customerReference,
          notificationDisabled: false,
        }),
      });
      customerId = customer.id;
    }

    const amount = brl(settlement.passenger_charge);
    const paymentReference = `apois-ride-${rideId}`;
    const created = await asaasFetch<{ id: string; status?: string; dueDate?: string; value?: number }>("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "PIX",
        value: amount,
        dueDate: new Date().toISOString().slice(0, 10),
        description: `Corrida APOIS ${rideId.slice(0, 8)}`,
        externalReference: paymentReference,
        splits: [{
          walletId: driverAccount.wallet_id,
          percentualValue: 100,
          externalReference: `apois-driver-ride-${rideId}`,
          description: "Repasse integral líquido da corrida ao motorista",
        }],
      }),
    });
    if (!created.id) throw new Error("asaas_payment_id_missing");
    const pix = await asaasFetch<AsaasPixQr>(`/payments/${encodeURIComponent(created.id)}/pixQrCode`, { method: "GET" });
    const amountCents = Math.round(amount * 100);
    const { error: saveError } = await admin.from("ride_pix_payments").upsert({
      ride_id: rideId,
      passenger_id: profile.id,
      driver_id: settlement.driver_id,
      provider: "asaas",
      provider_payment_id: created.id,
      amount_cents: amountCents,
      status: "pending",
      pix_payload: pix.payload ?? null,
      pix_expiration_at: pix.expirationDate ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "ride_id" });
    if (saveError) throw saveError;

    await admin.from("ride_settlements").update({
      payment_provider: "asaas",
      provider_payment_id: created.id,
      payment_status: "pending",
      status: "awaiting_payment",
      updated_at: new Date().toISOString(),
    }).eq("ride_id", rideId);

    return json({
      ok: true,
      reused: false,
      provider: "asaas",
      environment: ASAAS_ENVIRONMENT,
      paymentId: created.id,
      amountCents,
      pixPayload: pix.payload ?? null,
      pixQrCodeBase64: pix.encodedImage ?? null,
      pixExpirationAt: pix.expirationDate ?? null,
    });
  } catch (error) {
    console.error("[asaas-create-ride-pix]", error);
    return json({ error: "asaas_ride_pix_failed", detail: String(error).slice(0, 500) }, 502);
  }
});
