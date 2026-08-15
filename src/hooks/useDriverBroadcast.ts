import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBrazilCoordinate } from "@/lib/googleMaps";

export type DriverTelemetry = {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
};

const MIN_MOVEMENT_METERS = 10;
const MIN_INTERVAL_MS = 3500;
const HEARTBEAT_MS = 15000;
let blockingReloadScheduled = false;

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

function reconcileOperationalBlock(message: string) {
  if (!/driver_suspended|driver_not_approved|driver_subscription_inactive|driver_kyc_incomplete/i.test(message)) {
    return;
  }

  try {
    localStorage.setItem("apois:driver:online", "0");
    window.dispatchEvent(new CustomEvent("apois:driver-presence-change", { detail: { online: false } }));
  } catch {
    // O backend já bloqueou a operação; armazenamento local é apenas UX.
  }

  if (blockingReloadScheduled) return;
  blockingReloadScheduled = true;
  window.setTimeout(() => window.location.reload(), 250);
}

async function setPresence(
  online: boolean,
  position?: DriverTelemetry | null,
) {
  const { error } = await (supabase as any).rpc("driver_set_presence", {
    _online: online,
    _lat: online ? position?.lat ?? null : null,
    _lng: online ? position?.lng ?? null : null,
    _heading: online ? position?.heading ?? null : null,
    _speed: online ? position?.speed ?? null : null,
  });
  if (error) {
    console.warn("[APOIS MOTORISTA] presença não atualizada:", error.message);
    reconcileOperationalBlock(error.message ?? "");
  }
}

/**
 * Mantém presença e GPS do motorista no contrato oficial do Supabase.
 *
 * Não grava em tabelas legadas. O RPC driver_set_presence autentica o
 * motorista, valida aprovação/mensalidade e atualiza public.drivers. Uma
 * trigger do banco espelha as coordenadas na corrida ativa para que o app do
 * passageiro acompanhe o carro em realtime.
 *
 * Se a elegibilidade for retirada durante `em_viagem`, o servidor continua
 * aceitando somente a telemetria da corrida atual e mantém o motorista offline.
 * Assim que a viagem termina, a próxima tentativa de presença reconcilia o app
 * para o estado bloqueado sem permitir novas ofertas.
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
