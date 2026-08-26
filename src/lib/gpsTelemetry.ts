// Telemetria GPS local — diagnóstico não bloqueante do aparelho.
//
// O schema oficial da APOIS Corridas não possui a antiga tabela
// `gps_diagnostics` e o cliente não tem permissão de escrita em `audit_logs`.
// Portanto, não inventamos persistência remota nem fazemos uma chamada que
// falha silenciosamente a cada evento. Mantemos um buffer local limitado que
// pode ser inspecionado durante homologação física.

export type GpsTelemetryEvent =
  | "permissions_query_ok"
  | "permissions_query_error"
  | "permissions_query_timeout"
  | "getcurrentposition_success"
  | "getcurrentposition_error"
  | "geolocation_unsupported"
  | "manual_origin_set"
  | "retry_clicked";

type GpsTelemetryRecord = {
  event: GpsTelemetryEvent;
  code: string | null;
  message: string | null;
  extra: Record<string, unknown> | null;
  user_agent: string | null;
  url: string | null;
  created_at: string;
};

const STORAGE_KEY = "apois:gps:diagnostics";
const MAX_RECORDS = 50;

function readRecords(): GpsTelemetryRecord[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GpsTelemetryRecord[]) : [];
  } catch {
    return [];
  }
}

export async function logGpsTelemetry(
  event: GpsTelemetryEvent,
  payload: {
    code?: string | number | null;
    message?: string | null;
    extra?: Record<string, unknown>;
  } = {},
) {
  const record: GpsTelemetryRecord = {
    event,
    code: payload.code != null ? String(payload.code) : null,
    message: payload.message ?? null,
    extra: payload.extra ?? null,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    url: typeof window !== "undefined" ? window.location.href : null,
    created_at: new Date().toISOString(),
  };

  try {
    if (typeof localStorage !== "undefined") {
      const records = [...readRecords(), record].slice(-MAX_RECORDS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }
  } catch {
    // Telemetria nunca pode quebrar o app.
  }

  if (import.meta.env.DEV) console.debug("[APOIS GPS]", record);
}
