import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBrazilCoordinate } from "@/lib/googleMaps";

const STORAGE_KEY = "apois:driver:online";
const PRESENCE_EVENT = "apois:driver-presence-change";
const HEARTBEAT_MS = 15000;

type Telemetry = { lat: number; lng: number; heading: number | null; speed: number | null };

function readDesiredOnline() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

async function syncPresence(online: boolean, position: Telemetry | null) {
  const { error } = await (supabase as any).rpc("driver_set_presence", {
    _online: online,
    _lat: online ? position?.lat ?? null : null,
    _lng: online ? position?.lng ?? null : null,
    _heading: online ? position?.heading ?? null : null,
    _speed: online ? position?.speed ?? null : null,
  });
  if (error) console.warn("[APOIS MOTORISTA] keeper de presença:", error.message);
}

export function DriverPresenceKeeper() {
  const latestRef = useRef<Telemetry | null>(null);
  const watchRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const stopTracking = useCallback(() => {
    runningRef.current = false;
    if (watchRef.current != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTracking = useCallback(async () => {
    if (runningRef.current || !readDesiredOnline() || !("geolocation" in navigator)) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session || !readDesiredOnline()) return;
    runningRef.current = true;

    const onPosition = (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (!isBrazilCoordinate(lat, lng)) return;
      const telemetry: Telemetry = {
        lat,
        lng,
        heading: Number.isFinite(pos.coords.heading as number) ? (pos.coords.heading as number) : null,
        speed: Number.isFinite(pos.coords.speed as number) ? (pos.coords.speed as number) : null,
      };
      latestRef.current = telemetry;
      void syncPresence(true, telemetry);
    };

    navigator.geolocation.getCurrentPosition(onPosition, () => {}, {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 120000,
    });
    watchRef.current = navigator.geolocation.watchPosition(onPosition, () => {}, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 5000,
    });
    timerRef.current = window.setInterval(() => {
      if (!readDesiredOnline()) return;
      const p = latestRef.current;
      if (p) void syncPresence(true, p);
    }, HEARTBEAT_MS);
  }, []);

  useEffect(() => {
    void startTracking();

    const onPresenceChange = (event: Event) => {
      const online = Boolean((event as CustomEvent<{ online?: boolean }>).detail?.online);
      if (online) {
        void startTracking();
      } else {
        stopTracking();
        latestRef.current = null;
        void syncPresence(false, null);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && readDesiredOnline()) void startTracking();
    };

    window.addEventListener(PRESENCE_EVENT, onPresenceChange as EventListener);
    document.addEventListener("visibilitychange", onVisibility);
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        try { localStorage.setItem(STORAGE_KEY, "0"); } catch {}
        stopTracking();
        latestRef.current = null;
      } else if (readDesiredOnline()) {
        void startTracking();
      }
    });

    return () => {
      window.removeEventListener(PRESENCE_EVENT, onPresenceChange as EventListener);
      document.removeEventListener("visibilitychange", onVisibility);
      authListener.subscription.unsubscribe();
      stopTracking();
    };
  }, [startTracking, stopTracking]);

  return null;
}
