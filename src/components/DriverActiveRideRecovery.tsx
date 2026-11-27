import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Route as RouteIcon } from "lucide-react";
import { isHmlDispatch, listHmlDriverRides, readHmlDriverProfile } from "@/lib/hml-dispatch-client";
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
const MAX_FUTURE_LOCATION_MS = 300_000;

function decodePolyline(encoded: string): Point[] {
  if (!encoded || encoded.length > 200_000) return [];
  const points: Point[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const readValue = (): number | null => {
    let shift = 0;
    let result = 0;
    while (index < encoded.length && shift <= 30) {
      const value = encoded.charCodeAt(index++) - 63;
      if (value < 0) return null;
      result |= (value & 0x1f) << shift;
      if (value < 0x20) return result & 1 ? ~(result >> 1) : result >> 1;
      shift += 5;
    }
    return null;
  };

  while (index < encoded.length) {
    const latDelta = readValue();
    const lngDelta = readValue();
    if (latDelta === null || lngDelta === null) return [];
    lat += latDelta;
    lng += lngDelta;
    const point = { lat: lat * 1e-5, lng: lng * 1e-5 };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return [];
    points.push(point);
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
    if (!Number.isFinite(captured)) return null;
    const age = Date.now() - captured;
    if (age > FRESH_LOCATION_MS || age < -MAX_FUTURE_LOCATION_MS) return null;
  }
  return { lat: parsedLat, lng: parsedLng };
}

function safeMetric(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

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
    return ride.status === "em_viagem"
      ? usablePoint(ride.destination_lat, ride.destination_lng)
      : usablePoint(ride.origin_lat, ride.origin_lng);
  }, [ride]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (isHmlDispatch) {
        try {
          const {data:{session}}=await supabase.auth.getSession();
          if(!session)return;
          const p=await readHmlDriverProfile(session.user.id);
          const rows=await listHmlDriverRides();
          if(!alive)return;
          setDriverId(String(p.id));
          setPosition(usablePoint(p.current_lat,p.current_lng,p.last_location_at));
          const row=rows.find(r=>r.visibility==="accepted"&&r.ride.driver_id===p.id);
          setRide(row ? row.ride as unknown as ActiveRide : null);
        }catch{if(alive){setRide(null);setPosition(null);}}
        return;
      }
      const { data: profile, error: profileError } = await supabase.rpc("driver_get_profile");
      const profileRecord =
        profile && typeof profile === "object" && !Array.isArray(profile)
          ? (profile as Record<string, unknown>)
          : null;
      const nextDriverId = typeof profileRecord?.id === "string" ? profileRecord.id : null;
      if (!alive) return;
      if (profileError || !nextDriverId || !profileRecord) {
        setDriverId(null);
        setRide(null);
        setPosition(null);
        return;
      }

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
      if (!alive) return;
      if (rideError) {
        console.warn("[APOIS Motorista] não foi possível recuperar a corrida ativa", rideError);
        setRide(null);
        return;
      }
      setRide((rideRows?.[0] ?? null) as ActiveRide | null);
    };

    void load();
    const poll = window.setInterval(() => void load(), 20_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      clearLines();
    };
  }, []);

  useEffect(() => {
    if (isHmlDispatch || !driverId) return;
    const ridesChannel = supabase
      .channel(`driver-active-route-recovery-rides-${driverId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides", filter: `driver_id=eq.${driverId}` },
        async () => {
          const { data, error } = await supabase
            .from("rides")
            .select("id,status,origin_lat,origin_lng,destination_lat,destination_lng")
            .eq("driver_id", driverId)
            .in("status", [...ACTIVE_STATUSES])
            .order("accepted_at", { ascending: false })
            .limit(1);
          if (error) {
            console.warn("[APOIS Motorista] atualização da corrida ativa indisponível", error);
            return;
          }
          setRide((data?.[0] ?? null) as ActiveRide | null);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ridesChannel);
    };
  }, [driverId]);

  useEffect(() => {
    if (isHmlDispatch || !driverId) return;
    const channel = supabase
      .channel(`driver-active-route-recovery-presence-${driverId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers", filter: `id=eq.${driverId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          setPosition(usablePoint(row.current_lat, row.current_lng, row.last_location_at));
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

    const key = `${ride.id}:${ride.status}:${position.lat.toFixed(4)}:${position.lng.toFixed(4)}:${destination.lat.toFixed(4)}:${destination.lng.toFixed(4)}`;
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
          routeKeyRef.current = "";
          setRouteUnavailable(true);
          return;
        }

        const eta = safeMetric(result.durationSeconds);
        const distance = safeMetric(result.distanceMeters);
        if (eta === null || distance === null) {
          routeKeyRef.current = "";
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
        setEtaSeconds(eta);
        setDistanceMeters(distance);
        setRouteUnavailable(false);
      } catch (error) {
        if (!cancelled) {
          console.warn("[APOIS Motorista] rota ativa indisponível", error);
          routeKeyRef.current = "";
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
      className="pointer-events-none fixed left-1/2 z-[50] w-full max-w-md -translate-x-1/2 px-3 sm:px-4"
      style={{ top: "calc(env(safe-area-inset-top) + 76px)" }}
      aria-live="polite"
      role="status"
    >
      <div className="mx-auto flex min-w-0 flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-2xl border border-white/70 bg-white/92 px-3 py-2 text-center text-black shadow-xl backdrop-blur-md sm:px-4">
        {routeUnavailable ? (
          <span className="min-w-0 break-words text-xs font-semibold leading-5 text-red-700">
            Rota temporariamente indisponível — mantenha o GPS e a internet ativos
          </span>
        ) : (
          <>
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold">
              <Clock3 className="h-4 w-4 shrink-0 text-[#C99100]" aria-hidden="true" />
              <span className="break-words">{Math.max(1, Math.round((etaSeconds ?? 0) / 60))} min</span>
            </span>
            <span className="h-5 w-px shrink-0 bg-black/10 max-[339px]:hidden" aria-hidden="true" />
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold">
              <RouteIcon className="h-4 w-4 shrink-0 text-[#C99100]" aria-hidden="true" />
              <span className="break-words">{((distanceMeters ?? 0) / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
