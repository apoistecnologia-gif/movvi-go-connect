// Public webhook endpoint que o Asaas chama para notificar mudanças de cobrança.
// Está sob /api/public/* que ignora a auth do Lovable no site publicado — precisamos
// validar o chamador. O token esperado vem do secret ASAAS_WEBHOOK_TOKEN (ou
// ASAAS_WEBHOOK_SECRET como alias legado).

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/asaas-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        // 1) Verifica shared secret (Asaas envia header `asaas-access-token`)
        const provided =
          request.headers.get("asaas-access-token") ??
          request.headers.get("x-asaas-token") ??
          "";
        const expected =
          process.env.ASAAS_WEBHOOK_TOKEN?.trim() ||
          process.env.ASAAS_WEBHOOK_SECRET?.trim() ||
          "";
        if (!expected) {
          return new Response("webhook_secret_not_configured", { status: 503 });
        }
        if (!provided || provided !== expected) {
          return new Response("invalid_signature", { status: 401 });
        }

        // 2) Parse
        let payload: unknown;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("invalid_json", { status: 400 });
        }

        const { asaasProvider } = await import("@/lib/payments/asaas.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const parsed = asaasProvider.parseWebhook(payload);

        // 3) Localizar motorista via subscription_id -> customer_id -> payment_id
        let driverId: string | null = null;

        if (parsed.subscriptionId) {
          const { data } = await supabaseAdmin
            .from("drivers")
            .select("id")
            .eq("asaas_subscription_id", parsed.subscriptionId)
            .maybeSingle();
          driverId = data?.id ?? null;
        }
        if (!driverId && parsed.customerId) {
          const { data } = await supabaseAdmin
            .from("drivers")
            .select("id")
            .eq("asaas_customer_id", parsed.customerId)
            .maybeSingle();
          driverId = data?.id ?? null;
        }
        if (!driverId && parsed.providerReference) {
          const { data } = await supabaseAdmin
            .from("drivers")
            .select("id")
            .eq("last_payment_id", parsed.providerReference)
            .maybeSingle();
          driverId = data?.id ?? null;
        }

        // 4) Sempre grava histórico bruto
        await supabaseAdmin.from("driver_payment_events").insert({
          driver_id: driverId,
          asaas_event: parsed.event || "UNKNOWN",
          asaas_payment_id: parsed.providerReference,
          asaas_subscription_id: parsed.subscriptionId ?? null,
          status: parsed.status,
          value: parsed.value ?? null,
          due_date: parsed.dueDate ?? null,
          paid_at: parsed.paidAt ?? null,
          invoice_url: parsed.invoiceUrl ?? parsed.bankSlipUrl ?? null,
          raw_payload: payload as any,
        } as any);

        if (!driverId) {
          return Response.json({ ok: true, note: "driver_not_matched" });
        }

        // 5) Atualiza drivers.financial_status / last_payment_*
        const driverPatch: Record<string, unknown> = {
          last_payment_id: parsed.providerReference,
          last_payment_status: parsed.status.toUpperCase(),
          last_invoice_url: parsed.invoiceUrl ?? parsed.bankSlipUrl,
        };
        if (parsed.dueDate) driverPatch.next_due_date = parsed.dueDate;

        if (parsed.status === "paid") driverPatch.financial_status = "active";
        else if (parsed.status === "expired") driverPatch.financial_status = "overdue";
        else if (parsed.status === "refunded") driverPatch.financial_status = "cancelled";
        else if (parsed.status === "failed") driverPatch.financial_status = "overdue";
        else if (parsed.status === "pending") driverPatch.financial_status = "pending";

        await supabaseAdmin.from("drivers").update(driverPatch as any).eq("id", driverId);

        // 6) Também mantém a tabela subscriptions em sincronia (trigger já espelha
        //    subscriptions.status -> drivers.subscription_status/financial_status,
        //    mas atualizamos o registro por rastreabilidade).
        if (parsed.providerReference) {
          const { data: sub } = await supabaseAdmin
            .from("subscriptions")
            .select("id")
            .or(
              `asaas_payment_id.eq.${parsed.providerReference},provider_reference.eq.${parsed.providerReference}`,
            )
            .maybeSingle();

          if (sub) {
            const subPatch: Record<string, unknown> = {};
            if (parsed.status === "paid") {
              subPatch.status = "active";
              subPatch.paid_at = parsed.paidAt ?? new Date().toISOString();
              subPatch.period_end = new Date(
                Date.now() + 30 * 24 * 60 * 60 * 1000,
              ).toISOString();
            } else if (parsed.status === "expired") subPatch.status = "expired";
            else if (parsed.status === "failed") subPatch.status = "blocked";
            else if (parsed.status === "refunded") subPatch.status = "cancelled";

            if (Object.keys(subPatch).length) {
              await supabaseAdmin.from("subscriptions").update(subPatch as any).eq("id", sub.id);
            }
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
