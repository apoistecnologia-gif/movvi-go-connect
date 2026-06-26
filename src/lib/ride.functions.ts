import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Categories = ["carros", "motos", "fretes", "guincho", "envios"] as const;

const LatLng = z.object({ lat: z.number(), lng: z.number() });

const RequestRideInput = z.object({
  origin: LatLng,
  origin_name: z.string().min(1),
  destination: LatLng,
  destination_name: z.string().min(1),
  category: z.enum(Categories),
  distance_km: z.number().nullable().optional(),
  duration_min: z.number().nullable().optional(),
  estimated_price: z.number().nullable().optional(),
});

// Haversine distance in km
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const aa =
    s1 * s1 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(aa));
}

/**
 * Cria a corrida com status "searching_driver" e oferece para o motorista
 * online mais próximo (mesma categoria). Repassa-se em rejectRide.
 */
export const requestRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RequestRideInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const insert = await supabase
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
        status: "searching_driver",
      })
      .select("*")
      .single();
    if (insert.error) throw new Error(insert.error.message);

    await offerToNextDriver(supabase, insert.data.id);
    return { rideId: insert.data.id };
  });

async function offerToNextDriver(
  supabase: any,
  rideId: string,
): Promise<string | null> {
  const ride = await supabase.from("rides").select("*").eq("id", rideId).single();
  if (ride.error) throw new Error(ride.error.message);
  const r = ride.data;

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
  const candidates = (drivers.data ?? [])
    .filter((d: any) => !rejected.includes(d.user_id) && d.user_id !== r.driver_id)
    .map((d: any) => ({
      user_id: d.user_id as string,
      dist: distanceKm(
        { lat: r.origin_lat, lng: r.origin_lng },
        { lat: d.current_lat, lng: d.current_lng },
      ),
    }))
    .filter((d: any) => d.dist <= 15) // 15km raio
    .sort((a: any, b: any) => a.dist - b.dist);

  if (candidates.length === 0) {
    await supabase
      .from("rides")
      .update({ current_offer_driver_id: null, status: "searching_driver" })
      .eq("id", rideId);
    return null;
  }

  const next = candidates[0].user_id;
  await supabase
    .from("rides")
    .update({ current_offer_driver_id: next, status: "offered_to_driver" })
    .eq("id", rideId);
  return next;
}

export const acceptRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ rideId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const upd = await supabase
      .from("rides")
      .update({
        driver_id: userId,
        status: "driver_assigned",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", data.rideId)
      .eq("current_offer_driver_id", userId)
      .select("*")
      .single();
    if (upd.error) throw new Error(upd.error.message);
    return upd.data;
  });

export const rejectRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ rideId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // admin client — após limpar current_offer_driver_id o motorista perde
    // RLS sobre a corrida; precisamos prosseguir com privilégios elevados
    // para repassar a oferta a outro motorista.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const cur = await supabaseAdmin
      .from("rides")
      .select("rejected_driver_ids")
      .eq("id", data.rideId)
      .single();
    if (cur.error) throw new Error(cur.error.message);
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

export const updateRidePhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rideId: z.string().uuid(),
        status: z.enum([
          "driver_arrived",
          "in_progress",
          "completed",
          "cancelled",
        ]),
        final_price: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: import("@/integrations/supabase/types").Database["public"]["Tables"]["rides"]["Update"] =
      { status: data.status };
    if (data.status === "in_progress") patch.started_at = new Date().toISOString();
    if (data.status === "completed") {
      patch.completed_at = new Date().toISOString();
      if (data.final_price != null) patch.final_price = data.final_price;
    }
    if (data.status === "cancelled") {
      patch.cancelled_at = new Date().toISOString();
      patch.cancelled_by = userId;
    }
    const upd = await supabase
      .from("rides")
      .update(patch)
      .eq("id", data.rideId)
      .select("*")
      .single();
    if (upd.error) throw new Error(upd.error.message);
    return upd.data;
  });
