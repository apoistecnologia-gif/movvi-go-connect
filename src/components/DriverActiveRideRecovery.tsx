import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Route as RouteIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { computeDriverRoute } from "@/lib/driverRoutes.mobile";
import { isBrazilCoordinate } from "@/lib/googleMaps";

type Point = { lat: number; lng: number };
type ActiveRide = {
  id: string;
  status: string;
  origin_lat: number;
  origin_lng: number;
  destination_lat: number;
  destination_lng: number;
};
type ApoisMapWindow = Window & { __apoisMovviMap?: google.maps.Map | null };

const ACTIVE_STATUSES = ["motorista_a_caminho", "motorista_chegou", "em_viagem"] as const;
const FRESH_LOCATION_MS = 120_000;

function decodePolyline(encoded: string): Point[] {
  const points: Point[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b = 0;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index <= encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index <= encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }
  return points;
}

function usablePoint(lat: unknown, lng: unknown, lastLocationAt?: unknown): Point | null {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
  if (!isBrazilCoordinate(parsedLat, parsedLng)) return null;
  if (typeof lastLocationAt === "string" && lastLocationAt) {
    const captured = new Date(lastLocationAt).getTime();
    if (Number.isFinite(captured) && Date.now() - captured > FRESH_LOCATION_MS) return null;
  }
  return { lat: parsedLat, lng: parsedLng };
}

/**
 * Safety layer for Android WebView recreation.
 *
 * The native Foreground Service can continue writing driver_set_presence while
 * React is recreated. If the JS geolocation state comes back empty, the legacy
 * active-ride screen used to show dashes and no route. This component rehydrates
 * navigation directly from the canonical Driver presence and draws the route on
 * the already-mounted APOIS map until the normal ride screen catches up.
 */
export function DriverActiveRideRecovery() {
  const [driverId, setDriverId] = useState<string | null>(null);
  const [ride, setRide] = useState<ActiveRide | null>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [routeUnavailable, setRouteUnavailable] = useState(false);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const routeKeyRef = useRef("");

  const clearLines = () => {
    for (const line of polylinesRef.current) line.setMap(null);
    polylinesRef.current = [];
  };

  const destination = useMemo<Point | null>(() => {
    if (!ride) return null;
    if (ride.status === "em_viagem") {
      return { lat: Number(ride.destination_lat), lng: Number(ride.destination_lng) };
    }
    return { lat: Number(ride.origin_lat), lng: Number(ride.origin_lng) };
  }, [ride]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data: profile, error: profileError } = await supabase.rpc("driver_get_profile");
      const profileRecord =
        profile && typeof profile === "object" && !Array.isArray(profile)
          ? (profile as Record<string, unknown>)
          : null;
      const nextDriverId = typeof profileRecord?.id === "string" ? profileRecord.id : null;
      if (!alive || profileError || !nextDriverId || !profileRecord) return;
      setDriverId(nextDriverId);
      setPosition(
        usablePoint(
          profileRecord.current_lat,
          profileRecord.current_lng,
          profileRecord.last_location_at,
        ),
      );

      const { data: rideRows, error: rideError } = await supabase
        .from("rides")
        .select("id,status,origin_lat,origin_lng,destination_lat,destination_lng")
        .eq("driver_id", nextDriverId)
        .in("status", [...ACTIVE_STATUSES])
        .order("accepted_at", { ascending: false })
        .limit(1);
      if (!alive || rideError) return;
      setRide((rideRows?.[0] ?? null) as ActiveRide | null);
    };

    void load();
    const poll = window.setInterval(() => void load(), 12_000);
    const ridesChannel = supabase
      .channel("driver-active-route-recovery-rides")
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => void load())
      .subscribe();

    return () => {
      alive = false;
      window.clearInterval(poll);
      void supabase.removeChannel(ridesChannel);
      clearLines();
    };
  }, []);

  useEffect(() => {
    if (!driverId) return;
    const channel = supabase
      .channel(`driver-active-route-recovery-presence-${driverId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers", filter: `id=eq.${driverId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const next = usablePoint(row.current_lat, row.current_lng, row.last_location_at);
          if (next) setPosition(next);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [driverId]);

  useEffect(() => {
    if (!ride || !position || !destination || ride.status === "motorista_chegou") {
      routeKeyRef.current = "";
      setEtaSeconds(null);
      setDistanceMeters(null);
      setRouteUnavailable(false);
      clearLines();
      return;
    }

    const key = `${ride.id}:${ride.status}:${position.lat.toFixed(4)}:${position.lng.toFixed(4)}`;
    if (routeKeyRef.current === key) return;
    routeKeyRef.current = key;
    let cancelled = false;

    void (async () => {
      try {
        const result = await computeDriverRoute({ data: { origin: position, destination } });
        if (cancelled) return;
        const points = decodePolyline(result.encodedPolyline);
        const map = (window as ApoisMapWindow).__apoisMovviMap;
        if (!map || points.length < 2 || !window.google?.maps) {
          setRouteUnavailable(true);
          return;
        }

        clearLines();
        const definitions = [
          { strokeColor: "#000000", strokeOpacity: 0.14, strokeWeight: 20, zIndex: 61 },
          { strokeColor: "#ffffff", strokeOpacity: 0.94, strokeWeight: 14, zIndex: 62 },
          { strokeColor: "#F6BE1C", strokeOpacity: 1, strokeWeight: 9, zIndex: 63 },
        ];
        polylinesRef.current = definitions.map(
          (options) => new google.maps.Polyline({ path: points, geodesic: true, map, ...options }),
        );

        const bounds = new google.maps.LatLngBounds();
        points.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, { top: 105, right: 38, bottom: 180, left: 38 });
        google.maps.event.addListenerOnce(map, "idle", () => {
          if ((map.getZoom() ?? 0) > 17) map.setZoom(17);
        });
        setEtaSeconds(Number(result.durationSeconds));
        setDistanceMeters(Number(result.distanceMeters));
        setRouteUnavailable(false);
      } catch {
        if (!cancelled) {
          clearLines();
          setEtaSeconds(null);
          setDistanceMeters(null);
          setRouteUnavailable(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ride, position, destination]);

  if (!ride || ride.status === "motorista_chegou") return null;
  if (etaSeconds == null && distanceMeters == null && !routeUnavailable) return null;

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[50] w-full max-w-md -translate-x-1/2 px-4"
      style={{ top: "calc(env(safe-area-inset-top) + 76px)" }}
      aria-live="polite"
    >
      <div className="mx-auto flex items-center justify-center gap-4 rounded-2xl border border-white/70 bg-white/92 px-4 py-2 text-black shadow-xl backdrop-blur-md">
        {routeUnavailable ? (
          <span className="text-xs font-semibold text-red-700">
            Rota indisponível — mantenha o GPS e a internet ativos
          </span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold">
              <Clock3 className="h-4 w-4 text-[#C99100]" />
              {Math.max(1, Math.round((etaSeconds ?? 0) / 60))} min
            </span>
            <span className="h-5 w-px bg-black/10" />
            <span className="inline-flex items-center gap-1.5 text-xs font-bold">
              <RouteIcon className="h-4 w-4 text-[#C99100]" />
              {((distanceMeters ?? 0) / 1000).toFixed(1)} km
            </span>
          </>
        )}
      </div>
    </div>
  );
}
