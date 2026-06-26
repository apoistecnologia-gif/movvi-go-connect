/**
 * MOVVI — compatibilidade.
 *
 * NÃO adicione lógica nova aqui. A fonte de verdade do ciclo de vida da
 * corrida é src/lib/rideLifecycle.ts. Este arquivo apenas re-exporta as
 * server functions com os nomes antigos usados pela UI ainda não migrada,
 * e oferece um adaptador `updateRidePhase` que despacha para a transição
 * oficial correspondente.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  RIDE_STATUS,
  applyTransition,
} from "./rideLifecycle";

export {
  criarCorrida as requestRide,
  aceitarCorrida as acceptRide,
  recusarCorrida as rejectRide,
  informarChegada,
  iniciarCorrida,
  finalizarCorrida,
  cancelarPeloPassageiro,
  cancelarPeloMotorista,
  RIDE_STATUS,
} from "./rideLifecycle";

/**
 * Adaptador legado: a UI antiga manda `{ rideId, status }` com os valores
 * pt-BR oficiais. Aqui despachamos para a transição correta validada pelo
 * lifecycle. Não recomendado para código novo — use diretamente
 * `informarChegada / iniciarCorrida / finalizarCorrida / cancelarPeloMotorista`.
 */
export const updateRidePhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rideId: z.string().uuid(),
        status: z.enum([
          RIDE_STATUS.MOTORISTA_CHEGOU,
          RIDE_STATUS.EM_VIAGEM,
          RIDE_STATUS.FINALIZADA,
          RIDE_STATUS.CANCELADA_MOTORISTA,
        ]),
        final_price: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const owner = { column: "driver_id" as const, value: userId };

    if (data.status === RIDE_STATUS.MOTORISTA_CHEGOU) {
      return applyTransition(
        supabase,
        data.rideId,
        RIDE_STATUS.MOTORISTA_A_CAMINHO,
        RIDE_STATUS.MOTORISTA_CHEGOU,
        {},
        owner,
      );
    }
    if (data.status === RIDE_STATUS.EM_VIAGEM) {
      return applyTransition(
        supabase,
        data.rideId,
        RIDE_STATUS.MOTORISTA_CHEGOU,
        RIDE_STATUS.EM_VIAGEM,
        { started_at: new Date().toISOString() },
        owner,
      );
    }
    if (data.status === RIDE_STATUS.FINALIZADA) {
      const extra: Record<string, unknown> = { completed_at: new Date().toISOString() };
      if (data.final_price != null) extra.final_price = data.final_price;
      return applyTransition(
        supabase,
        data.rideId,
        RIDE_STATUS.EM_VIAGEM,
        RIDE_STATUS.FINALIZADA,
        extra,
        owner,
      );
    }
    // cancelada_motorista
    return applyTransition(
      supabase,
      data.rideId,
      [RIDE_STATUS.MOTORISTA_A_CAMINHO, RIDE_STATUS.MOTORISTA_CHEGOU],
      RIDE_STATUS.CANCELADA_MOTORISTA,
      { cancelled_at: new Date().toISOString(), cancelled_by: userId },
      owner,
    );
  });
