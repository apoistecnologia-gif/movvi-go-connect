import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBrazilCoordinate } from "@/lib/googleMaps";
import {
  ensureDriverBackgroundLocationAuthGuard,
  startDriverBackgroundLocation,
  stopDriverBackgroundLocation,
} from "@/lib/driverBackgroundLocation";

export type DriverTelemetry = {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
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
  const { error } = await (supabase as any).rpc("driver_set_presence", {
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
 * Mantém presença e GPS do motorista no contrato oficial do Supabase.
 *
 * Não grava em tabelas legadas. O RPC driver_set_presence autentica o
 * motorista, valida aprovação/mensalidade e atualiza public.drivers. Uma
 * trigger do banco espelha as coordenadas na corrida ativa para que o app do
 * passageiro acompanhe o carro em realtime.
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

  // No APK do Motorista, espelha o estado online no Foreground Service nativo.
  // O serviço continua publicando GPS diretamente no RPC oficial quando a
  // WebView é suspensa por tela bloqueada/background. Reiniciamos/reidratamos
  // apenas com a Activity visível, atendendo às restrições do Android 14+.
  useEffect(() => {
    if (!userId) return;

    ensureDriverBackgroundLocationAuthGuard();
    let cancelled = false;

    const syncNativeService = async () => {
      try {
        if (online) {
          if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
          const started = await startDriverBackgroundLocation();
          if (!started && !cancelled) {
            console.warn("[APOIS MOTORISTA] foreground service de localização não iniciou");
          }
          return;
        }
        await stopDriverBackgroundLocation();
      } catch (err) {
        if (!cancelled) {
          console.warn("[APOIS MOTORISTA] sincronização do serviço nativo de localização falhou", err);
        }
      }
    };

    void syncNativeService();

    const onVisibilityChange = () => {
      if (online && document.visibilityState === "visible") {
        void syncNativeService();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      cancelled = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
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
