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
const IniciarCorridaInput = z.object({
  rideId: z.string().uuid(),
  safety_code: z.string().trim().regex(/^\d{4}$/, "Código deve ter 4 dígitos"),
});
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
 * Carrega as regras tarifárias de uma categoria a partir do banco
 * (`public.tariff_rules`) e devolve um mapa field_key → valor numérico.
 * Esta é a ÚNICA fonte de verdade para preço — o cliente NUNCA pode
 * influenciar tarifas (preço estimado/final).
 */
async function loadTariff(admin: any, category: string): Promise<Record<string, number>> {
  const res = await admin
    .from("tariff_rules")
    .select("field_key, value")
    .eq("category_key", category);
  if (res.error) throw new Error("Falha ao carregar tarifas: " + res.error.message);
  const out: Record<string, number> = {};
  for (const row of res.data ?? []) {
    out[row.field_key as string] = Number(row.value ?? 0);
  }
  return out;
}

/**
 * Calcula o preço autoritativo (server-side) de uma corrida a partir das
 * regras tarifárias. Sempre respeita a tarifa mínima.
 *   preço = max(min_fare, base_fare + per_km*km + per_min*min)
 */
function computeFareFromTariff(
  tariff: Record<string, number>,
  distanceKmValue: number,
  durationMinValue: number,
): number {
  const base = tariff.base_fare ?? 0;
  const perKm = tariff.per_km ?? 0;
  const perMin = tariff.per_min ?? 0;
  const minFare = tariff.min_fare ?? 0;
  const raw = base + perKm * Math.max(0, distanceKmValue) + perMin * Math.max(0, durationMinValue);
  const final = Math.max(minFare, raw);
  return Math.round(final * 100) / 100;
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

/** Raios progressivos (km) para expansão de busca. Cobre tanto centros
 *  urbanos densos quanto regiões interioranas (Piauí, Norte/Nordeste). */
export const DISPATCH_RADII_KM = [3, 5, 8, 12, 20, 30, 50] as const;

/** Idade máxima da última atualização de GPS aceita no despacho (segundos). */
const MAX_GPS_AGE_SECONDS = 120;

/** Normaliza string de categoria (case/acento safe) — guard adicional caso
 *  o enum seja burlado em algum ponto. */
function normalizeCategory(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * Encontra o próximo motorista disponível (mesma categoria, online, aprovado,
 * com GPS recente, que ainda não recusou) e grava em `current_offer_driver_id`.
 *
 * NÃO altera o status (permanece `procurar_motorista`).
 *
 * Estratégia: carrega TODOS os candidatos da categoria, loga rejeições uma
 * por uma, e expande o raio progressivamente até encontrar alguém.
 */
export async function offerToNextDriver(supabase: any, rideId: string): Promise<string | null> {
  const ride = await supabase.from("rides").select("*").eq("id", rideId).single();
  if (ride.error) throw new Error(ride.error.message);
  const r = ride.data;
  if (r.status !== RIDE_STATUS.PROCURAR_MOTORISTA) {
    console.log("[MOVVI DESPACHO] corrida não está procurando motorista, status=", r.status);
    return null;
  }
  if (r.current_offer_driver_id) {
    console.log("[MOVVI DESPACHO] corrida já ofertada a", r.current_offer_driver_id, "— ignorando");
    return r.current_offer_driver_id as string;
  }

  const rideCategory = normalizeCategory(r.category);
  const origin = { lat: r.origin_lat as number, lng: r.origin_lng as number };
  console.log("[MOVVI DESPACHO] ▶ início", { rideId, origin, category: rideCategory });

  // 1) Carrega TODOS os motoristas (sem filtro) para diagnosticar.
  const allDriversRes = await supabase
    .from("drivers")
    .select("user_id, name, category, is_online, approval_status, current_lat, current_lng, last_location_at");
  if (allDriversRes.error) {
    console.warn("[MOVVI DESPACHO] erro lendo drivers:", allDriversRes.error.message);
    throw new Error(allDriversRes.error.message);
  }
  const allDrivers = allDriversRes.data ?? [];
  console.log("[MOVVI DESPACHO] total motoristas no banco:", allDrivers.length);

  const rejected: string[] = r.rejected_driver_ids ?? [];
  const now = Date.now();

  type Eval = { user_id: string; name: string | null; dist_km: number | null; reasons: string[]; eligible: boolean };
  const evaluated: Eval[] = allDrivers.map((d: any) => {
    const reasons: string[] = [];
    if (!d.is_online) reasons.push("offline");
    if (d.approval_status !== "aprovado") reasons.push(`não aprovado (${d.approval_status})`);
    if (normalizeCategory(d.category) !== rideCategory) reasons.push(`categoria != ${rideCategory} (${d.category})`);
    if (d.current_lat == null || d.current_lng == null) reasons.push("sem GPS");
    if (d.last_location_at) {
      const ageSec = (now - new Date(d.last_location_at).getTime()) / 1000;
      if (ageSec > MAX_GPS_AGE_SECONDS) reasons.push(`GPS antigo (${Math.round(ageSec)}s)`);
    }
    if (rejected.includes(d.user_id)) reasons.push("já recusou esta corrida");
    if (d.user_id === r.driver_id) reasons.push("já é motorista da corrida");

    const dist = d.current_lat != null && d.current_lng != null
      ? distanceKm(origin, { lat: d.current_lat, lng: d.current_lng })
      : null;

    return { user_id: d.user_id, name: d.name, dist_km: dist, reasons, eligible: reasons.length === 0 };
  });

  // Log estrutural de cada candidato (motivos de rejeição NUNCA escondidos).
  for (const e of evaluated) {
    console.log("[MOVVI DESPACHO] candidato:", {
      driver: e.user_id, name: e.name,
      dist_km: e.dist_km != null ? Number(e.dist_km.toFixed(3)) : null,
      status: e.eligible ? "elegível (antes do raio)" : `descartado: ${e.reasons.join(", ")}`,
    });
  }

  const eligibleAll = evaluated.filter((e) => e.eligible && e.dist_km != null);
  console.log("[MOVVI DESPACHO] resumo filtros:", {
    total: evaluated.length,
    online: evaluated.filter((e) => !e.reasons.includes("offline")).length,
    aprovados: evaluated.filter((e) => !e.reasons.some((r) => r.startsWith("não aprovado"))).length,
    com_gps: evaluated.filter((e) => !e.reasons.includes("sem GPS")).length,
    categoria_match: evaluated.filter((e) => !e.reasons.some((r) => r.startsWith("categoria !="))).length,
    elegiveis_antes_do_raio: eligibleAll.length,
  });

  // 2) Expansão progressiva do raio.
  let chosen: Eval | null = null;
  for (const radius of DISPATCH_RADII_KM) {
    const within = eligibleAll
      .filter((e) => (e.dist_km ?? Infinity) <= radius)
      .sort((a, b) => (a.dist_km ?? 0) - (b.dist_km ?? 0));
    console.log(`[MOVVI DESPACHO] raio ${radius} km → ${within.length} motorista(s)`);
    if (within.length > 0) { chosen = within[0]; break; }
  }

  if (!chosen) {
    console.log("[MOVVI DESPACHO] ✗ nenhum motorista elegível para a corrida", rideId);
    return null;
  }

  console.log("[MOVVI DESPACHO] ✓ oferta:", {
    rideId, driver: chosen.user_id, name: chosen.name,
    dist_km: chosen.dist_km != null ? Number(chosen.dist_km.toFixed(3)) : null,
  });
  const upd = await supabase
    .from("rides")
    .update({ current_offer_driver_id: chosen.user_id })
    .eq("id", rideId)
    .eq("status", RIDE_STATUS.PROCURAR_MOTORISTA)
    .is("current_offer_driver_id", null);
  if (upd.error) console.warn("[MOVVI DESPACHO] erro gravando oferta:", upd.error.message);
  return chosen.user_id;
}

/**
 * Re-despacho sob demanda. O passageiro chama em loop (~5s) enquanto está
 * na tela "procurando motorista" e a corrida ainda não foi ofertada a ninguém.
 * Usa o cliente admin para garantir consistência (ignora RLS).
 */
export const redispatchRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RideIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cur = await supabaseAdmin
      .from("rides")
      .select("id, status, passenger_id, current_offer_driver_id")
      .eq("id", data.rideId)
      .maybeSingle();
    if (cur.error) throw new Error(cur.error.message);
    if (!cur.data) throw new Error("Corrida não encontrada.");
    if (cur.data.passenger_id !== userId) {
      throw new Error("Apenas o passageiro pode re-despachar a corrida.");
    }
    if (cur.data.status !== RIDE_STATUS.PROCURAR_MOTORISTA) {
      return { ok: true, skipped: "status_changed", status: cur.data.status, driver: null as string | null };
    }
    if (cur.data.current_offer_driver_id) {
      return { ok: true, skipped: "already_offered", status: cur.data.status, driver: cur.data.current_offer_driver_id };
    }
    const next = await offerToNextDriver(supabaseAdmin, data.rideId);
    return { ok: true, skipped: null as string | null, status: cur.data.status, driver: next };
  });

/** Diagnóstico de despacho (DEV) — devolve a contagem de motoristas em cada
 *  filtro e ao redor da origem (para o painel de debug do passageiro). */
export const diagnoseDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RideIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Diagnóstico expõe localização de TODOS os motoristas — restrito a admins.
    const role = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "super_admin", "operations", "support"])
      .maybeSingle();
    if (!role.data) {
      throw new Error("Diagnóstico disponível apenas para administradores.");
    }

    const r = await supabaseAdmin.from("rides").select("*").eq("id", data.rideId).maybeSingle();
    if (r.error || !r.data) throw new Error("Corrida não encontrada.");
    const ride = r.data;
    const drv = await supabaseAdmin
      .from("drivers")
      .select("user_id, name, category, is_online, approval_status, current_lat, current_lng, last_location_at");
    const all = drv.data ?? [];
    const cat = normalizeCategory(ride.category);
    const origin = { lat: ride.origin_lat, lng: ride.origin_lng };
    const now = Date.now();
    const evaluated = all.map((d: any) => {
      const reasons: string[] = [];
      if (!d.is_online) reasons.push("offline");
      if (d.approval_status !== "aprovado") reasons.push("não aprovado");
      if (normalizeCategory(d.category) !== cat) reasons.push("categoria");
      if (d.current_lat == null || d.current_lng == null) reasons.push("sem GPS");
      if (d.last_location_at && (now - new Date(d.last_location_at).getTime()) / 1000 > MAX_GPS_AGE_SECONDS) reasons.push("GPS antigo");
      const dist = d.current_lat != null && d.current_lng != null
        ? distanceKm(origin, { lat: d.current_lat, lng: d.current_lng }) : null;
      return { user_id: d.user_id, name: d.name, dist_km: dist, reasons };
    });
    return {
      ride: {
        id: ride.id, status: ride.status, category: ride.category,
        current_offer_driver_id: ride.current_offer_driver_id,
        origin, rejected: ride.rejected_driver_ids ?? [],
      },
      totals: {
        total: evaluated.length,
        online: evaluated.filter((e) => !e.reasons.includes("offline")).length,
        aprovados: evaluated.filter((e) => !e.reasons.includes("não aprovado")).length,
        com_gps: evaluated.filter((e) => !e.reasons.includes("sem GPS")).length,
        categoria_match: evaluated.filter((e) => !e.reasons.includes("categoria")).length,
        elegiveis: evaluated.filter((e) => e.reasons.length === 0).length,
      },
      drivers: evaluated,
      radii: DISPATCH_RADII_KM.map((km) => ({
        km, count: evaluated.filter((e) => e.reasons.length === 0 && e.dist_km != null && e.dist_km <= km).length,
      })),
    };
  });

// ---------- Server functions oficiais ----------

/** Passageiro cria a corrida. Status inicial = procurar_motorista.
 *  Distância, duração e preço estimados são calculados/validados no servidor
 *  — o cliente pode sugerir valores apenas como referência. */
export const criarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CriarCorridaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // --- Cálculo autoritativo (server-side) ---
    const straightKm = distanceKm(data.origin, data.destination);
    // Estimativa conservadora: usa a distância informada pelo cliente apenas
    // se for >= distância em linha reta (o cliente conhece a rota real do
    // Google). Caso contrário, multiplicamos a distância em linha reta por
    // 1.30 como aproximação de fator de rota.
    const clientKm =
      typeof data.distance_km === "number" && Number.isFinite(data.distance_km)
        ? Math.max(0, data.distance_km)
        : 0;
    const distanceKmFinal = clientKm >= straightKm ? clientKm : straightKm * 1.3;

    const clientMin =
      typeof data.duration_min === "number" && Number.isFinite(data.duration_min)
        ? Math.max(0, data.duration_min)
        : 0;
    // 30 km/h média conservadora urbana caso o cliente não informe.
    const durationMinFinal = clientMin > 0 ? clientMin : (distanceKmFinal / 30) * 60;

    const tariff = await loadTariff(supabaseAdmin, data.category);
    const estimatedPriceServer = computeFareFromTariff(tariff, distanceKmFinal, durationMinFinal);

    const ins = await supabaseAdmin
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
        distance_km: distanceKmFinal,
        duration_min: durationMinFinal,
        estimated_price: estimatedPriceServer,
        status: RIDE_STATUS.PROCURAR_MOTORISTA,
      })
      .select("*")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    console.log("[MOVVI DESPACHO] corrida criada:", {
      ride_id: ins.data.id, passenger_id: ins.data.passenger_id, category: ins.data.category,
      distance_km: distanceKmFinal, estimated_price: estimatedPriceServer,
      status: ins.data.status, created_at: ins.data.created_at,
    });
    try { await offerToNextDriver(supabaseAdmin, ins.data.id); }
    catch (e) { console.warn("[MOVVI DESPACHO] offerToNextDriver inicial falhou:", (e as Error).message); }
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

    // snapshot do motorista (inclui photo_url para o passageiro ver)
    const drv = await supabase
      .from("drivers")
      .select("name, phone, vehicle_model, vehicle_plate, vehicle_color, current_lat, current_lng, photo_url")
      .eq("user_id", userId)
      .maybeSingle();
    if (drv.error) throw new Error("Falha ao carregar dados do motorista: " + drv.error.message);
    const d = drv.data as (typeof drv.data & { photo_url?: string | null }) | null;
    const vehicle =
      d && (d.vehicle_model || d.vehicle_plate)
        ? [d.vehicle_color, d.vehicle_model, d.vehicle_plate]
            .filter((x): x is string => !!x && String(x).trim().length > 0)
            .join(" • ")
        : null;

    // foto do passageiro: usa supabaseAdmin (driver não tem RLS para ler users)
    let passengerPhotoUrl: string | null = null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const rideRow = await supabaseAdmin
        .from("rides")
        .select("passenger_id")
        .eq("id", data.rideId)
        .maybeSingle();
      const pid = rideRow.data?.passenger_id ?? null;
      if (pid) {
        const u = await supabaseAdmin
          .from("users")
          .select("avatar_url")
          .eq("auth_user_id", pid)
          .maybeSingle();
        passengerPhotoUrl = (u.data?.avatar_url as string | null) ?? null;
      }
    } catch (e) {
      console.warn("[MOVVI ACEITE] foto passageiro indisponível:", (e as Error).message);
    }

    // PIN de segurança (4 dígitos) — gerado UMA vez no aceite, nunca regenerado.
    const safetyCode = String(Math.floor(1000 + Math.random() * 9000));

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
      driver_photo_url: (d?.photo_url ?? null) as string | null,
      passenger_photo_url: passengerPhotoUrl,
      safety_code: safetyCode,
    };

    const { supabaseAdmin: adminForUpdate } = await import("@/integrations/supabase/client.server");
    const upd = await adminForUpdate
      .from("rides")
      .update(patch)
      .eq("id", data.rideId)
      .eq("status", RIDE_STATUS.PROCURAR_MOTORISTA)
      .eq("current_offer_driver_id", userId)
      .select("*")
      .single();
    if (upd.error) {
      console.error("[MOVVI MOTORISTA] aceite falhou:", upd.error);
      throw new Error(
        upd.error.code === "PGRST116"
          ? "Esta corrida já não está mais disponível."
          : "Não foi possível aceitar a corrida. Tente novamente.",
      );
    }
    console.log("[MOVVI MOTORISTA] aceite confirmado no backend", {
      rideId: upd.data.id,
      driverId: upd.data.driver_id,
      status: upd.data.status,
      hasDriverPhoto: !!(upd.data as { driver_photo_url?: string | null }).driver_photo_url,
      hasPassengerPhoto: !!(upd.data as { passenger_photo_url?: string | null }).passenger_photo_url,
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

/** Motorista inicia a viagem após validar o PIN de segurança do passageiro. */
export const iniciarCorrida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => IniciarCorridaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertDriverApproved(supabase, userId);

    // Lê o código atual da corrida (sem expor para o motorista) e compara.
    const cur = await supabase
      .from("rides")
      .select("safety_code, status, driver_id")
      .eq("id", data.rideId)
      .maybeSingle();
    if (cur.error) throw new Error("Falha ao validar a corrida: " + cur.error.message);
    if (!cur.data) throw new Error("Corrida não encontrada.");
    if (cur.data.driver_id !== userId) throw new Error("Esta corrida não é sua.");
    if (cur.data.status !== RIDE_STATUS.MOTORISTA_CHEGOU) {
      throw new Error("A corrida não está no momento de iniciar.");
    }
    const expected = String(cur.data.safety_code ?? "").trim();
    const provided = String(data.safety_code ?? "").trim();
    if (!expected || expected !== provided) {
      throw new Error("Código incorreto. Peça o código ao passageiro e tente novamente.");
    }

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
 * Marca `driver_rated_at` para que a tela de avaliação não reapareça.
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
        driver_rated_at: new Date().toISOString(),
      } as RideUpdate)
      .eq("id", data.rideId)
      .eq("driver_id", userId)
      .eq("status", RIDE_STATUS.FINALIZADA)
      .is("driver_rated_at", null)
      .select("id")
      .maybeSingle();
    if (upd.error) throw new Error("Não foi possível registrar a avaliação: " + upd.error.message);
    return { ok: true };
  });

/**
 * Passageiro avalia o motorista após a corrida finalizada.
 * Marca `passenger_rated_at` para que a tela de avaliação não reapareça.
 */
export const avaliarMotorista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AvaliarPassageiroInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const upd = await supabase
      .from("rides")
      .update({
        driver_rating: data.stars,
        driver_rating_comment: data.comment ?? null,
        passenger_rated_at: new Date().toISOString(),
      } as RideUpdate)
      .eq("id", data.rideId)
      .eq("passenger_id", userId)
      .eq("status", RIDE_STATUS.FINALIZADA)
      .is("passenger_rated_at", null)
      .select("id")
      .maybeSingle();
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
