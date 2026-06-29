import { useEffect, useRef } from "react";
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

// Distância mínima (m) para gravar novo broadcast — evita spam quando parado.
const MIN_MOVEMENT_METERS = 10;
// Janela mínima entre escritas no banco (ms) — alvo 3-5s.
const MIN_INTERVAL_MS = 3500;
// Heartbeat mesmo parado (s) — garante que o passageiro saiba que o motorista está ativo.
const HEARTBEAT_MS = 15000;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Mantém posição/online do motorista atualizados no Supabase enquanto online.
 *
 * - Escreve em `drivers` (privado, usado pelo admin / lifecycle).
 * - Escreve em `driver_public_locations` (público a authenticated, lido pelo
 *   passageiro via Realtime para acompanhar o carro em tempo real).
 * - Filtra atualizações <10 m e <3.5 s para evitar spam.
 * - Heartbeat a cada 15 s mesmo parado.
 */
export function useDriverBroadcast(
  userId: string | null,
  online: boolean,
  position: { lat: number; lng: number; heading?: number | null; speed?: number | null } | null,
) {
  const lastWrittenRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const positionRef = useRef(position);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // toggle online/offline
  useEffect(() => {
    if (!userId) return;
    const patch: DriverUpdate = {
      is_online: online,
      last_location_at: new Date().toISOString(),
      ...(online ? {} : { current_lat: null, current_lng: null }),
    };
    supabase.from("drivers").update(patch).eq("user_id", userId).then();

    // Espelha online/offline na tabela pública.
    if (online) {
      supabase
        .from("driver_public_locations" as never)
        .upsert(
          {
            user_id: userId,
            is_online: true,
            updated_at: new Date().toISOString(),
            last_location_at: new Date().toISOString(),
          } as never,
          { onConflict: "user_id" } as never,
        )
        .then();
    } else {
      lastWrittenRef.current = null;
      supabase
        .from("driver_public_locations" as never)
        .update({
          is_online: false,
          current_lat: null,
          current_lng: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("user_id", userId)
        .then();
    }
  }, [userId, online]);

  // Loop de broadcast (3-5 s, com filtro de 10 m).
  useEffect(() => {
    if (!userId || !online) return;

    const writeNow = (force = false) => {
      const p = positionRef.current;
      if (!p) return;
      if (!isBrazilCoordinate(p.lat, p.lng)) return;
      const now = Date.now();
      const last = lastWrittenRef.current;
      if (!force && last) {
        const moved = haversineMeters({ lat: last.lat, lng: last.lng }, p);
        const elapsed = now - last.at;
        if (moved < MIN_MOVEMENT_METERS && elapsed < HEARTBEAT_MS) return;
        if (elapsed < MIN_INTERVAL_MS) return;
      }
      lastWrittenRef.current = { lat: p.lat, lng: p.lng, at: now };
      const iso = new Date(now).toISOString();
      const payload = {
        current_lat: p.lat,
        current_lng: p.lng,
        current_heading: p.heading ?? null,
        current_speed: p.speed ?? null,
        last_location_at: iso,
      };
      supabase.from("drivers").update(payload).eq("user_id", userId).then();
      supabase
        .from("driver_public_locations" as never)
        .upsert(
          {
            user_id: userId,
            is_online: true,
            updated_at: iso,
            ...payload,
          } as never,
          { onConflict: "user_id" } as never,
        )
        .then();
    };

    // primeira escrita imediata
    writeNow(true);
    const interval = window.setInterval(() => writeNow(false), 4000);
    return () => window.clearInterval(interval);
  }, [userId, online]);
}
