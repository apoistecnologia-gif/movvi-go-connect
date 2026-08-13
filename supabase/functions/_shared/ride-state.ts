export const RIDE_STATUSES = [
  "agendada",
  "procurar_motorista",
  "motorista_a_caminho",
  "motorista_chegou",
  "em_viagem",
  "finalizada",
  "cancelada_passageiro",
  "cancelada_motorista",
  "expired",
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];
export type RideActor = "system" | "passenger" | "driver" | "admin";

export type RideTransitionContext = {
  hasValidOffer?: boolean;
  pinVerified?: boolean;
  cancellationAllowed?: boolean;
  queuedNextRide?: boolean;
};

const TERMINAL = new Set<RideStatus>([
  "finalizada",
  "cancelada_passageiro",
  "cancelada_motorista",
  "expired",
]);

export function isRideStatus(value: unknown): value is RideStatus {
  return typeof value === "string" && (RIDE_STATUSES as readonly string[]).includes(value);
}

export function isTerminalRideStatus(status: RideStatus): boolean {
  return TERMINAL.has(status);
}

/**
 * Canonical APOIS Corridas v1 state machine.
 *
 * The Portuguese persisted status names are intentionally preserved because
 * they are the live database contract. Offer metadata lives inside
 * `procurar_motorista`; a cosmetic status migration is not required.
 */
export function canTransitionRide(
  from: RideStatus,
  to: RideStatus,
  actor: RideActor,
  context: RideTransitionContext = {},
): boolean {
  if (from === to || isTerminalRideStatus(from)) return false;

  if (from === "agendada") {
    return actor === "system" && to === "procurar_motorista";
  }

  if (from === "procurar_motorista") {
    if (actor === "driver" && to === "motorista_a_caminho") return context.hasValidOffer === true;
    if (actor === "passenger" && to === "cancelada_passageiro") return context.cancellationAllowed !== false;
    if (actor === "system" && to === "expired") return true;
    return false;
  }

  if (from === "motorista_a_caminho") {
    if (actor === "driver" && to === "motorista_chegou") return true;
    if (actor === "driver" && to === "cancelada_motorista") return true;
    if (actor === "passenger" && to === "cancelada_passageiro") return context.cancellationAllowed === true;
    return false;
  }

  if (from === "motorista_chegou") {
    if (actor === "driver" && to === "em_viagem") return context.pinVerified === true;
    if (actor === "driver" && to === "cancelada_motorista") return true;
    return false;
  }

  if (from === "em_viagem") {
    return actor === "driver" && to === "finalizada";
  }

  return false;
}

export function assertRideTransition(
  from: RideStatus,
  to: RideStatus,
  actor: RideActor,
  context: RideTransitionContext = {},
): void {
  if (!canTransitionRide(from, to, actor, context)) {
    throw new Error(`invalid_ride_transition:${from}:${to}:${actor}`);
  }
}
