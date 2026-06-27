import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBrazilCoordinate } from "@/lib/googleMaps";
import type { Database } from "@/integrations/supabase/types";


type DriverUpdate = Database["public"]["Tables"]["drivers"]["Update"];

export type DriverTelemetry = {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
};

/**
 * Mantém posição/online do motorista atualizados no Supabase enquanto online.
 * Ao ficar offline, marca is_online=false e zera current_lat/lng.
 *
 * Aceita também heading (graus) e speed (m/s) para rastreamento em tempo real
 * do motorista durante a corrida (Uber/99-style).
 */
export function useDriverBroadcast(
  userId: string | null,
  online: boolean,
  position: { lat: number; lng: number; heading?: number | null; speed?: number | null } | null,
) {
  // toggle online/offline
  useEffect(() => {
    if (!userId) return;
    const patch: DriverUpdate = {
      is_online: online,
      last_location_at: new Date().toISOString(),
      ...(online ? {} : { current_lat: null, current_lng: null }),
    };
    supabase.from("drivers").update(patch).eq("user_id", userId).then();
  }, [userId, online]);

  // broadcast GPS
  useEffect(() => {
    if (!userId || !online || !position) return;
    if (!isBrazilCoordinate(position.lat, position.lng)) {
      console.warn("[MOVVI MOTORISTA] broadcast ignorado — coordenada fora do Brasil:", position);
      return;
    }
    const t = window.setTimeout(() => {
      supabase
        .from("drivers")
        .update({
          current_lat: position.lat,
          current_lng: position.lng,
          current_heading: position.heading ?? null,
          current_speed: position.speed ?? null,
          last_location_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .then();
    }, 600); // debounce
    return () => window.clearTimeout(t);
  }, [userId, online, position?.lat, position?.lng, position?.heading, position?.speed]);

}
