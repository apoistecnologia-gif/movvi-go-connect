import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBrazilCoordinate } from "@/lib/googleMaps";
import { requestPostAuthPermissions } from "@/lib/nativeBridge";
import {
  isNativeAndroidDriverLocation,
  startNativeDriverLocation,
  stopNativeDriverLocation,
} from "@/lib/driverNativeLocation";

const STORAGE_KEY = "apois:driver:online";
const PRESENCE_EVENT = "apois:driver-presence-change";
const HEARTBEAT_MS = 15000;
const MAX_POSITION_AGE_MS = 45_000;

type Telemetry = {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  capturedAt: number;
};

function readDesiredOnline() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function normalizeHeading(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return ((value % 360) + 360) % 360;
}

function normalizeSpeed(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.min(value, 100);
}

function freshTelemetry(position: Telemetry | null) {
  if (!position) return null;
  if (!isBrazilCoordinate(position.lat, position.lng)) return null;
  if (!Number.isFinite(position.capturedAt) || Date.now() - position.capturedAt > MAX_POSITION_AGE_MS) return null;
  return position;
}

async function syncPresence(online: boolean, position: Telemetry | null) {
  const fresh = online ? freshTelemetry(position) : null;
  const params =
    online && fresh
      ? {
          _online: true,
          _lat: fresh.lat,
          _lng: fresh.lng,
          ...(fresh.heading != null ? { _heading: fresh.heading } : {}),
          ...(fresh.speed != null ? { _speed: fresh.speed } : {}),
        }
      : { _online: false };
  try {
    const { error } = await supabase.rpc("driver_set_presence", params);
    if (error && import.meta.env.DEV) {
      console.warn("[APOIS MOTORISTA] keeper de presença:", error.message);
    }
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[APOIS MOTORISTA] falha de rede ao sincronizar presença", error);
  }
}

export function DriverPresenceKeeper() {
  const latestRef = useRef<Telemetry | null>(null);
  const watchRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const startingRef = useRef(false);
  const nativeRef = useRef(false);
  const desiredOnlineRef = useRef(readDesiredOnline());
  const syncInFlightRef = useRef(false);
  const pendingSyncRef = useRef<{ online: boolean; position: Telemetry | null } | null>(null);

  const queuePresenceSync = useCallback((online: boolean, position: Telemetry | null) => {
    pendingSyncRef.current = { online, position };
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    void (async () => {
      try {
        while (pendingSyncRef.current) {
          const next = pendingSyncRef.current;
          pendingSyncRef.current = null;
          await syncPresence(next.online, next.position);
        }
      } finally {
        syncInFlightRef.current = false;
      }
    })();
  }, []);

  const stopTracking = useCallback(() => {
    runningRef.current = false;
    startingRef.current = false;
    if (nativeRef.current) {
      nativeRef.current = false;
      void stopNativeDriverLocation().catch((error) => {
        if (import.meta.env.DEV) {
          console.warn("[APOIS MOTORISTA] falha ao parar localização nativa:", error);
        }
      });
    }
    if (watchRef.current != null && typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTracking = useCallback(async () => {
    if (runningRef.current || startingRef.current || !desiredOnlineRef.current) return;
    startingRef.current = true;

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        if (import.meta.env.DEV) console.warn("[APOIS MOTORISTA] sessão indisponível para presença", error);
        return;
      }
      if (!data.session || !desiredOnlineRef.current) return;

      try {
        await requestPostAuthPermissions();
      } catch (error) {
        // A tela que iniciou o fluxo de online continua responsável por mostrar
        // a orientação de permissão. Uma falha aqui não deve criar rejection solta.
        if (import.meta.env.DEV) console.warn("[APOIS MOTORISTA] permissões pós-login indisponíveis", error);
      }

      if (isNativeAndroidDriverLocation()) {
        try {
          const started = await startNativeDriverLocation();
          if (started && desiredOnlineRef.current) {
            nativeRef.current = true;
            runningRef.current = true;
            return;
          }
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn(
              "[APOIS MOTORISTA] localização nativa indisponível; usando fallback em primeiro plano:",
              error,
            );
          }
        }
      }

      if (typeof navigator === "undefined" || !("geolocation" in navigator) || !desiredOnlineRef.current) return;
      runningRef.current = true;

      const onPosition = (pos: GeolocationPosition) => {
        if (!desiredOnlineRef.current) return;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isBrazilCoordinate(lat, lng)) return;
        const telemetry: Telemetry = {
          lat,
          lng,
          heading: normalizeHeading(pos.coords.heading),
          speed: normalizeSpeed(pos.coords.speed),
          capturedAt:
            typeof pos.timestamp === "number" && Number.isFinite(pos.timestamp) && pos.timestamp > 0
              ? pos.timestamp
              : Date.now(),
        };
        latestRef.current = telemetry;
        queuePresenceSync(true, telemetry);
      };

      const onPositionError = (error: GeolocationPositionError) => {
        if (import.meta.env.DEV) {
          console.warn("[APOIS MOTORISTA] localização em primeiro plano indisponível", { code: error.code });
        }
      };

      navigator.geolocation.getCurrentPosition(onPosition, onPositionError, {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 120000,
      });
      watchRef.current = navigator.geolocation.watchPosition(onPosition, onPositionError, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 5000,
      });
      timerRef.current = window.setInterval(() => {
        if (!desiredOnlineRef.current) {
          stopTracking();
          latestRef.current = null;
          queuePresenceSync(false, null);
          return;
        }
        const fresh = freshTelemetry(latestRef.current);
        if (fresh) queuePresenceSync(true, fresh);
      }, HEARTBEAT_MS);
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[APOIS MOTORISTA] falha ao iniciar keeper de presença", error);
    } finally {
      startingRef.current = false;
    }
  }, [queuePresenceSync, stopTracking]);

  useEffect(() => {
    desiredOnlineRef.current = readDesiredOnline();
    void startTracking();

    const onPresenceChange = (event: Event) => {
      const online = (event as CustomEvent<{ online?: boolean }>).detail?.online === true;
      desiredOnlineRef.current = online;
      if (online) {
        void startTracking();
      } else {
        stopTracking();
        latestRef.current = null;
        queuePresenceSync(false, null);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && desiredOnlineRef.current) void startTracking();
    };

    const onOnline = () => {
      if (desiredOnlineRef.current) void startTracking();
    };

    window.addEventListener(PRESENCE_EVENT, onPresenceChange as EventListener);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        desiredOnlineRef.current = false;
        try {
          localStorage.setItem(STORAGE_KEY, "0");
        } catch {
          // Local storage can be unavailable in hardened/private WebViews.
        }
        stopTracking();
        latestRef.current = null;
        queuePresenceSync(false, null);
      } else if (desiredOnlineRef.current) {
        void startTracking();
      }
    });

    return () => {
      window.removeEventListener(PRESENCE_EVENT, onPresenceChange as EventListener);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      authListener.subscription.unsubscribe();
      desiredOnlineRef.current = false;
      stopTracking();
      latestRef.current = null;
      pendingSyncRef.current = null;
    };
  }, [queuePresenceSync, startTracking, stopTracking]);

  return null;
}
