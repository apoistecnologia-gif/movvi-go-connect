// Cron endpoint: renova mensalidades dos motoristas.
// - Motoristas com next_due_date <= hoje+3 e financial_status='active' recebem
//   uma nova preference do Mercado Pago e voltam para 'pending' até o pagamento.
// - Motoristas com next_due_date < hoje-3 (tolerância) e ainda pendentes viram 'overdue'.
// Chamado via pg_cron diariamente.
// Autentica por header: Authorization: Bearer ${CRON_SECRET}.
// Requer secret dedicado CRON_SECRET. Sem ele, responde 503.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const MONTHLY_FEE = 49.9;
const GRACE_DAYS = 3;
const RENEW_WINDOW_DAYS = 3;

type Driver = {
  id: string;
  user_id: string;
  next_due_date: string | null;
  financial_status: string | null;
  mercadopago_preapproval_id: string | null;
};

async function createMpPreference(driverId: string, mpToken: string, supabaseUrl: string) {
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${mpToken}`,
    },
    body: JSON.stringify({
      items: [
        {
          id: `mensalidade-${driverId}`,
          title: "Mensalidade Motorista APOIS",
          description: "Renovação mensal APOIS",
          quantity: 1,
          currency_id: "BRL",
          unit_price: MONTHLY_FEE,
        },
      ],
      external_reference: driverId,
      metadata: { driver_id: driverId, kind: "monthly_fee" },
      back_urls: {
        success: "https://movvi-go-connect.lovable.app/motorista/assinatura",
        failure: "https://movvi-go-connect.lovable.app/motorista/assinatura",
        pending: "https://movvi-go-connect.lovable.app/motorista/assinatura",
      },
      auto_return: "approved",
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MP_HTTP_${res.status}:${text.slice(0, 300)}`);
  return JSON.parse(text) as { id: string; init_point?: string; sandbox_init_point?: string };
}

export const Route = createFileRoute("/api/public/hooks/renew-driver-subscriptions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
        if (!cronSecret) {
          return new Response(
            JSON.stringify({ error: "cron_secret_not_configured" }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }
        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.toLowerCase().startsWith("bearer ")
          ? auth.slice(7).trim()
          : "";
        if (!provided || provided !== cronSecret) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const MP_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ?? "";
        if (!MP_TOKEN) {
          return new Response(JSON.stringify({ error: "missing_mp_token" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const today = new Date();
        const renewCutoff = new Date(today);
        renewCutoff.setDate(renewCutoff.getDate() + RENEW_WINDOW_DAYS);
        const renewCutoffStr = renewCutoff.toISOString().slice(0, 10);

        const overdueCutoff = new Date(today);
        overdueCutoff.setDate(overdueCutoff.getDate() - GRACE_DAYS);
        const overdueCutoffStr = overdueCutoff.toISOString().slice(0, 10);

        // 1) Marca como overdue quem passou da tolerância sem pagar
        const { data: overdueDrivers, error: overdueErr } = await admin
          .from("drivers")
          .update({ financial_status: "overdue", subscription_status: "overdue" })
          .lt("next_due_date", overdueCutoffStr)
          .in("financial_status", ["pending"])
          .select("id");

        if (overdueErr) console.error("[renew-cron] overdue update failed", overdueErr);

        // 2) Busca motoristas ativos que estão próximos do vencimento
        const { data: candidates, error: fetchErr } = await admin
          .from("drivers")
          .select("id,user_id,next_due_date,financial_status,mercadopago_preapproval_id")
          .in("financial_status", ["active", "overdue"])
          .lte("next_due_date", renewCutoffStr)
          .eq("approval_status", "aprovado");

        if (fetchErr) {
          console.error("[renew-cron] fetch candidates failed", fetchErr);
          return new Response(JSON.stringify({ error: "fetch_failed", detail: fetchErr.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const results: Array<{ driverId: string; ok: boolean; error?: string }> = [];

        for (const driver of (candidates ?? []) as Driver[]) {
          try {
            const preference = await createMpPreference(driver.id, MP_TOKEN, SUPABASE_URL);
            const initPoint = preference.init_point ?? preference.sandbox_init_point ?? null;
            const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

            await admin
              .from("drivers")
              .update({
                mercadopago_preapproval_id: preference.id,
                mercadopago_init_point: initPoint,
                subscription_status: "pending",
                financial_status: "pending",
                last_payment_status: "PENDING",
                last_invoice_url: initPoint,
              })
              .eq("id", driver.id);

            await admin.from("subscriptions").insert({
              driver_id: driver.user_id,
              status: "pending",
              amount: MONTHLY_FEE,
              period_start: new Date().toISOString(),
              period_end: periodEnd,
              provider_reference: preference.id,
              payment_method: "checkout_pro",
              invoice_url: initPoint,
            });

            await admin.from("driver_payment_events").insert({
              driver_id: driver.id,
              provider: "mercadopago",
              event_type: "preference.renewal_created",
              asaas_event: "PREFERENCE_RENEWAL_CREATED",
              mp_preapproval_id: preference.id,
              status: "pending",
              value: MONTHLY_FEE,
              invoice_url: initPoint,
              raw_payload: { source: "cron:renew-driver-subscriptions", preference },
            });

            // Notificação in-app (se a tabela existir)
            try {
              await admin.from("notification_inbox").insert({
                user_id: driver.user_id,
                title: "Renovação da mensalidade APOIS",
                body: "Sua mensalidade está próxima do vencimento. Clique para pagar.",
                category: "billing",
                data: { init_point: initPoint, kind: "monthly_fee" },
              });
            } catch (nErr) {
              console.warn("[renew-cron] notification insert skipped", nErr);
            }

            results.push({ driverId: driver.id, ok: true });
          } catch (e) {
            const detail = String(e);
            console.error(`[renew-cron] driver ${driver.id} renewal failed`, detail);
            await admin.from("driver_payment_events").insert({
              driver_id: driver.id,
              provider: "mercadopago",
              event_type: "preference.renewal_failed",
              asaas_event: "PREFERENCE_RENEWAL_FAILED",
              status: "error",
              raw_payload: { source: "cron:renew-driver-subscriptions", error: detail },
            });
            results.push({ driverId: driver.id, ok: false, error: detail.slice(0, 200) });
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            renewed: results.filter((r) => r.ok).length,
            failed: results.filter((r) => !r.ok).length,
            overdue_marked: overdueDrivers?.length ?? 0,
            results,
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
