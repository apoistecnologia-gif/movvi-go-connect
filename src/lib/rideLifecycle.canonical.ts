// APOIS CORRIDAS — compatibility boundary for the retired Passenger/core implementation
// that historically lived in src/lib/rideLifecycle.ts.
//
// The canonical Passenger application is maintained in
// franciel046631/say-hello-buddy-23-84b5dcbf. The canonical Driver mobile
// lifecycle uses the PostgreSQL RPCs in driverRideLifecycle.mobile.ts.
//
// IMPORTANT: this module deliberately does not read/write legacy tables or
// legacy ride columns. Passenger/core actions that belong to the retired
// surface fail closed instead of mutating the production schema with an old
// contract. It remains only so old file-routes can type/build while they are
// being removed from the Driver/Admin repository.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const RIDE_STATUS = {
  PROCURAR_MOTORISTA: "procurar_motorista",
  MOTORISTA_A_CAMINHO: "motorista_a_caminho",
  MOTORISTA_CHEGOU: "motorista_chegou",
  EM_VIAGEM: "em_viagem",
  FINALIZADA: "finalizada",
  CANCELADA_PASSAGEIRO: "cancelada_passageiro",
  CANCELADA_MOTORISTA: "cancelada_motorista",
} as const;

export type RideStatus = (typeof RIDE_STATUS)[keyof typeof RIDE_STATUS];
export type Actor = "passageiro" | "motorista" | "sistema";

export const RIDE_STATUS_VALUES: RideStatus[] = Object.values(RIDE_STATUS);
export const RIDE_TERMINAL_STATUSES: RideStatus[] = [
  RIDE_STATUS.FINALIZADA,
  RIDE_STATUS.CANCELADA_PASSAGEIRO,
  RIDE_STATUS.CANCELADA_MOTORISTA,
];

export const RIDE_TRANSITIONS: Record<RideStatus, { to: RideStatus; by: Actor }[]> = {
  procurar_motorista: [
    { to: RIDE_STATUS.MOTORISTA_A_CAMINHO, by: "motorista" },
    { to: RIDE_STATUS.CANCELADA_PASSAGEIRO, by: "passageiro" },
  ],
  motorista_a_caminho: [
    { to: RIDE_STATUS.MOTORISTA_CHEGOU, by: "motorista" },
    { to: RIDE_STATUS.CANCELADA_PASSAGEIRO, by: "passageiro" },
    { to: RIDE_STATUS.CANCELADA_MOTORISTA, by: "motorista" },
  ],
  motorista_chegou: [
    { to: RIDE_STATUS.EM_VIAGEM, by: "motorista" },
    { to: RIDE_STATUS.CANCELADA_PASSAGEIRO, by: "passageiro" },
    { to: RIDE_STATUS.CANCELADA_MOTORISTA, by: "motorista" },
  ],
  em_viagem: [{ to: RIDE_STATUS.FINALIZADA, by: "motorista" }],
  finalizada: [],
  cancelada_passageiro: [],
  cancelada_motorista: [],
};

export function canTransition(from: RideStatus, to: RideStatus, by: Actor): boolean {
  return RIDE_TRANSITIONS[from]?.some((transition) => transition.to === to && transition.by === by) ?? false;
}

export function isTerminal(status: RideStatus): boolean {
  return RIDE_TERMINAL_STATUSES.includes(status);
}

export const DISPATCH_RADII_KM = [3, 5, 8, 12, 20, 30, 50] as const;
export const DISPATCH_BROADCAST_SIZE = Number.POSITIVE_INFINITY;
export const RIDE_REQUEST_TIMEOUT_SECONDS = 60;

const RideIdInput = z.object({ rideId: z.string().uuid() });
const DriverStartInput = RideIdInput.extend({ safety_code: z.string().trim().regex(/^\d{4}$/) });
const DriverFinishInput = RideIdInput.extend({ final_price: z.number().optional() });
const CancelInput = RideIdInput.extend({ motivo: z.string().optional() });
const RatingInput = RideIdInput.extend({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional().nullable(),
});
const LegacyPassengerInput = z.record(z.string(), z.unknown());

function retiredPassengerSurface(action: string): Error {
  return new Error(
    `LEGACY_PASSENGER_SURFACE_RETIRED:${action}: use o repositório Passageiro canônico e o backend oficial`,
  );
}

type DynamicRpcResult = { data: unknown; error: { message: string } | null };
type DynamicRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<DynamicRpcResult>;
};

async function callCanonicalRpc(
  supabase: unknown,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await (supabase as DynamicRpcClient).rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

// Retired dispatch helper: no direct access to private drivers and no mutation
// of candidate lists from this legacy module.
export async function offerToNextDriver(_supabase: unknown, _rideId: string): Promise<string | null> {
  throw retiredPassengerSurface("offerToNextDriver");
}

// Kept only for source compatibility with old routes. The canonical state
// machine is backend-authoritative; direct updates from this legacy module are forbidden.
export async function applyTransition(): Promise<never> {
  throw retiredPassengerSurface("applyTransition");
}

export const redispatchRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => RideIdInput.parse(value))
  .handler(async () => {
    throw retiredPassengerSurface("redispatchRide");
    return { ok: false as const, skipped: "retired", status: null as string | null, driver: null as string | null, candidates: 0 };
  });

export const diagnoseDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => RideIdInput.parse(value))
  .handler(async () => {
    throw retiredPassengerSurface("diagnoseDispatch");
    return {
      ride: null as null,
      totals: { total: 0, online: 0, aprovados: 0, com_gps: 0, categoria_match: 0, elegiveis: 0 },
      drivers: [] as Array<Record<string, unknown>>,
      radii: [] as Array<{ km: number; count: number }>,
    };
  });

export const criarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => LegacyPassengerInput.parse(value))
  .handler(async () => {
    throw retiredPassengerSurface("criarCorrida");
    return { rideId: "" };
  });

// Driver compatibility functions delegate to the canonical production RPCs.
// The canonical mobile app calls these RPCs directly via driverRideLifecycle.mobile.ts.
export const aceitarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => RideIdInput.parse(value))
  .handler(async ({ data, context }) => callCanonicalRpc(context.supabase, "driver_accept_ride", { _ride_id: data.rideId }));

export const recusarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => RideIdInput.parse(value))
  .handler(async ({ data, context }) => callCanonicalRpc(context.supabase, "driver_reject_ride", { _ride_id: data.rideId }));

export const informarChegada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => RideIdInput.parse(value))
  .handler(async ({ data, context }) => callCanonicalRpc(context.supabase, "driver_mark_arrived", { _ride_id: data.rideId }));

export const iniciarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => DriverStartInput.parse(value))
  .handler(async ({ data, context }) =>
    callCanonicalRpc(context.supabase, "driver_start_ride", {
      _ride_id: data.rideId,
      _security_code: data.safety_code,
    }),
  );

export const finalizarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => DriverFinishInput.parse(value))
  .handler(async ({ data, context }) =>
    // final_price is intentionally ignored: driver_finish_ride owns settlement.
    callCanonicalRpc(context.supabase, "driver_finish_ride", { _ride_id: data.rideId }),
  );

export const cancelarPeloMotorista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => CancelInput.parse(value))
  .handler(async ({ data, context }) =>
    callCanonicalRpc(context.supabase, "driver_cancel_ride", {
      _ride_id: data.rideId,
      _reason: data.motivo ?? null,
    }),
  );

export const avaliarPassageiro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => RatingInput.parse(value))
  .handler(async ({ data, context }) => {
    await callCanonicalRpc(context.supabase, "driver_rate_passenger", {
      _ride_id: data.rideId,
      _stars: data.stars,
      _comment: data.comment ?? null,
    });
    return { ok: true as const };
  });

// Passenger operations are owned by the separate canonical Passenger app.
export const cancelarPeloPassageiro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => CancelInput.parse(value))
  .handler(async () => {
    throw retiredPassengerSurface("cancelarPeloPassageiro");
    return { ok: false as const };
  });

export const avaliarMotorista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => RatingInput.parse(value))
  .handler(async () => {
    throw retiredPassengerSurface("avaliarMotorista");
    return { ok: false as const };
  });

export const agendarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => LegacyPassengerInput.parse(value))
  .handler(async () => {
    throw retiredPassengerSurface("agendarCorrida");
    return { rideId: "", scheduledFor: "", estimatedPrice: null as number | null };
  });

export const cancelarAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => RideIdInput.parse(value))
  .handler(async () => {
    throw retiredPassengerSurface("cancelarAgendamento");
    return { ok: false as const };
  });

export const acceptRide = aceitarCorrida;
export const rejectRide = recusarCorrida;
export const markDriverEnRoute = aceitarCorrida;
export const markDriverArrived = informarChegada;
export const startRide = iniciarCorrida;
export const finishRide = finalizarCorrida;
export const cancelRideByPassenger = cancelarPeloPassageiro;
export const cancelRideByDriver = cancelarPeloMotorista;
