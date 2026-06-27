/**
 * MOVVI — Ciclo de vida oficial da corrida.
 *
 * ÚNICA fonte de verdade para o status da corrida.
 * Toda transição de status DEVE passar por uma destas server functions.
 * Nenhuma tela (passageiro / motorista / admin) deve fazer UPDATE em
 * `public.rides.status` direto.
 *
 * Tabela: public.rides
 * Coluna de status: public.rides.status (enum public.ride_status)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// ---------- Constantes oficiais ----------

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

export const RIDE_STATUS_VALUES: RideStatus[] = Object.values(RIDE_STATUS);

export const RIDE_TERMINAL_STATUSES: RideStatus[] = [
  RIDE_STATUS.FINALIZADA,
  RIDE_STATUS.CANCELADA_PASSAGEIRO,
  RIDE_STATUS.CANCELADA_MOTORISTA,
];

export type Actor = "passageiro" | "motorista" | "sistema";

/** Mapa de transições permitidas: de qual status posso ir para qual, e quem dispara. */
export const RIDE_TRANSITIONS: Record<RideStatus, { to: RideStatus; by: Actor }[]> = {
  procurar_motorista: [
    { to: "motorista_a_caminho", by: "motorista" }, // aceitar
    { to: "cancelada_passageiro", by: "passageiro" },
  ],
  motorista_a_caminho: [
    { to: "motorista_chegou", by: "motorista" },
    { to: "cancelada_passageiro", by: "passageiro" },
    { to: "cancelada_motorista", by: "motorista" },
  ],
  motorista_chegou: [
    { to: "em_viagem", by: "motorista" },
    { to: "cancelada_passageiro", by: "passageiro" },
    { to: "cancelada_motorista", by: "motorista" },
  ],
  em_viagem: [{ to: "finalizada", by: "motorista" }],
  finalizada: [],
  cancelada_passageiro: [],
  cancelada_motorista: [],
};

export function canTransition(from: RideStatus, to: RideStatus, by: Actor): boolean {
  return RIDE_TRANSITIONS[from]?.some((t) => t.to === to && t.by === by) ?? false;
}

export function isTerminal(status: RideStatus): boolean {
  return RIDE_TERMINAL_STATUSES.includes(status);
}

// ---------- Schemas de entrada ----------

const LatLng = z.object({ lat: z.number(), lng: z.number() });
const Categories = ["carros", "motos", "fretes", "guincho", "envios"] as const;

const CriarCorridaInput = z.object({
  origin: LatLng,
  origin_name: z.string().min(1),
  destination: LatLng,
  destination_name: z.string().min(1),
  category: z.enum(Categories),
  distance_km: z.number().nullable().optional(),
  duration_min: z.number().nullable().optional(),
  estimated_price: z.number().nullable().optional(),
});
const RideIdInput = z.object({ rideId: z.string().uuid() });
const FinalizarInput = z.object({ rideId: z.string().uuid(), final_price: z.number().optional() });
const CancelarInput = z.object({ rideId: z.string().uuid(), motivo: z.string().optional() });
const AvaliarPassageiroInput = z.object({
  rideId: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional().nullable(),
});

// ---------- Helpers internos ----------

type RideUpdate = Database["public"]["Tables"]["rides"]["Update"];

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const aa =
    s1 * s1 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(aa));
}

/**
 * Aplica uma transição de forma ATÔMICA:
 * - exige status de origem esperado
 * - exige usuário responsável (passageiro_id ou driver_id)
 * - escreve a coluna status e timestamps
 * Falha se o estado já mudou (corrida concorrente).
 */
export async function applyTransition(
  supabase: any,
  rideId: string,
  expectedFrom: RideStatus | RideStatus[],
  to: RideStatus,
  extra: Partial<RideUpdate> = {},
  ownerFilter:
    | { column: "passenger_id" | "driver_id" | "current_offer_driver_id"; value: string }
    | null = null,
) {
  let q = supabase
    .from("rides")
    .update({ status: to, ...extra })
    .eq("id", rideId);

  if (Array.isArray(expectedFrom)) q = q.in("status", expectedFrom);
  else q = q.eq("status", expectedFrom);

  if (ownerFilter) q = q.eq(ownerFilter.column, ownerFilter.value);

  const r = await q.select("*").single();
  if (r.error) {
    throw new Error(
      `Transição inválida (de ${Array.isArray(expectedFrom) ? expectedFrom.join("|") : expectedFrom} para ${to}): ${r.error.message}`,
    );
  }
  return r.data;
}

async function assertDriverApproved(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("drivers")
    .select("approval_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Falha ao validar motorista: " + error.message);
  if (!data) throw new Error("Cadastro de motorista não encontrado.");
  if (data.approval_status !== "aprovado") {
    throw new Error("Motorista não aprovado para operar.");
  }
}

/**
 * Encontra o próximo motorista disponível (mesma categoria, online, aprovado,
 * dentro de 15 km da origem e que ainda não recusou) e grava em
 * `current_offer_driver_id`. NÃO altera o status (que permanece
 * `procurar_motorista`).
 */
export async function offerToNextDriver(supabase: any, rideId: string): Promise<string | null> {
  const ride = await supabase.from("rides").select("*").eq("id", rideId).single();
  if (ride.error) throw new Error(ride.error.message);
  const r = ride.data;
  if (r.status !== RIDE_STATUS.PROCURAR_MOTORISTA) return null;

  const drivers = await supabase
    .from("drivers")
    .select("user_id, current_lat, current_lng")
    .eq("is_online", true)
    .eq("approval_status", "aprovado")
    .eq("category", r.category)
    .not("current_lat", "is", null)
    .not("current_lng", "is", null);
  if (drivers.error) throw new Error(drivers.error.message);

  const rejected: string[] = r.rejected_driver_ids ?? [];
  const all = (drivers.data ?? []).map((d: any) => ({
    user_id: d.user_id as string,
    lat: d.current_lat as number,
    lng: d.current_lng as number,
    dist: distanceKm(
      { lat: r.origin_lat, lng: r.origin_lng },
      { lat: d.current_lat, lng: d.current_lng },
    ),
  }));
  console.log("[MOVVI DESPACHO] origem passageiro:", { lat: r.origin_lat, lng: r.origin_lng, category: r.category });
  for (const d of all) {
    const motivos: string[] = [];
    if (rejected.includes(d.user_id)) motivos.push("recusou");
    if (d.user_id === r.driver_id) motivos.push("já é motorista da corrida");
    if (d.dist > 15) motivos.push(`fora do raio (${d.dist.toFixed(2)} km > 15 km)`);
    console.log("[MOVVI DESPACHO] candidato:", {
      driver: d.user_id, lat: d.lat, lng: d.lng, dist_km: Number(d.dist.toFixed(3)),
      status: motivos.length ? `descartado: ${motivos.join(", ")}` : "elegível",
    });
  }
  const candidates = all
    .filter((d: { user_id: string; dist: number }) => !rejected.includes(d.user_id) && d.user_id !== r.driver_id && d.dist <= 15)
    .sort((a: { dist: number }, b: { dist: number }) => a.dist - b.dist);


  if (candidates.length === 0) {
    console.log("[MOVVI DESPACHO] nenhum motorista elegível para a corrida", rideId);
    await supabase.from("rides").update({ current_offer_driver_id: null }).eq("id", rideId);
    return null;
  }

  const next = candidates[0].user_id;
  console.log("[MOVVI DESPACHO] oferta enviada:", { rideId, driver: next, dist_km: Number(candidates[0].dist.toFixed(3)) });
  await supabase.from("rides").update({ current_offer_driver_id: next }).eq("id", rideId);
  return next;

}

// ---------- Server functions oficiais ----------

/** Passageiro cria a corrida. Status inicial = procurar_motorista. */
export const criarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CriarCorridaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ins = await supabase
      .from("rides")
      .insert({
        passenger_id: userId,
        category: data.category,
        origin_lat: data.origin.lat,
        origin_lng: data.origin.lng,
        origin_name: data.origin_name,
        destination_lat: data.destination.lat,
        destination_lng: data.destination.lng,
        destination_name: data.destination_name,
        distance_km: data.distance_km ?? null,
        duration_min: data.duration_min ?? null,
        estimated_price: data.estimated_price ?? null,
        status: RIDE_STATUS.PROCURAR_MOTORISTA,
      })
      .select("*")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    await offerToNextDriver(supabase, ins.data.id);
    return { rideId: ins.data.id };
  });

/** Motorista aceita uma oferta. Só vale se a corrida estava ofertada a ele.
 *  Também grava um snapshot dos dados do motorista na própria corrida
 *  (driver_name, driver_phone, driver_vehicle, driver_lat, driver_lng),
 *  para o passageiro renderizar imediatamente sem depender de outra leitura. */
export const aceitarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RideIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertDriverApproved(supabase, userId);

    // snapshot do motorista
    const drv = await supabase
      .from("drivers")
      .select("name, phone, vehicle_model, vehicle_plate, vehicle_color, current_lat, current_lng")
      .eq("user_id", userId)
      .maybeSingle();
    if (drv.error) throw new Error("Falha ao carregar dados do motorista: " + drv.error.message);
    const d = drv.data;
    const vehicle =
      d && (d.vehicle_model || d.vehicle_plate)
        ? [d.vehicle_color, d.vehicle_model, d.vehicle_plate]
            .filter((x): x is string => !!x && String(x).trim().length > 0)
            .join(" • ")
        : null;

    const patch: Partial<RideUpdate> = {
      driver_id: userId,
      status: RIDE_STATUS.MOTORISTA_A_CAMINHO,
      accepted_at: new Date().toISOString(),
      current_offer_driver_id: null,
      driver_name: d?.name ?? null,
      driver_phone: d?.phone ?? null,
      driver_vehicle: vehicle,
      driver_lat: d?.current_lat ?? null,
      driver_lng: d?.current_lng ?? null,
    };

    const upd = await supabase
      .from("rides")
      .update(patch)
      .eq("id", data.rideId)
      .eq("status", RIDE_STATUS.PROCURAR_MOTORISTA)
      .eq("current_offer_driver_id", userId)
      .select("*")
      .single();
    if (upd.error)
      throw new Error(
        upd.error.code === "PGRST116"
          ? "Não foi possível aceitar a corrida: esta chamada já foi aceita, cancelada ou não está mais disponível para você."
          : "Não foi possível aceitar a corrida: " + upd.error.message,
      );
    console.log("[MOVVI MOTORISTA] aceite confirmado no backend", {
      rideId: upd.data.id,
      driverId: upd.data.driver_id,
      status: upd.data.status,
    });
    return upd.data;
  });

/** Motorista recusa a oferta atual; o sistema repassa para o próximo. */
export const recusarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RideIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cur = await supabaseAdmin
      .from("rides")
      .select("rejected_driver_ids, current_offer_driver_id, status")
      .eq("id", data.rideId)
      .single();
    if (cur.error) throw new Error(cur.error.message);
    if (cur.data.current_offer_driver_id !== userId) {
      throw new Error("Esta corrida não está ofertada para você.");
    }
    if (cur.data.status !== RIDE_STATUS.PROCURAR_MOTORISTA) {
      throw new Error("Corrida não está mais aguardando motorista.");
    }
    const rejected = Array.from(
      new Set([...(cur.data.rejected_driver_ids ?? []), userId]),
    );
    await supabaseAdmin
      .from("rides")
      .update({ rejected_driver_ids: rejected, current_offer_driver_id: null })
      .eq("id", data.rideId);
    await offerToNextDriver(supabaseAdmin, data.rideId);
    return { ok: true };
  });

/** Motorista informa que chegou ao ponto de embarque. */
export const informarChegada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RideIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertDriverApproved(supabase, userId);
    return applyTransition(
      supabase,
      data.rideId,
      RIDE_STATUS.MOTORISTA_A_CAMINHO,
      RIDE_STATUS.MOTORISTA_CHEGOU,
      {},
      { column: "driver_id", value: userId },
    );
  });

/** Motorista inicia a viagem (após passageiro embarcar). */
export const iniciarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RideIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertDriverApproved(supabase, userId);
    return applyTransition(
      supabase,
      data.rideId,
      RIDE_STATUS.MOTORISTA_CHEGOU,
      RIDE_STATUS.EM_VIAGEM,
      { started_at: new Date().toISOString() },
      { column: "driver_id", value: userId },
    );
  });

/** Motorista finaliza a corrida no destino. */
export const finalizarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => FinalizarInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertDriverApproved(supabase, userId);
    const extra: Partial<RideUpdate> = { completed_at: new Date().toISOString() };
    if (data.final_price != null) extra.final_price = data.final_price;
    return applyTransition(
      supabase,
      data.rideId,
      RIDE_STATUS.EM_VIAGEM,
      RIDE_STATUS.FINALIZADA,
      extra,
      { column: "driver_id", value: userId },
    );
  });

/** Passageiro cancela em qualquer momento antes da viagem iniciar. */
export const cancelarPeloPassageiro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CancelarInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    return applyTransition(
      supabase,
      data.rideId,
      [
        RIDE_STATUS.PROCURAR_MOTORISTA,
        RIDE_STATUS.MOTORISTA_A_CAMINHO,
        RIDE_STATUS.MOTORISTA_CHEGOU,
      ],
      RIDE_STATUS.CANCELADA_PASSAGEIRO,
      {
        cancelled_at: new Date().toISOString(),
        cancelled_by: userId,
        cancel_reason: data.motivo ?? null,
      },
      { column: "passenger_id", value: userId },
    );
  });

/** Motorista cancela entre aceitar e iniciar a viagem. */
export const cancelarPeloMotorista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CancelarInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertDriverApproved(supabase, userId);
    return applyTransition(
      supabase,
      data.rideId,
      [RIDE_STATUS.MOTORISTA_A_CAMINHO, RIDE_STATUS.MOTORISTA_CHEGOU],
      RIDE_STATUS.CANCELADA_MOTORISTA,
      {
        cancelled_at: new Date().toISOString(),
        cancelled_by: userId,
        cancel_reason: data.motivo ?? null,
      },
      { column: "driver_id", value: userId },
    );
  });

/**
 * Motorista avalia o passageiro após a corrida finalizada.
 * Não altera status, mas centraliza updates na tabela `rides`.
 */
export const avaliarPassageiro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AvaliarPassageiroInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const upd = await supabase
      .from("rides")
      .update({
        passenger_rating: data.stars,
        passenger_rating_comment: data.comment ?? null,
      })
      .eq("id", data.rideId)
      .eq("driver_id", userId)
      .eq("status", RIDE_STATUS.FINALIZADA)
      .select("id")
      .single();
    if (upd.error) throw new Error("Não foi possível registrar a avaliação: " + upd.error.message);
    return { ok: true };
  });

// ---------- Aliases oficiais (nomes em inglês) ----------
// Mesma máquina de estados — uma única fonte de verdade para a tabela `rides`.
// Use estes nomes a partir de novos call sites; os nomes em português continuam
// válidos para não quebrar telas existentes.
export const acceptRide        = aceitarCorrida;
export const rejectRide        = recusarCorrida;
export const markDriverEnRoute = aceitarCorrida;   // procurar_motorista → motorista_a_caminho
export const markDriverArrived = informarChegada;  // motorista_a_caminho → motorista_chegou
export const startRide         = iniciarCorrida;   // motorista_chegou   → em_viagem
export const finishRide        = finalizarCorrida; // em_viagem          → finalizada
export const cancelRideByPassenger = cancelarPeloPassageiro;
export const cancelRideByDriver    = cancelarPeloMotorista;
