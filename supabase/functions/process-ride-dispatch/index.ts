import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });
}

function bearer(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

async function redispatch(rideId: string): Promise<{ ok: boolean; action?: string }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/dispatch-ride`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ride_id: rideId, mode: "redispatch" }),
  });
  const payload = await response.json().catch(() => ({})) as { action?: string };
  if (!response.ok) {
    console.error("[process-ride-dispatch] dispatch failed", rideId, response.status, payload);
    return { ok: false };
  }
  return { ok: true, action: payload.action };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) return json(req, { error: "server_configuration_missing" }, 500);
    if (bearer(req) !== SERVICE_ROLE) return json(req, { error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const nowIso = new Date().toISOString();

    const { data: rides, error } = await admin
      .from("rides")
      .select("id,request_expires_at,search_expires_at")
      .eq("status", "procurar_motorista")
      .is("driver_id", null)
      .is("accepted_driver_id", null)
      .or(`request_expires_at.is.null,request_expires_at.lte.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) return json(req, { error: "ride_lookup_failed", detail: error.message }, 500);

    let processed = 0;
    let expired = 0;
    let offered = 0;
    let noCandidateYet = 0;
    let failed = 0;

    for (const ride of rides ?? []) {
      const result = await redispatch(String(ride.id));
      if (!result.ok) {
        failed += 1;
        continue;
      }
      processed += 1;
      if (result.action === "expired") expired += 1;
      else if (result.action === "offered") offered += 1;
      else if (result.action === "no_candidate_yet") noCandidateYet += 1;
    }

    return json(req, { ok: true, processed, expired, offered, no_candidate_yet: noCandidateYet, failed });
  } catch (error) {
    console.error("[process-ride-dispatch] fatal", error);
    return json(req, { error: "internal_error" }, 500);
  }
});
