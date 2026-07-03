// Public webhook endpoint that Asaas calls to notify payment status changes.
// This route is under /api/public/* which bypasses Lovable's auth wall on the
// published site — we MUST verify the caller ourselves.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/asaas-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        // 1) Verify shared secret (Asaas sends `asaas-access-token` header
        //    matching the value configured in the Asaas dashboard).
        const provided =
          request.headers.get("asaas-access-token") ??
          request.headers.get("x-asaas-token") ??
          "";
        const expected = process.env.ASAAS_WEBHOOK_SECRET?.trim() || "";
        if (!expected) {
          return new Response("webhook_secret_not_configured", { status: 503 });
        }
        if (!provided || provided !== expected) {
          return new Response("invalid_signature", { status: 401 });
        }

        // 2) Parse + interpret payload via the provider abstraction.
        let payload: unknown;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("invalid_json", { status: 400 });
        }

        const { asaasProvider } = await import("@/lib/payments/asaas.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const parsed = asaasProvider.parseWebhook(payload);
        if (!parsed.providerReference) {
          return new Response("ignored", { status: 200 });
        }

        // 3) Locate the subscription and update.
        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select("id, driver_id")
          .or(
            `asaas_payment_id.eq.${parsed.providerReference},provider_reference.eq.${parsed.providerReference}`,
          )
          .maybeSingle();

        if (!sub) return new Response("subscription_not_found", { status: 200 });

        if (parsed.status === "paid") {
          const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          await supabaseAdmin
            .from("subscriptions")
            .update({
              status: "active",
              paid_at: parsed.paidAt ?? new Date().toISOString(),
              period_end: periodEnd,
            })
            .eq("id", sub.id);
          await supabaseAdmin
            .from("drivers")
            .update({
              subscription_status: "active",
              subscription_expires_at: periodEnd,
            })
            .eq("id", sub.driver_id);
        } else if (parsed.status === "expired") {
          await supabaseAdmin.from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
          await supabaseAdmin
            .from("drivers")
            .update({ subscription_status: "expired" })
            .eq("id", sub.driver_id);
        } else if (parsed.status === "failed") {
          await supabaseAdmin
            .from("drivers")
            .update({ subscription_status: "blocked" })
            .eq("id", sub.driver_id);
        } else if (parsed.status === "refunded") {
          await supabaseAdmin.from("subscriptions").update({ status: "cancelled" }).eq("id", sub.id);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
