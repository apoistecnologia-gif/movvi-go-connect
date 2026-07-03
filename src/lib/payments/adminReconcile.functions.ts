// Admin-only server function to safely refresh a single subscription's
// payment status from Asaas. Never exposes API keys to the client.
// Does NOT touch ride lifecycle, dispatch, GPS, or webhook logic.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface Input {
  subscriptionId: string;
}

export const adminRefreshAsaasPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Input) => ({ subscriptionId: String(data.subscriptionId) }))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // Require admin
    const { data: isAdmin } = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null }>;
    }).rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("id, asaas_payment_id, provider_reference, status, paid_at, amount")
      .eq("id", data.subscriptionId)
      .maybeSingle();
    if (subErr || !sub) throw new Error("subscription_not_found");

    const paymentId = sub.asaas_payment_id ?? sub.provider_reference;
    if (!paymentId) {
      return {
        ok: false,
        reason: "no_provider_reference",
        message: "Assinatura sem referência de pagamento no provedor.",
      } as const;
    }

    const apiKey = process.env.ASAAS_API_KEY?.trim();
    if (!apiKey) {
      return {
        ok: false,
        reason: "provider_not_configured",
        message: "Credenciais Asaas não configuradas neste ambiente.",
      } as const;
    }

    const base =
      (process.env.ASAAS_ENVIRONMENT ?? "sandbox").toLowerCase() === "production"
        ? "https://api.asaas.com/v3"
        : "https://api-sandbox.asaas.com/v3";

    const res = await fetch(`${base}/payments/${paymentId}`, {
      headers: { access_token: apiKey, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: "provider_error",
        message: `Asaas retornou HTTP ${res.status}.`,
      } as const;
    }
    const payment = (await res.json()) as {
      id?: string;
      status?: string;
      value?: number;
      paymentDate?: string;
      confirmedDate?: string;
      invoiceUrl?: string;
    };

    const rawStatus = (payment.status ?? "").toUpperCase();
    let localStatus: string | null = null;
    let paidAt: string | null = null;
    if (rawStatus.includes("CONFIRMED") || rawStatus.includes("RECEIVED")) {
      localStatus = "ativa";
      paidAt = payment.confirmedDate ?? payment.paymentDate ?? new Date().toISOString();
    } else if (rawStatus.includes("OVERDUE") || rawStatus.includes("EXPIRED")) {
      localStatus = "vencida";
    } else if (rawStatus.includes("REFUNDED") || rawStatus.includes("CHARGEBACK")) {
      localStatus = "cancelada";
    } else if (rawStatus.includes("PENDING") || rawStatus.includes("AWAITING")) {
      localStatus = "pending";
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (localStatus) patch.status = localStatus;
    if (paidAt) patch.paid_at = paidAt;
    if (payment.invoiceUrl) patch.invoice_url = payment.invoiceUrl;

    await supabaseAdmin.from("subscriptions").update(patch).eq("id", sub.id);

    return {
      ok: true,
      providerStatus: payment.status ?? null,
      localStatus,
      paidAt,
      amount: payment.value ?? sub.amount,
      invoiceUrl: payment.invoiceUrl ?? null,
    } as const;
  });
