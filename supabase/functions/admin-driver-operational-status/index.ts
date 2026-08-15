import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ENVIRONMENT = Deno.env.get("APP_ENV") ?? Deno.env.get("ENVIRONMENT") ?? "production";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NATIVE_ORIGINS = new Set(["https://localhost", "capacitor://localhost", "ionic://localhost"]);

function configuredOrigins(): Set<string> {
  return new Set(
    (Deno.env.get("ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

function cors(req: Request): Record<string, string> {
  const originHeader = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (!originHeader) return headers;

  const origin = originHeader.replace(/\/$/, "");
  let allowed = NATIVE_ORIGINS.has(origin) || configuredOrigins().has(origin);
  try {
    const url = new URL(origin);
    const localDevelopment =
      ENVIRONMENT === "development" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (localDevelopment) allowed = true;
    if (allowed && ENVIRONMENT !== "development" && !NATIVE_ORIGINS.has(origin)) {
      allowed = url.protocol === "https:";
    }
  } catch {
    allowed = false;
  }
  if (allowed) headers["Access-Control-Allow-Origin"] = originHeader;
  return headers;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "content-type": "application/json" },
  });
}

function bearer(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

function text(value: unknown, maxLength = 500): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function uuidArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter((id) => UUID_PATTERN.test(id)) : [];
}

async function redispatchRide(rideId: string): Promise<{ ride_id: string; ok: boolean; action?: string; status: number }> {
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
  return { ride_id: rideId, ok: response.ok, action: payload.action, status: response.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) return json(req, { error: "server_configuration_missing" }, 500);

    const token = bearer(req);
    if (!token) return json(req, { error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const driverId = text(body.driver_id, 50);
    const action = text(body.action, 30).toLowerCase();
    const status = text(body.status, 30).toLowerCase() || null;
    const reason = text(body.reason, 500) || null;
    const suspended = typeof body.suspended === "boolean" ? body.suspended : null;

    if (!UUID_PATTERN.test(driverId)) return json(req, { error: "invalid_driver_id" }, 422);
    if (action !== "approval" && action !== "suspension") return json(req, { error: "invalid_admin_driver_action" }, 422);
    if (action === "approval" && !["em_analise", "aprovado", "reprovado", "bloqueado"].includes(status ?? "")) {
      return json(req, { error: "invalid_status" }, 422);
    }
    if (action === "suspension" && suspended === null) return json(req, { error: "suspended_flag_required" }, 422);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data, error } = await adminClient.rpc("admin_set_driver_operational_status", {
      _driver_id: driverId,
      _action: action,
      _status: status,
      _suspended: suspended,
      _reason: reason,
    });

    if (error) {
      const message = error.message || "admin_driver_status_failed";
      const forbidden = /unauthorized|forbidden/i.test(message);
      return json(req, { error: message }, forbidden ? 403 : 409);
    }

    const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const rideIds = uuidArray(result.redispatch_ride_ids);
    const redispatchResults = await Promise.all(rideIds.map(redispatchRide));
    const deferred = redispatchResults.filter((entry) => !entry.ok);

    if (deferred.length > 0) {
      console.error("[admin-driver-operational-status] redispatch deferred", deferred);
    }

    return json(req, {
      ok: true,
      driver: result,
      released_count: rideIds.length,
      redispatch: deferred.length === 0 ? "triggered" : "deferred",
      redispatch_results: redispatchResults,
    });
  } catch (error) {
    console.error("[admin-driver-operational-status] fatal", error);
    return json(req, { error: "internal_error" }, 500);
  }
});
