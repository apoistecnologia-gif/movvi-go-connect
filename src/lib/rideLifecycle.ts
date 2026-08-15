/**
 * APOIS — fachada de compatibilidade do ciclo de vida da corrida.
 *
 * A autoridade de escrita vive no Supabase de produção: RPCs transacionais e
 * Edge Functions canônicas. Este módulo existe para manter imports antigos do
 * painel/app sem reintroduzir UPDATE/INSERT direto em public.rides.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const RIDE_STATUS = {
  AGENDADA: "agendada",
  AGUARDANDO_PAGAMENTO: "aguardando_pagamento",
  PROCURAR_MOTORISTA: "procurar_motorista",
  MOTORISTA_A_CAMINHO: "motorista_a_caminho",
  MOTORISTA_CHEGOU: "motorista_chegou",
  EM_VIAGEM: "em_viagem",
  FINALIZADA: "finalizada",
  CANCELADA_PASSAGEIRO: "cancelada_passageiro",
  CANCELADA_MOTORISTA: "cancelada_motorista",
  EXPIRED: "expired",
} as const;

export type RideStatus = (typeof RIDE_STATUS)[keyof typeof RIDE_STATUS];
export const RIDE_STATUS_VALUES: RideStatus[] = Object.values(RIDE_STATUS);
export const RIDE_TERMINAL_STATUSES: RideStatus[] = [
  RIDE_STATUS.FINALIZADA,
  RIDE_STATUS.CANCELADA_PASSAGEIRO,
  RIDE_STATUS.CANCELADA_MOTORISTA,
  RIDE_STATUS.EXPIRED,
];

export type Actor = "passageiro" | "motorista" | "sistema";

/**
 * Espelho para decisões de UI. A validação definitiva é feita pela máquina de
 * estados no banco; este mapa nunca autoriza uma mutação por si só.
 */
export const RIDE_TRANSITIONS: Record<RideStatus, { to: RideStatus; by: Actor }[]> = {
  agendada: [
    { to: "procurar_motorista", by: "sistema" },
    { to: "cancelada_passageiro", by: "passageiro" },
    { to: "expired", by: "sistema" },
  ],
  aguardando_pagamento: [
    { to: "procurar_motorista", by: "sistema" },
    { to: "cancelada_passageiro", by: "passageiro" },
    { to: "expired", by: "sistema" },
  ],
  procurar_motorista: [
    { to: "motorista_a_caminho", by: "motorista" },
    { to: "cancelada_passageiro", by: "passageiro" },
    { to: "expired", by: "sistema" },
  ],
  motorista_a_caminho: [
    { to: "motorista_chegou", by: "motorista" },
    { to: "procurar_motorista", by: "motorista" },
    { to: "procurar_motorista", by: "sistema" },
    { to: "cancelada_passageiro", by: "passageiro" },
  ],
  motorista_chegou: [
    { to: "em_viagem", by: "motorista" },
    { to: "procurar_motorista", by: "motorista" },
    { to: "procurar_motorista", by: "sistema" },
    { to: "cancelada_motorista", by: "motorista" },
  ],
  em_viagem: [{ to: "finalizada", by: "motorista" }],
  finalizada: [],
  cancelada_passageiro: [],
  cancelada_motorista: [],
  expired: [],
};

export function canTransition(from: RideStatus, to: RideStatus, by: Actor): boolean {
  return RIDE_TRANSITIONS[from]?.some((transition) => transition.to === to && transition.by === by) ?? false;
}

export function isTerminal(status: RideStatus): boolean {
  return RIDE_TERMINAL_STATUSES.includes(status);
}

const LatLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const Categories = ["carros", "motos", "fretes", "guincho", "envios"] as const;
const PaymentMethods = ["pix", "credit", "debit", "cash", "wallet"] as const;

const CriarCorridaInput = z.object({
  origin: LatLng,
  origin_name: z.string().min(1).max(200),
  destination: LatLng,
  destination_name: z.string().min(1).max(200),
  category: z.enum(Categories),
  distance_km: z.number().nullable().optional(),
  duration_min: z.number().nullable().optional(),
  estimated_price: z.number().nullable().optional(),
  pickup_label: z.string().max(240).nullable().optional(),
  pickup_short_label: z.string().max(120).nullable().optional(),
  pickup_address: z.string().max(500).nullable().optional(),
  pickup_place_id: z.string().max(240).nullable().optional(),
  pickup_source: z.enum(["gps", "manual", "places"]).nullable().optional(),
  payment_method: z.enum(PaymentMethods).optional().default("cash"),
  request_key: z.string().uuid().optional(),
  service_details: z.record(z.string(), z.unknown()).nullable().optional(),
});

const RideIdInput = z.object({ rideId: z.string().uuid() });
const IniciarCorridaInput = z.object({
  rideId: z.string().uuid(),
  safety_code: z.string().trim().regex(/^\d{4}$/, "Código deve ter 4 dígitos"),
});
const FinalizarInput = z.object({ rideId: z.string().uuid(), final_price: z.number().optional() });
const CancelarInput = z.object({ rideId: z.string().uuid(), motivo: z.string().max(500).optional() });
const AvaliarPassageiroInput = z.object({
  rideId: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional().nullable(),
});
const AgendarCorridaInput = CriarCorridaInput.extend({
  scheduled_for: z.string().datetime({ offset: true }),
});

type RpcResult = { data: unknown; error: { message?: string } | null };
type FunctionResult = { data: unknown; error: { message?: string } | null };
type CanonicalClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
  functions: {
    invoke: (name: string, options: { body: Record<string, unknown> }) => PromiseLike<FunctionResult>;
  };
};

type EdgePayload = Record<string, unknown> & {
  ok?: boolean;
  error?: string;
  error_code?: string;
  detail?: string;
  ride?: unknown;
  rideId?: string;
};

function clientOf(value: unknown): CanonicalClient {
  return value as CanonicalClient;
}

function edgeFailure(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as EdgePayload;
  if (record.ok === false || record.error || record.error_code) {
    return String(record.error_code ?? record.error ?? record.detail ?? "operation_failed");
  }
  return null;
}

async function rpc(client: unknown, name: string, args: Record<string, unknown>) {
  const { data, error } = await clientOf(client).rpc(name, args);
  if (error) throw new Error(error.message || `${name}_failed`);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (record.ok === false) throw new Error(String(record.code ?? record.error_code ?? `${name}_failed`));
  }
  return data;
}

async function invokeEdge(client: unknown, name: string, body: Record<string, unknown>): Promise<EdgePayload> {
  const { data, error } = await clientOf(client).functions.invoke(name, { body });
  if (error) throw new Error(error.message || `${name}_failed`);
  const failure = edgeFailure(data);
  if (failure) throw new Error(failure);
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return data as EdgePayload;
}

function requestKey(value?: string): string {
  if (value) return value;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  throw new Error("request_key_generation_unavailable");
}

function rideRequestBody(
  data: z.infer<typeof CriarCorridaInput>,
  scheduledFor?: string | null,
): Record<string, unknown> {
  return {
    action: "create",
    request_key: requestKey(data.request_key),
    origin: {
      ...data.origin,
      label: data.pickup_label ?? data.origin_name,
      address: data.pickup_address ?? data.origin_name,
      place_id: data.pickup_place_id ?? null,
      source: data.pickup_source ?? "gps",
    },
    origin_name: data.origin_name,
    destination: {
      ...data.destination,
      label: data.destination_name,
      address: data.destination_name,
      source: "manual",
    },
    destination_name: data.destination_name,
    category: data.category,
    client_estimated_price: data.estimated_price ?? null,
    payment_method: data.payment_method,
    service_details: data.service_details ?? null,
    scheduled_for: scheduledFor ?? null,
  };
}

/**
 * Antiga API de mutação genérica. Mantida apenas para que um import esquecido
 * falhe fechado em vez de voltar a escrever em rides diretamente.
 */
export async function applyTransition(): Promise<never> {
  throw new Error("direct_ride_transition_disabled_use_canonical_rpc");
}

export const DISPATCH_RADII_KM = [3, 5, 8, 12, 20, 30, 50] as const;
export const DISPATCH_BROADCAST_SIZE = Number.POSITIVE_INFINITY;
export const RIDE_REQUEST_TIMEOUT_SECONDS = 60;

/** Compatibilidade segura: delega ao dispatcher canônico em vez de montar lote local. */
export async function offerToNextDriver(supabase: unknown, rideId: string): Promise<string | null> {
  const result = await invokeEdge(supabase, "dispatch-ride", { ride_id: rideId, mode: "redispatch" });
  const driver = result.driver_id ?? result.current_offer_driver_id ?? null;
  return typeof driver === "string" ? driver : null;
}

export const redispatchRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => RideIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const result = await invokeEdge(context.supabase, "passenger-ride-request", {
      action: "redispatch",
      ride_id: data.rideId,
    });
    return {
      ok: true,
      skipped: null as string | null,
      status: typeof result.status === "string" ? result.status : null,
      driver: null as string | null,
      candidates: Number(result.candidates ?? 0),
    };
  });

/** Diagnóstico legado foi fechado para não expor GPS de terceiros. */
export const diagnoseDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => RideIdInput.parse(data))
  .handler(async () => {
    throw new Error("dispatch_diagnostics_moved_to_admin_backend");
  });

export const criarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CriarCorridaInput.parse(data))
  .handler(async ({ data, context }) => {
    const result = await invokeEdge(context.supabase, "passenger-ride-request", rideRequestBody(data));
    const rideId = String(result.rideId ?? "");
    if (!rideId) throw new Error("ride_request_missing_id");
    return { rideId };
  });

export const aceitarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => RideIdInput.parse(data))
  .handler(async ({ data, context }) => rpc(context.supabase, "driver_accept_ride", { _ride_id: data.rideId }));

export const recusarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => RideIdInput.parse(data))
  .handler(async ({ data, context }) => {
    await invokeEdge(context.supabase, "driver-reject-redispatch", { ride_id: data.rideId });
    return { ok: true };
  });

export const informarChegada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => RideIdInput.parse(data))
  .handler(async ({ data, context }) => rpc(context.supabase, "driver_mark_arrived", { _ride_id: data.rideId }));

export const iniciarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => IniciarCorridaInput.parse(data))
  .handler(async ({ data, context }) => rpc(context.supabase, "driver_start_ride", {
    _ride_id: data.rideId,
    _security_code: data.safety_code,
  }));

export const finalizarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => FinalizarInput.parse(data))
  .handler(async ({ data, context }) => {
    const result = await invokeEdge(context.supabase, "driver-finish-redispatch", { ride_id: data.rideId });
    return result.ride ?? result;
  });

export const cancelarPeloPassageiro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CancelarInput.parse(data))
  .handler(async ({ data, context }) => invokeEdge(context.supabase, "cancel-ride", {
    ride_id: data.rideId,
    reason: data.motivo ?? null,
  }));

export const cancelarPeloMotorista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CancelarInput.parse(data))
  .handler(async ({ data, context }) => {
    const result = await invokeEdge(context.supabase, "driver-cancel-redispatch", {
      ride_id: data.rideId,
      reason: data.motivo ?? null,
    });
    return result.ride ?? result;
  });

export const avaliarPassageiro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => AvaliarPassageiroInput.parse(data))
  .handler(async ({ data, context }) => {
    await rpc(context.supabase, "driver_rate_passenger", {
      _ride_id: data.rideId,
      _stars: data.stars,
      _comment: data.comment ?? null,
    });
    return { ok: true };
  });

export const avaliarMotorista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => AvaliarPassageiroInput.parse(data))
  .handler(async ({ data, context }) => {
    await rpc(context.supabase, "rate_passenger_ride", {
      _ride_id: data.rideId,
      _stars: data.stars,
      _comment: data.comment ?? null,
    });
    return { ok: true };
  });

export const acceptRide = aceitarCorrida;
export const rejectRide = recusarCorrida;
export const markDriverEnRoute = aceitarCorrida;
export const markDriverArrived = informarChegada;
export const startRide = iniciarCorrida;
export const finishRide = finalizarCorrida;
export const cancelRideByPassenger = cancelarPeloPassageiro;
export const cancelRideByDriver = cancelarPeloMotorista;

export const agendarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => AgendarCorridaInput.parse(data))
  .handler(async ({ data, context }) => {
    const result = await invokeEdge(
      context.supabase,
      "passenger-ride-request",
      rideRequestBody(data, data.scheduled_for),
    );
    const rideId = String(result.rideId ?? "");
    if (!rideId) throw new Error("scheduled_ride_request_missing_id");
    return {
      rideId,
      scheduledFor: typeof result.scheduled_for === "string" ? result.scheduled_for : data.scheduled_for,
      estimatedPrice: typeof result.estimated_price === "number" ? result.estimated_price : null,
    };
  });

export const cancelarAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => RideIdInput.parse(data))
  .handler(async ({ data, context }) => {
    await invokeEdge(context.supabase, "cancel-ride", {
      ride_id: data.rideId,
      reason: "Cancelamento de corrida agendada pelo passageiro",
    });
    return { ok: true };
  });
