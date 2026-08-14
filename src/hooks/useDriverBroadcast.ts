import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBrazilCoordinate } from "@/lib/googleMaps";

export type DriverTelemetry = {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
};

type DriverPresenceRpcArgs = {
  _online: boolean;
  _lat: number | null;
  _lng: number | null;
  _heading: number | null;
  _speed: number | null;
};

type DriverPresenceRpcClient = {
  rpc: (
    name: "driver_set_presence",
    args: DriverPresenceRpcArgs,
  ) => Promise<{ error: { message: string } | null }>;
};

const MIN_MOVEMENT_METERS = 10;
const MIN_INTERVAL_MS = 3500;
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

async function setPresence(
  online: boolean,
  position?: DriverTelemetry | null,
) {
  const { error } = await (supabase as unknown as DriverPresenceRpcClient).rpc("driver_set_presence", {
    _online: online,
    _lat: online ? position?.lat ?? null : null,
    _lng: online ? position?.lng ?? null : null,
    _heading: online ? position?.heading ?? null : null,
    _speed: online ? position?.speed ?? null : null,
  });
  if (error) {
    console.warn("[APOIS MOTORISTA] presença não atualizada:", error.message);
  }
}

/**
 * Mantém a presença de foreground da WebView no contrato oficial do Supabase.
 *
 * O Foreground Service nativo possui um único owner: DriverPresenceKeeper.
 * Este hook não inicia nem encerra serviço Android; ele apenas publica a
 * telemetria disponível enquanto a UI está ativa. Isso evita dois effects
 * concorrentes disputando o ciclo de vida do mesmo serviço nativo.
 */
export function useDriverBroadcast(
  userId: string | null,
  online: boolean,
  position: DriverTelemetry | null,
) {
  const lastWrittenRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const positionRef = useRef(position);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (!userId) return;
    if (!online) {
      lastWrittenRef.current = null;
      void setPresence(false, null);
      return;
    }

    const current = positionRef.current;
    if (current && isBrazilCoordinate(current.lat, current.lng)) {
      void setPresence(true, current);
    }
  }, [userId, online]);

  useEffect(() => {
    if (!userId || !online) return;

    const writeNow = (force = false) => {
      const p = positionRef.current;
      if (!p || !isBrazilCoordinate(p.lat, p.lng)) return;

      const now = Date.now();
      const last = lastWrittenRef.current;
      if (!force && last) {
        const moved = haversineMeters({ lat: last.lat, lng: last.lng }, p);
        const elapsed = now - last.at;
        if (moved < MIN_MOVEMENT_METERS && elapsed < HEARTBEAT_MS) return;
        if (elapsed < MIN_INTERVAL_MS) return;
      }

      lastWrittenRef.current = { lat: p.lat, lng: p.lng, at: now };
      void setPresence(true, p);
    };

    writeNow(true);
    const interval = window.setInterval(() => writeNow(false), 4000);
    return () => window.clearInterval(interval);
  }, [userId, online]);
}
