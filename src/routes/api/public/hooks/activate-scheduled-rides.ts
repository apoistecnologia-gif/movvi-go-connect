// Cron endpoint: ativa corridas agendadas quando o horário se aproxima.
// A cada minuto (via pg_cron), promove rides com status='agendada' e
// scheduled_for <= now()+15min para status='procurar_motorista', o que
// dispara o fluxo normal de matching de motoristas.
// Autenticação via Authorization: Bearer ${CRON_SECRET}.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/activate-scheduled-rides")({
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

        const admin = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const { data, error } = await admin.rpc("activate_due_scheduled_rides");
        if (error) {
          console.error("[activate-scheduled-rides] rpc failed", error);
          return new Response(
            JSON.stringify({ error: "rpc_failed", detail: error.message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }

        const activated = (data as { activated_ride_id: string }[] | null) ?? [];

        // Notifica cada passageiro que sua corrida agendada foi enviada para busca.
        for (const row of activated) {
          try {
            const { data: ride } = await admin
              .from("rides")
              .select("passenger_id, destination_name")
              .eq("id", row.activated_ride_id)
              .maybeSingle();
            if (ride?.passenger_id) {
              await admin.from("notification_inbox").insert({
                user_id: ride.passenger_id,
                title: "Sua corrida agendada começou a buscar motorista",
                body: ride.destination_name
                  ? `Estamos procurando um motorista para levar você até ${ride.destination_name}.`
                  : "Estamos procurando um motorista para sua corrida agendada.",
                category: "ride",
                data: { ride_id: row.activated_ride_id, kind: "scheduled_activated" },
              });
            }
          } catch (e) {
            console.warn("[activate-scheduled-rides] notify skipped", e);
          }
        }

        return new Response(
          JSON.stringify({ ok: true, activated: activated.length, ids: activated.map((r) => r.activated_ride_id) }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
