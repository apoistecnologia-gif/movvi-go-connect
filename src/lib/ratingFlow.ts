/**
 * Pure helpers para o fluxo de avaliação (passageiro ↔ motorista).
 * Mantidos fora do React para serem testáveis em isolamento (bun test).
 *
 * Regras de negócio:
 * - Cada corrida só pode ser avaliada UMA vez por lado.
 * - O backend (`avaliarPassageiro` / `avaliarMotorista`) reforça isso via
 *   `.is(..._rated_at, null)` no UPDATE; estes helpers protegem o front
 *   contra duplicação otimista (clique duplo, Realtime echo).
 */

export type RatingSide = "driver" | "passenger";

export type MinimalRide = {
  id: string;
  status?: string | null;
  driver_rated_at?: string | null;
  passenger_rated_at?: string | null;
};

/**
 * Retorna true se a tela de avaliação deve ser exibida para `side`.
 */
export function shouldShowRating(
  ride: MinimalRide | null | undefined,
  side: RatingSide,
  ratedLocal: ReadonlySet<string>,
): boolean {
  if (!ride) return false;
  if (ride.status !== "finalizada") return false;
  if (ratedLocal.has(ride.id)) return false;
  const flag = side === "driver" ? ride.driver_rated_at : ride.passenger_rated_at;
  return !flag;
}

/**
 * Retorna true se devemos efetivamente disparar o request de avaliação.
 * Bloqueia cliques duplos, re-submits e estados terminais.
 */
export function canSubmitRating(params: {
  rideId: string | null | undefined;
  submitting: boolean;
  submitted: boolean;
  ratedLocal: ReadonlySet<string>;
}): boolean {
  const { rideId, submitting, submitted, ratedLocal } = params;
  if (!rideId) return false;
  if (submitting) return false;
  if (submitted) return false;
  if (ratedLocal.has(rideId)) return false;
  return true;
}
