// Edge Function: authenticated APOIS driver requests an Asaas Pix payout.
// The wallet debit/withdrawal creation is atomic in driver_request_withdrawal.
// Transfer completion is authoritative only when Asaas returns/announces DONE.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { asaasFetch, centsToBrl } from "../_shared/asaas.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN")?.trim() ?? "";
const WEBHOOK_EMAIL = Deno.env.get("ASAAS_WEBHOOK_EMAIL")?.trim() || "apoistecnologia@gmail.com";
const PAYOUT_WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/asaas-webhook`;
const PAYOUT_EVENTS = [
  "TRANSFER_CREATED",
  "TRANSFER_PENDING",
  "TRANSFER_IN_BANK_PROCESSING",
  "TRANSFER_BLOCKED",
  "TRANSFER_DONE",
  "TRANSFER_FAILED",
  "TRANSFER_CANCELLED",
] as const;

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

type PayoutRequest = {
  amountCents?: number;
  idempotencyKey?: string;
};

type Withdrawal = {
  id: string;
  driver_id: string;
  amount: number;
  status: string;
  provider_transfer_id: string | null;
  pix_key: string | null;
  pix_key_type: "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP" | null;
};

type AsaasTransfer = {
  id?: string;
  status?: string;
  endToEndIdentifier?: string | null;
  externalReference?: string | null;
  failReason?: string | null;
};

type AsaasWebhook = {
  id?: string;
  name?: string;
  url?: string;
  enabled?: boolean;
  interrupted?: boolean;
  events?: string[];
};

type AsaasWebhookList = {
  data?: AsaasWebhook[];
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function ensurePayoutWebhook(subaccountApiKey: string): Promise<void> {
  if (WEBHOOK_TOKEN.length < 32 || WEBHOOK_TOKEN.length > 255) {
    throw new Error("asaas_webhook_token_invalid");
  }

  const listed = await asaasFetch<AsaasWebhookList>(
    "/webhooks?offset=0&limit=100",
    { method: "GET" },
    subaccountApiKey,
  );
  const webhooks = listed.data ?? [];
  const existing = webhooks.find((item) => String(item.url ?? "").trim() === PAYOUT_WEBHOOK_URL);
  const requiredEvents = [...PAYOUT_EVENTS];

  if (!existing?.id) {
    await asaasFetch<AsaasWebhook>("/webhooks", {
      method: "POST",
      body: JSON.stringify({
        name: "APOIS transferências motorista",
        url: PAYOUT_WEBHOOK_URL,
        email: WEBHOOK_EMAIL,
        enabled: true,
        interrupted: false,
        apiVersion: 3,
        authToken: WEBHOOK_TOKEN,
        sendType: "SEQUENTIALLY",
        events: requiredEvents,
      }),
    }, subaccountApiKey);
    return;
  }

  const currentEvents = new Set((existing.events ?? []).map((event) => String(event).toUpperCase()));
  const missingEvent = requiredEvents.some((event) => !currentEvents.has(event));
  if (!missingEvent && existing.enabled === true && existing.interrupted !== true) return;

  await asaasFetch<AsaasWebhook>(`/webhooks/${encodeURIComponent(existing.id)}`, {
    method: "PUT",
    body: JSON.stringify({
      name: existing.name || "APOIS transferências motorista",
      url: PAYOUT_WEBHOOK_URL,
      enabled: true,
      interrupted: false,
      authToken: WEBHOOK_TOKEN,
      sendType: "SEQUENTIALLY",
      events: requiredEvents,
    }),
  }, subaccountApiKey);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authResult, error: authError } = await userClient.auth.getUser();
    if (authError || !authResult.user) return json({ error: "unauthorized" }, 401);

    let payload: PayoutRequest;
    try {
      payload = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const amountCents = Number(payload.amountCents ?? 0);
    const idempotencyKey = String(payload.idempotencyKey ?? "").trim();
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      return json({ error: "invalid_withdrawal_amount" }, 422);
    }
    if (!isUuid(idempotencyKey)) {
      return json({ error: "idempotency_key_required" }, 422);
    }

    const { data: requestResult, error: requestError } = await userClient.rpc(
      "driver_request_withdrawal",
      { _amount_cents: amountCents, _idempotency_key: idempotencyKey },
    );
    if (requestError || !requestResult) {
      return json({
        error: "withdrawal_request_failed",
        detail: requestError?.message ?? "unknown",
      }, 422);
    }

    const requestData = requestResult as {
      withdrawalId?: string;
      status?: string;
      idempotent?: boolean;
    };
    const withdrawalId = String(requestData.withdrawalId ?? "");
    if (!isUuid(withdrawalId)) return json({ error: "withdrawal_id_invalid" }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: withdrawalRow, error: withdrawalError } = await admin
      .from("driver_withdrawals")
      .select("id,driver_id,amount,status,provider_transfer_id,pix_key,pix_key_type")
      .eq("id", withdrawalId)
      .maybeSingle();
    if (withdrawalError || !withdrawalRow) return json({ error: "withdrawal_not_found" }, 500);

    const withdrawal = withdrawalRow as Withdrawal;
    if (withdrawal.status === "paid") {
      return json({ ok: true, withdrawalId, status: "paid", transferId: withdrawal.provider_transfer_id });
    }
    if (withdrawal.status === "failed" || withdrawal.status === "cancelled") {
      return json({ error: "withdrawal_closed", withdrawalId, status: withdrawal.status }, 409);
    }
    if (withdrawal.provider_transfer_id) {
      return json({
        ok: true,
        withdrawalId,
        status: withdrawal.status,
        transferId: withdrawal.provider_transfer_id,
        idempotent: true,
      }, 202);
    }
    if (!withdrawal.pix_key || !withdrawal.pix_key_type) {
      await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: withdrawal.id,
        _reason: "pix_payout_destination_missing",
        _response: null,
      });
      return json({ error: "pix_payout_destination_missing", withdrawalId }, 422);
    }

    const { data: subaccountApiKey, error: secretError } = await admin.rpc(
      "get_asaas_subaccount_secret",
      { _driver_id: withdrawal.driver_id },
    );
    if (secretError || typeof subaccountApiKey !== "string" || subaccountApiKey.length < 20) {
      await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: withdrawal.id,
        _reason: "asaas_subaccount_secret_missing",
        _response: null,
      });
      return json({ error: "asaas_subaccount_secret_missing", withdrawalId }, 503);
    }

    try {
      await ensurePayoutWebhook(subaccountApiKey);
    } catch (error) {
      const detail = String(error).slice(0, 500);
      await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: withdrawal.id,
        _reason: `asaas_payout_webhook_not_ready:${detail}`,
        _response: { error: detail },
      });
      return json({ error: "asaas_payout_webhook_not_ready", withdrawalId }, 503);
    }

    const { error: processingError } = await admin.rpc("mark_driver_withdrawal_processing", {
      _withdrawal_id: withdrawal.id,
    });
    if (processingError) throw processingError;

    let transfer: AsaasTransfer;
    try {
      transfer = await asaasFetch<AsaasTransfer>("/transfers", {
        method: "POST",
        body: JSON.stringify({
          value: centsToBrl(amountCents),
          operationType: "PIX",
          pixAddressKey: withdrawal.pix_key,
          pixAddressKeyType: withdrawal.pix_key_type,
          description: "Saque motorista APOIS",
          externalReference: `payout:${withdrawal.id}`,
        }),
      }, subaccountApiKey);
    } catch (error) {
      const detail = String(error).slice(0, 500);
      const explicitRejectedRequest = /^Error: ASAAS_HTTP_(400|401|403|404|422):/.test(detail);

      if (explicitRejectedRequest) {
        await admin.rpc("mark_driver_withdrawal_failed", {
          _withdrawal_id: withdrawal.id,
          _reason: detail,
          _response: { error: detail },
        });
        return json({ error: "asaas_transfer_rejected", withdrawalId, detail }, 502);
      }

      // HTTP 409 or transport ambiguity can mean Asaas already accepted an identical
      // transfer. Keep funds reserved and require reconciliation instead of risking
      // an incorrect refund followed by a real outbound Pix.
      await admin.from("driver_withdrawals").update({
        failure_reason: `reconciliation_required:${detail}`,
        updated_at: new Date().toISOString(),
      }).eq("id", withdrawal.id);
      return json({ error: "asaas_transfer_reconciliation_required", withdrawalId }, 202);
    }

    const transferId = transfer.id ? String(transfer.id) : null;
    const transferStatus = String(transfer.status ?? "PENDING").toUpperCase();

    await admin.from("driver_withdrawals").update({
      provider: "asaas",
      provider_transfer_id: transferId,
      provider_end_to_end_id: transfer.endToEndIdentifier ?? null,
      provider_response: transfer,
      failure_reason: null,
      updated_at: new Date().toISOString(),
    }).eq("id", withdrawal.id);

    if (transferStatus === "DONE") {
      await admin.rpc("mark_driver_withdrawal_paid", {
        _withdrawal_id: withdrawal.id,
        _transfer_id: transferId,
        _end_to_end_id: transfer.endToEndIdentifier ?? null,
        _response: transfer,
      });
      return json({ ok: true, withdrawalId, status: "paid", transferId });
    }

    if (transferStatus === "FAILED" || transferStatus === "CANCELLED") {
      await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: withdrawal.id,
        _reason: transfer.failReason ?? `asaas_transfer_${transferStatus.toLowerCase()}`,
        _response: transfer,
      });
      return json({ error: "asaas_transfer_failed", withdrawalId, status: transferStatus }, 502);
    }

    return json({
      ok: true,
      withdrawalId,
      status: "processing",
      providerStatus: transferStatus,
      transferId,
      idempotent: Boolean(requestData.idempotent),
    }, 202);
  } catch (error) {
    console.error("[request-driver-payout]", error);
    return json({ error: "unexpected", detail: String(error).slice(0, 300) }, 500);
  }
});
