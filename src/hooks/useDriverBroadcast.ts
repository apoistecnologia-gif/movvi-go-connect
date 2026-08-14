import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBrazilCoordinate } from "@/lib/googleMaps";
import {
  startNativeDriverLocation,
  stopNativeDriverLocation,
} from "@/lib/driverNativeLocation";

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
 * Mantém a presença do motorista pelo contrato oficial do Supabase.
 *
 * Enquanto a WebView está ativa, publica a telemetria em foreground. No APK
 * Android também liga o DriverLocationService nativo ao entrar ONLINE, para
 * continuar enviando GPS com tela bloqueada ou app em background, e o encerra
 * ao ficar OFFLINE ou ao sair da conta.
 */
export function useDriverBroadcast(
  userId: string | null,
  online: boolean,
  position: DriverTelemetry | null,
) {
  const lastWrittenRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const positionRef = useRef(position);
  const nativeStartPendingRef = useRef(false);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (!userId) return;

    if (!online) {
      nativeStartPendingRef.current = false;
      void stopNativeDriverLocation().catch((error: unknown) => {
        console.warn("[APOIS MOTORISTA] serviço de localização nativa não encerrou:", error);
      });
      return;
    }

    const startWhenVisible = () => {
      // Android 14+ restringe a criação de Foreground Service de localização
      // quando a Activity já está em background. A reidratação acontece assim
      // que a WebView volta a ficar visível; depois de iniciado, o serviço
      // nativo continua independente da visibilidade da UI.
      if (document.visibilityState !== "visible") return;
      if (nativeStartPendingRef.current) return;

      nativeStartPendingRef.current = true;
      void startNativeDriverLocation()
        .then((started) => {
          if (started && import.meta.env.DEV) {
            console.log("[APOIS MOTORISTA] localização nativa em background ativa");
          }
        })
        .catch((error: unknown) => {
          console.warn("[APOIS MOTORISTA] localização nativa em background indisponível:", error);
        })
        .finally(() => {
          nativeStartPendingRef.current = false;
        });
    };

    startWhenVisible();
    document.addEventListener("visibilitychange", startWhenVisible);
    return () => document.removeEventListener("visibilitychange", startWhenVisible);
  }, [userId, online]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      nativeStartPendingRef.current = false;
      void stopNativeDriverLocation().catch((error: unknown) => {
        console.warn("[APOIS MOTORISTA] falha ao encerrar localização nativa no logout:", error);
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

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
