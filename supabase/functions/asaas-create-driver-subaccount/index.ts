import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { ASAAS_ENVIRONMENT, asaasConfigured, asaasFetch, onlyDigits } from "../_shared/asaas.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

function text(value: unknown): string {
  return String(value ?? "").trim();
}

type CreateSubaccountResponse = {
  id?: string;
  accountNumber?: { agency?: string; account?: string; accountDigit?: string };
  walletId?: string;
  apiKey?: string;
};

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
    const { data: profile } = await admin.from("users").select("id").eq("auth_user_id", authResult.user.id).maybeSingle();
    if (!profile) return json({ error: "profile_missing" }, 404);

    const { data: driver, error: driverError } = await admin
      .from("drivers")
      .select("id,user_id,name,email,phone,cpf,birth_date,approval_status,address,address_number,address_complement,province,postal_code,declared_monthly_income")
      .eq("user_id", profile.id)
      .maybeSingle();
    if (driverError || !driver) return json({ error: "driver_not_found" }, 404);
    if (driver.approval_status !== "aprovado") return json({ error: "driver_not_approved" }, 403);

    const { data: existing } = await admin
      .from("driver_asaas_accounts")
      .select("subaccount_id,wallet_id,status")
      .eq("driver_id", driver.id)
      .maybeSingle();
    if (existing?.subaccount_id && existing?.wallet_id) {
      return json({ ok: true, reused: true, provider: "asaas", environment: ASAAS_ENVIRONMENT, status: existing.status, subaccountId: existing.subaccount_id, walletId: existing.wallet_id });
    }

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }

    const address = text(body.address || driver.address);
    const addressNumber = text(body.addressNumber || driver.address_number);
    const complement = text(body.complement || driver.address_complement);
    const province = text(body.province || driver.province);
    const postalCode = onlyDigits(body.postalCode || driver.postal_code);
    const incomeValue = Number(body.incomeValue ?? driver.declared_monthly_income ?? 0);
    const mobilePhone = onlyDigits(driver.phone);
    const cpfCnpj = onlyDigits(driver.cpf);
    const birthDate = text(driver.birth_date);

    const missing: string[] = [];
    if (!text(driver.name)) missing.push("name");
    if (!text(driver.email)) missing.push("email");
    if (cpfCnpj.length !== 11) missing.push("cpf");
    if (!birthDate) missing.push("birthDate");
    if (mobilePhone.length < 10) missing.push("mobilePhone");
    if (!address) missing.push("address");
    if (!addressNumber) missing.push("addressNumber");
    if (!province) missing.push("province");
    if (postalCode.length !== 8) missing.push("postalCode");
    if (!Number.isFinite(incomeValue) || incomeValue <= 0) missing.push("incomeValue");
    if (missing.length) return json({ error: "subaccount_identity_incomplete", missing }, 422);

    await admin.from("drivers").update({
      address,
      address_number: addressNumber,
      address_complement: complement || null,
      province,
      postal_code: postalCode,
      declared_monthly_income: incomeValue,
      updated_at: new Date().toISOString(),
    }).eq("id", driver.id);

    await admin.from("driver_asaas_accounts").upsert({
      driver_id: driver.id,
      status: "creating",
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "driver_id" });

    let created: CreateSubaccountResponse;
    try {
      created = await asaasFetch<CreateSubaccountResponse>("/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: text(driver.name),
          email: text(driver.email),
          cpfCnpj,
          birthDate,
          mobilePhone,
          incomeValue,
          address,
          addressNumber,
          complement: complement || undefined,
          province,
          postalCode,
        }),
      });
    } catch (error) {
      await admin.from("driver_asaas_accounts").upsert({
        driver_id: driver.id,
        status: "error",
        last_error: String(error).slice(0, 500),
        updated_at: new Date().toISOString(),
      }, { onConflict: "driver_id" });
      throw error;
    }

    if (!created.apiKey || !created.walletId) {
      await admin.from("driver_asaas_accounts").upsert({
        driver_id: driver.id,
        subaccount_id: created.id ?? null,
        wallet_id: created.walletId ?? null,
        status: "error",
        last_error: "asaas_subaccount_credentials_missing",
        updated_at: new Date().toISOString(),
      }, { onConflict: "driver_id" });
      return json({ error: "asaas_subaccount_credentials_missing" }, 502);
    }

    const { error: secretError } = await admin.rpc("store_asaas_subaccount_secret", {
      _driver_id: driver.id,
      _api_key: created.apiKey,
    });
    if (secretError) {
      await admin.from("driver_asaas_accounts").upsert({
        driver_id: driver.id,
        subaccount_id: created.id ?? null,
        wallet_id: created.walletId,
        status: "error",
        last_error: "subaccount_secret_storage_failed",
        updated_at: new Date().toISOString(),
      }, { onConflict: "driver_id" });
      throw new Error(`subaccount_secret_storage_failed:${secretError.message}`);
    }

    const { error: accountError } = await admin.from("driver_asaas_accounts").upsert({
      driver_id: driver.id,
      subaccount_id: created.id ?? null,
      wallet_id: created.walletId,
      status: "pending",
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "driver_id" });
    if (accountError) throw accountError;

    return json({
      ok: true,
      reused: false,
      provider: "asaas",
      environment: ASAAS_ENVIRONMENT,
      subaccountId: created.id ?? null,
      walletId: created.walletId,
      status: "pending",
    });
  } catch (error) {
    console.error("[asaas-create-driver-subaccount]", error);
    return json({ error: "asaas_subaccount_failed", detail: String(error).slice(0, 500) }, 502);
  }
});
