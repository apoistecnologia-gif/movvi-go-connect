// Telemetria GPS — registra erros de permissions.query / getCurrentPosition
// no Supabase para diagnóstico em campo. Falhas de log nunca quebram o app.
import { supabase } from "@/integrations/supabase/client";

export type GpsTelemetryEvent =
  | "permissions_query_ok"
  | "permissions_query_error"
  | "permissions_query_timeout"
  | "getcurrentposition_success"
  | "getcurrentposition_error"
  | "geolocation_unsupported"
  | "manual_origin_set"
  | "retry_clicked";

export async function logGpsTelemetry(
  event: GpsTelemetryEvent,
  payload: {
    code?: string | number | null;
    message?: string | null;
    extra?: Record<string, unknown>;
  } = {},
) {
  try {
    const { data } = await supabase.auth.getUser();
    const user_id = data?.user?.id ?? null;
    await supabase.from("gps_diagnostics").insert({
      user_id,
      event,
      code: payload.code != null ? String(payload.code) : null,
      message: payload.message ?? null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      url: typeof window !== "undefined" ? window.location.href : null,
      extra: (payload.extra ?? null) as never,
    });
  } catch (err) {
    // Telemetria nunca pode quebrar o app.
    if (import.meta.env.DEV) console.warn("[APOIS] logGpsTelemetry falhou:", err);
  }
}
