import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBrazilCoordinate } from "@/lib/googleMaps";
import { HML_ORIGIN } from "@/lib/hml-mobile-transport";
const hmlPresence = import.meta.env.VITE_SUPABASE_URL === HML_ORIGIN;
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
const DRIVER_ONLINE_STORAGE_KEY = "apois:driver:online";

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

function normalizeHeading(value: number | null | undefined): number | null {
  const heading = Number(value);
  if (!Number.isFinite(heading)) return null;
  return ((heading % 360) + 360) % 360;
}

function normalizeSpeed(value: number | null | undefined): number | null {
  const speed = Number(value);
  return Number.isFinite(speed) && speed >= 0 ? speed : null;
}

async function setPresence(
  online: boolean,
  position?: DriverTelemetry | null,
) {
  const hasValidPosition = !!position && isBrazilCoordinate(Number(position.lat), Number(position.lng));
  const publishOnline = online && hasValidPosition;
  const { error } = await (supabase as unknown as DriverPresenceRpcClient).rpc("driver_set_presence", {
    _online: publishOnline,
    _lat: publishOnline ? Number(position?.lat) : null,
    _lng: publishOnline ? Number(position?.lng) : null,
    _heading: publishOnline ? normalizeHeading(position?.heading) : null,
    _speed: publishOnline ? normalizeSpeed(position?.speed) : null,
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
  // HML has one native writer owned by the root keeper, never the legacy RPC.
  const lastWrittenRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const positionRef = useRef(position);
  const nativeStartPendingRef = useRef(false);
  const nativeLifecycleVersionRef = useRef(0);
  const presenceLifecycleVersionRef = useRef(0);
  const presenceWriteChainRef = useRef<Promise<void>>(Promise.resolve());

  const queuePresenceWrite = (
    desiredOnline: boolean,
    desiredPosition: DriverTelemetry | null,
    lifecycleVersion: number,
  ) => {
    presenceWriteChainRef.current = presenceWriteChainRef.current
      .catch(() => undefined)
      .then(async () => {
        // Escritas ONLINE pertencentes a um ciclo anterior nunca podem rodar
        // depois de o motorista ter ficado OFFLINE/trocado de sessão. Sem esta
        // fila, uma RPC ONLINE lenta podia terminar depois da RPC OFFLINE e
        // ressuscitar a presença no banco.
        if (desiredOnline && presenceLifecycleVersionRef.current !== lifecycleVersion) return;
        await setPresence(desiredOnline, desiredPosition);
        // Se a mudança de lifecycle aconteceu enquanto a RPC ONLINE estava em
        // voo, reafirma OFFLINE ao final. Isso fecha a janela de corrida entre
        // respostas HTTP fora de ordem.
        if (desiredOnline && presenceLifecycleVersionRef.current !== lifecycleVersion) {
          await setPresence(false, null);
        }
      });
  };

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (hmlPresence) return;
    const lifecycleVersion = ++nativeLifecycleVersionRef.current;
    if (!userId) {
      nativeStartPendingRef.current = false;
      void stopNativeDriverLocation().catch(() => undefined);
      return;
    }

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
        .then(async (started) => {
          // Se o motorista ficou OFFLINE, trocou de usuário ou o efeito foi
          // desmontado enquanto o start nativo estava aguardando permissão/
          // sessão, o serviço que acabou de iniciar já está obsoleto e precisa
          // ser encerrado imediatamente. Sem esta guarda ele podia continuar
          // publicando localização em background depois do OFFLINE.
          if (nativeLifecycleVersionRef.current !== lifecycleVersion) {
            if (started) await stopNativeDriverLocation().catch(() => undefined);
            return;
          }
          if (started && import.meta.env.DEV) {
            console.log("[APOIS MOTORISTA] localização nativa em background ativa");
          }
        })
        .catch((error: unknown) => {
          if (nativeLifecycleVersionRef.current === lifecycleVersion) {
            console.warn("[APOIS MOTORISTA] localização nativa em background indisponível:", error);
          }
        })
        .finally(() => {
          if (nativeLifecycleVersionRef.current === lifecycleVersion) {
            nativeStartPendingRef.current = false;
          }
        });
    };

    startWhenVisible();
    document.addEventListener("visibilitychange", startWhenVisible);
    return () => {
      nativeLifecycleVersionRef.current += 1;
      nativeStartPendingRef.current = false;
      document.removeEventListener("visibilitychange", startWhenVisible);
    };
  }, [userId, online]);

  useEffect(() => {
    if (hmlPresence) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      nativeLifecycleVersionRef.current += 1;
      presenceLifecycleVersionRef.current += 1;
      nativeStartPendingRef.current = false;
      lastWrittenRef.current = null;
      try {
        window.localStorage.setItem(DRIVER_ONLINE_STORAGE_KEY, "0");
      } catch {
        // armazenamento indisponível não pode impedir o encerramento do GPS
      }
      void stopNativeDriverLocation().catch((error: unknown) => {
        console.warn("[APOIS MOTORISTA] falha ao encerrar localização nativa no logout:", error);
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (hmlPresence) return;
    const lifecycleVersion = ++presenceLifecycleVersionRef.current;
    if (!userId) return;
    if (!online) {
      lastWrittenRef.current = null;
      queuePresenceWrite(false, null, lifecycleVersion);
      return;
    }

    const current = positionRef.current;
    if (current && isBrazilCoordinate(current.lat, current.lng)) {
      queuePresenceWrite(true, current, lifecycleVersion);
    }
  }, [userId, online]);

  useEffect(() => {
    if (hmlPresence || !userId || !online) return;
    const lifecycleVersion = presenceLifecycleVersionRef.current;

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
      queuePresenceWrite(true, p, lifecycleVersion);
    };

    writeNow(true);
    const interval = window.setInterval(() => writeNow(false), 4000);
    return () => window.clearInterval(interval);
  }, [userId, online]);
}
