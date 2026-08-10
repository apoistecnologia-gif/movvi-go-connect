import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Avatar } from "@/components/Avatar";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Marker, Polyline } from "@react-google-maps/api";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Crosshair,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Navigation2,
  Phone,
  Star,
  Clock,
  Circle,
  Route as RouteIcon,
  X,
  ChevronRight,
} from "lucide-react";
import { RIDE_CATEGORIES } from "@/lib/rideCategories";
import { MovviMap } from "@/components/MovviMap";
import { DriverSideMenu } from "@/components/DriverSideMenu";
import { ApoisDriverBottomNav } from "@/components/ApoisDriverBottomNav";
import { DriverVoiceToggle } from "@/components/DriverVoiceToggle";
import { BrandSplash } from "@/components/BrandSplash";
import { MovviSheet, type MovviSheetHandle } from "@/components/MovviSheet";
import { PassengerProfessionalProfileDialog } from "@/components/profile/PassengerProfessionalProfileDialog";
import { SafetyCard } from "@/components/safety/SafetyCard";
import {
  InterpolatedDriverMarker,
  PlacePinMarker,
} from "@/components/mapMarkers";
import { smoothPanZoom } from "@/lib/mapCamera";
import { supabase } from "@/integrations/supabase/client";
import {
  BRAZIL_CENTER,
  isBrazilCoordinate,
  purgeForeignMapCache,
  safePoint,
  safeSymbol,
} from "@/lib/googleMaps";
import { useDriverBroadcast } from "@/hooks/useDriverBroadcast";
import { loadDriverProfile, driverProfileCompletionIssues } from "@/lib/driverProfile";
import { isDevelopmentEnvironment } from "@/lib/environment";
import { computeDriverRoute, type DriverRouteStep } from "@/lib/driverRoutes.mobile";
import { primeVoice, resetSpokenCache, speak, tickNavigation, type NavStep } from "@/lib/voiceNav";
import { startRideRingtone, stopRideRingtone } from "@/lib/rideRingtone";
import { type RideStatus } from "@/lib/rideLifecycle";
import {
  aceitarCorridaMobile,
  recusarCorridaMobile,
  informarChegadaMobile,
  iniciarCorridaMobile,
  finalizarCorridaMobile,
  cancelarPeloMotoristaMobile,
  avaliarPassageiroMobile,
} from "@/lib/driverRideLifecycle.mobile";
import { notifyRideStatus } from "@/lib/rideStatusToast";
import { toast } from "sonner";

import { showPush } from "@/lib/pushNotifications";
import { formatBRL } from "@/lib/rideCategories";
import type { Database } from "@/integrations/supabase/types";
import { DSButton } from "@/design-system";

const TEST_DRIVER_LOCATION = {
  lat: -7.446,
  lng: -41.478,
};

/** Tempo máximo (em segundos) que uma oferta de corrida fica visível para
 *  o motorista antes de ser recusada automaticamente. */
const RIDE_OFFER_TIMEOUT_SECONDS = 60;

export const Route = createFileRoute("/motorista/app")({
  head: () => ({ meta: [{ title: "APOIS Motorista" }] }),
  // Auth guard: mesmo padrão do passageiro — sem sessão → login (sem loop).
  beforeLoad: async () => {
    const { redirect } = await import("@tanstack/react-router");
    const { supabase } = await import("@/integrations/supabase/client");
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session) throw redirect({ to: "/motorista/login", replace: true });
    } catch (err) {
      if (err && typeof err === "object" && "to" in (err as object)) throw err;
      try { await supabase.auth.signOut(); } catch { /* noop */ }
      throw redirect({ to: "/motorista/login", replace: true });
    }
  },
  component: MotoristaAppRoute,
});

function MotoristaAppRoute() {
  return (
    <>
      <BrandSplash storageKey="apois:splash:motorista" />
      <MotoristaApp />
    </>
  );
}

type LatLng = { lat: number; lng: number };
type RideRow = Database["public"]["Tables"]["rides"]["Row"];
type Passenger = {
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
  average_rating: number | null;
  total_ratings: number | null;
};

function passengerRatingText(passenger: Passenger | null, digits = 1) {
  const value = passenger?.average_rating == null ? 5 : Number(passenger.average_rating);
  return (Number.isFinite(value) ? value : 5).toFixed(digits);
}

const EMPTY_ROUTE: LatLng[] = [];

function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = []; let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }
  return points;
}

function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const NAVIGATION_STATUSES = new Set(["motorista_a_caminho", "em_viagem", "active", "in_progress", "started"]);
const NAVIGATION_ZOOM = 18;
const NAVIGATION_CENTER_AHEAD_METERS = 105;

function isNavigationRideStatus(status: string | null | undefined) {
  return !!status && NAVIGATION_STATUSES.has(status);
}

function normalizeHeading(value: number | null | undefined): number | null {
  if (!Number.isFinite(value as number)) return null;
  return (((value as number) % 360) + 360) % 360;
}

function bearingBetween(a: LatLng, b: LatLng): number | null {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat), dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = toDeg(Math.atan2(y, x));
  return normalizeHeading(bearing);
}

function offsetLatLng(origin: LatLng, heading: number, meters: number): LatLng {
  const radius = 6378137;
  const δ = meters / radius;
  const θ = (heading * Math.PI) / 180;
  const φ1 = (origin.lat * Math.PI) / 180;
  const λ1 = (origin.lng * Math.PI) / 180;
  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
  const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);
  return { lat: (φ2 * 180) / Math.PI, lng: (λ2 * 180) / Math.PI };
}

function routeHeadingFrom(position: LatLng, route: LatLng[], destination?: LatLng | null): number | null {
  if (route.length >= 2) {
    let nearestIndex = 0;
    let nearestKm = Number.POSITIVE_INFINITY;
    for (let i = 0; i < route.length; i += 1) {
      const km = haversineKm(position, route[i]);
      if (km < nearestKm) {
        nearestKm = km;
        nearestIndex = i;
      }
    }
    for (let i = nearestIndex + 1; i < route.length; i += 1) {
      if (haversineKm(position, route[i]) > 0.018) return bearingBetween(position, route[i]);
    }
    if (route[nearestIndex + 1]) return bearingBetween(route[nearestIndex], route[nearestIndex + 1]);
  }
  return destination ? bearingBetween(position, destination) : null;
}

function navigationHeadingFor(
  position: LatLng & { heading?: number | null },
  route: LatLng[],
  destination?: LatLng | null,
) {
  return normalizeHeading(position.heading) ?? routeHeadingFrom(position, route, destination);
}

function applyNavigationCamera(
  map: google.maps.Map,
  position: LatLng & { heading?: number | null },
  route: LatLng[],
  destination?: LatLng | null,
  immediate = false,
) {
  const heading = navigationHeadingFor(position, route, destination);
  const center = heading == null ? position : offsetLatLng(position, heading, NAVIGATION_CENTER_AHEAD_METERS);
  const navMap = map as google.maps.Map & {
    moveCamera?: (cameraOptions: google.maps.CameraOptions) => void;
    setHeading?: (heading: number) => void;
    setTilt?: (tilt: number) => void;
  };

  try {
    if (immediate && typeof navMap.moveCamera === "function") {
      navMap.moveCamera({
        center,
        zoom: NAVIGATION_ZOOM,
        heading: heading ?? undefined,
        tilt: heading == null ? 0 : 45,
      });
      return;
    }

    map.panTo(center);
    if ((map.getZoom() ?? 0) < 17) map.setZoom(NAVIGATION_ZOOM);
    if (heading != null) {
      navMap.setHeading?.(heading);
      navMap.setTilt?.(45);
    }
  } catch {
    map.panTo(position);
    if ((map.getZoom() ?? 0) < 17) map.setZoom(17);
  }
}

type RequestRemovalReason =
  | "accepted_by_other"
  | "driver_rejected"
  | "passenger_cancelled"
  | "expired"
  | "no_longer_candidate";

const ALLOWED_REQUEST_REMOVAL_REASONS = new Set<RequestRemovalReason>([
  "accepted_by_other",
  "driver_rejected",
  "passenger_cancelled",
  "expired",
  "no_longer_candidate",
]);

function getRequestExpiresAtMs(ride: RideRow): number | null {
  const value = (ride as { request_expires_at?: string | null }).request_expires_at;
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function computeOfferCountdown(ride: RideRow): number {
  const expiresAtMs = getRequestExpiresAtMs(ride);
  if (!expiresAtMs) return RIDE_OFFER_TIMEOUT_SECONDS;
  return Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
}

function paymentLabelFor(method: string | null | undefined): string {
  switch (method) {
    case "dinheiro":
    case "cash":
      return "Dinheiro";
    case "pix":
      return "PIX";
    case "cartao_credito":
    case "card":
      return "Cartão de crédito";
    default:
      return method ?? "—";
  }
}

function subscriptionBlockMessage(status: string): string {
  switch (status) {
    case "overdue":
    case "pending":
      return "Sua mensalidade está pendente. Regularize para ficar online.";
    case "expired":
      return "Sua mensalidade expirou. Regularize para voltar a operar.";
    case "blocked":
    case "suspended":
      return "Acesso bloqueado. Regularize sua mensalidade para continuar.";
    case "cancelled":
      return "Assinatura cancelada. Reative seu plano para receber corridas.";
    case "inactive":
    default:
      return "Assinatura inativa. Ative seu plano para receber corridas.";
  }
}

function subscriptionBlockIsPayable(status: string): boolean {
  return ["overdue", "pending", "expired", "blocked", "suspended", "cancelled", "inactive"].includes(status);
}


function MotoristaApp() {
  const navigate = useNavigate();
  const callAccept   = aceitarCorridaMobile;
  const callReject   = recusarCorridaMobile;
  const callArrive   = informarChegadaMobile;
  const callStart    = iniciarCorridaMobile;
  const callComplete = finalizarCorridaMobile;
  const callCancel   = cancelarPeloMotoristaMobile;
  const callRate     = avaliarPassageiroMobile;
  const callRoute    = computeDriverRoute;

  const [userId, setUserId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [driverName, setDriverName] = useState<string>("");
  const [sideMenuOpen, setSideMenuOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }
  const [position, setPosition] = useState<(LatLng & { heading?: number | null; speed?: number | null }) | null>(null);
  const [online, setOnline] = useState(() => {
    try {
      return localStorage.getItem("apois:driver:online") === "1";
    } catch {
      return false;
    }
  });
  const setDesiredOnline = useCallback((value: boolean) => {
    setOnline(value);
    try {
      localStorage.setItem("apois:driver:online", value ? "1" : "0");
      window.dispatchEvent(new CustomEvent("apois:driver-presence-change", { detail: { online: value } }));
    } catch {
    }
  }, []);
  const [statusBlock, setStatusBlock] = useState<string | null>(null);
  type GpsStatus = "prompt" | "loading" | "granted" | "denied" | "timeout" | "unavailable" | "error";
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("prompt");
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [showTestLocationButton, setShowTestLocationButton] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const initialCenteredRef = useRef(false);

  const [incoming, setIncoming] = useState<RideRow | null>(null);
  const [active, setActive] = useState<RideRow | null>(null);
  const [queuedRide, setQueuedRide] = useState<RideRow | null>(null);
  const [passenger, setPassenger] = useState<Passenger | null>(null);
  const [countdown, setCountdown] = useState(RIDE_OFFER_TIMEOUT_SECONDS);
  const [profilePassengerId, setProfilePassengerId] = useState<string | null>(null);

  const [polyline, setPolyline] = useState<LatLng[]>([]);
  const [routeSteps, setRouteSteps] = useState<NavStep[]>([]);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [legKm, setLegKm] = useState<number | null>(null);
  const [todayStats, setTodayStats] = useState<{ rides: number; earnings: number }>({ rides: 0, earnings: 0 });
  const [ratingRide, setRatingRide] = useState<RideRow | null>(null);
  const [stars, setStars] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const ratedRidesRef = useRef<Set<string>>(new Set());
  const mapRef = useRef<google.maps.Map | null>(null);
  const sheetRef = useRef<MovviSheetHandle | null>(null);
  const activeRef = useRef<RideRow | null>(null);
  const incomingRef = useRef<RideRow | null>(null);
  const queuedRideRef = useRef<RideRow | null>(null);
  const ratingRef = useRef<RideRow | null>(null);
  const handledRidesRef = useRef<Set<string>>(new Set());
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { incomingRef.current = incoming; }, [incoming]);
  useEffect(() => { queuedRideRef.current = queuedRide; }, [queuedRide]);
  useEffect(() => { ratingRef.current = ratingRide; }, [ratingRide]);

  const removeIncomingRequest = useCallback((ride: RideRow, removeReason: RequestRemovalReason | string) => {
    if (!ALLOWED_REQUEST_REMOVAL_REASONS.has(removeReason as RequestRemovalReason)) {
      console.error("INVALID REQUEST REMOVAL", { driverId: userId, rideId: ride.id, timestamp: new Date().toISOString(), removeReason });
      return;
    }
    if (import.meta.env.DEV) console.log("[APOIS REQUEST REMOVAL]", { driverId: userId, rideId: ride.id, timestamp: new Date().toISOString(), removeReason });
    setIncoming(null);
    if (removeReason !== "expired") handledRidesRef.current.add(ride.id);
  }, [userId]);

  const lastNotifiedStatusRef = useRef<RideStatus | null>(null);
  useEffect(() => {
    const s = active?.status as RideStatus | undefined;
    if (!s) { lastNotifiedStatusRef.current = null; return; }
    if (lastNotifiedStatusRef.current === s) return;
    const isFirst = lastNotifiedStatusRef.current === null;
    lastNotifiedStatusRef.current = s;
    if (isFirst) return;
    notifyRideStatus("motorista", s);
  }, [active?.status]);

  useDriverBroadcast(userId, online, position);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { navigate({ to: "/motorista/login" }); return; }
      const meta = (u.user.user_metadata ?? {}) as Record<string, unknown>;
      setDriverName(((meta.name as string) || (meta.full_name as string) || u.user.email?.split("@")[0] || "").split(" ")[0]);
      const result = await loadDriverProfile();
      if (result.ok) {
        const d = result.profile;
        setUserId(d.user_id);
        setDriverId(d.id);
        if (d.name) setDriverName(d.name.trim().split(/\s+/)[0] || d.name);
        if (d.approval_status !== "aprovado") {
          setStatusBlock(d.approval_status === "reprovado" ? `Cadastro reprovado.${d.motivo_reprovacao ? ` Motivo: ${d.motivo_reprovacao}` : ""}` : d.approval_status === "bloqueado" ? "Cadastro bloqueado. Entre em contato com o suporte." : "Cadastro em análise.");
        } else if (d.subscription_status && !["active", "ativa", "teste"].includes(d.subscription_status)) {
          setStatusBlock(subscriptionBlockMessage(d.subscription_status));
        } else {
          const issues = driverProfileCompletionIssues(d);
          if (!issues.complete && issues.message) setStatusBlock(issues.message);
        }
      } else if (result.reason === "not_found") {
        setStatusBlock("Cadastro de motorista não encontrado.");
      } else if (result.reason === "error") {
        setStatusBlock("Erro ao carregar cadastro. Tente novamente.");
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`driver-self-${userId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "drivers", filter: `user_id=eq.${userId}` }, (payload) => {
      const row = payload.new as { approval_status?: string; subscription_status?: string | null; motivo_reprovacao?: string | null };
      if (row.approval_status && row.approval_status !== "aprovado") {
        const msg = row.approval_status === "reprovado" ? `Cadastro reprovado.${row.motivo_reprovacao ? ` Motivo: ${row.motivo_reprovacao}` : ""}` : row.approval_status === "bloqueado" ? "Sua conta foi bloqueada pelo administrador." : "Cadastro em análise.";
        setStatusBlock(msg);
        setDesiredOnline(false);
        return;
      }
      if (row.subscription_status && !["active", "ativa", "teste"].includes(row.subscription_status)) {
        setStatusBlock(subscriptionBlockMessage(row.subscription_status));
        if (!activeRef.current) setDesiredOnline(false);
        return;
      }
      setStatusBlock(null);
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  const loadTodayStats = useCallback(async (driverRecordId: string) => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data } = await supabase.from("rides").select("final_price, estimated_price").eq("driver_id", driverRecordId).eq("status", "finalizada").gte("completed_at", start.toISOString());
    const rides = data?.length ?? 0;
    const earnings = (data ?? []).reduce((s, r) => s + Number(r.final_price ?? r.estimated_price ?? 0), 0);
    setTodayStats({ rides, earnings });
  }, []);
  useEffect(() => { if (driverId) loadTodayStats(driverId); }, [driverId, loadTodayStats]);

  const startWatch = useCallback(() => {
    if (watchIdRef.current != null) return;
    watchIdRef.current = navigator.geolocation.watchPosition((pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      if (!isBrazilCoordinate(lat, lng)) return;
      const heading = Number.isFinite(pos.coords.heading as number) ? (pos.coords.heading as number) : null;
      const speed = Number.isFinite(pos.coords.speed as number) ? (pos.coords.speed as number) : null;
      setPosition((prev) => {
        if (!prev || Math.abs(prev.lat - lat) > 0.0001 || Math.abs(prev.lng - lng) > 0.0001) {
          if (import.meta.env.DEV) console.log("[APOIS MOTORISTA] localização:", { lat, lng, heading, speed, accuracy: pos.coords.accuracy });
        }
        return { lat, lng, heading, speed };
      });
    }, (err) => { if (import.meta.env.DEV) console.warn("[APOIS MOTORISTA] watch GPS:", err.message); }, { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 });
  }, []);

  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("unavailable"); setGpsMessage("GPS indisponível neste dispositivo."); setShowTestLocationButton(isDevelopmentEnvironment()); return;
    }
    setGpsStatus("loading"); setGpsMessage(null);
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      if (!isBrazilCoordinate(lat, lng)) {
        setGpsStatus("error"); setGpsMessage("Sua localização não parece estar no Brasil. Ative o GPS real do aparelho e tente novamente."); setShowTestLocationButton(isDevelopmentEnvironment()); return;
      }
      setPosition({ lat, lng }); setGpsStatus("granted"); setGpsMessage(null); setShowTestLocationButton(false);
      if (mapRef.current && !initialCenteredRef.current) { smoothPanZoom(mapRef.current, { lat, lng }, 16, 700); initialCenteredRef.current = true; }
      startWatch();
    }, (err) => {
      if (err.code === err.PERMISSION_DENIED) { setGpsStatus("denied"); setGpsMessage("Localização negada. Ative a permissão do navegador para receber corridas."); }
      else if (err.code === err.TIMEOUT) { setGpsStatus("timeout"); setGpsMessage("Não conseguimos obter sua localização. Tente novamente."); }
      else { setGpsStatus("error"); setGpsMessage("Erro ao obter localização. Tente novamente."); }
      setShowTestLocationButton(isDevelopmentEnvironment());
    }, { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 });
  }, [startWatch]);

  useEffect(() => {
    purgeForeignMapCache();
    if (!("geolocation" in navigator)) { setGpsStatus("unavailable"); setGpsMessage("GPS indisponível neste dispositivo."); return; }
    const permsApi = (navigator as Navigator & { permissions?: { query: (p: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
    if (permsApi?.query) {
      permsApi.query({ name: "geolocation" as PermissionName }).then((st) => {
        if (st.state === "granted") { setGpsStatus("granted"); setGpsMessage(null); }
        else if (st.state === "denied") { setGpsStatus("denied"); setGpsMessage("Localização negada. Ative a permissão do navegador para receber corridas."); }
        else setGpsStatus("prompt");
      }).catch(() => setGpsStatus("prompt"));
    } else setGpsStatus("prompt");
    return () => {
      if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    };
  }, []);

  const activateOnlineWithCoords = useCallback((lat: number, lng: number, heading: number | null, speed: number | null, isTest: boolean) => {
    if (!isBrazilCoordinate(lat, lng)) return;
    setPosition({ lat, lng, heading, speed }); setGpsStatus("granted"); setGpsMessage(isTest ? "Modo teste ativo com localização no Brasil." : null); setShowTestLocationButton(false);
    if (mapRef.current) { smoothPanZoom(mapRef.current, { lat, lng }, 16, 700); initialCenteredRef.current = true; }
    if (!isTest) startWatch();
    setDesiredOnline(true);
  }, [userId, startWatch]);

  async function ativarLocalizacaoTesteBrasil() {
    if (!userId) return;
    const lat = TEST_DRIVER_LOCATION.lat, lng = TEST_DRIVER_LOCATION.lng;
    setPosition({ lat, lng }); setGpsStatus("granted"); setGpsMessage("Modo teste ativo com localização no Brasil."); setShowTestLocationButton(false); setDesiredOnline(true);
    if (mapRef.current) smoothPanZoom(mapRef.current, { lat, lng }, 16, 700);
  }

  const toggleOnline = useCallback(() => {
    if (online) {
      if (watchIdRef.current != null && "geolocation" in navigator) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      setDesiredOnline(false); return;
    }
    if (!("geolocation" in navigator)) { setGpsMessage("Não foi possível obter sua localização. Ative o GPS e permita o acesso."); setGpsStatus("unavailable"); setShowTestLocationButton(isDevelopmentEnvironment()); return; }
    if (statusBlock) return;
    setGpsStatus("loading"); setGpsMessage("Obtendo sua localização..."); setShowTestLocationButton(false);
    const onSuccess = (pos: GeolocationPosition) => {
      const rawLat = pos.coords.latitude, rawLng = pos.coords.longitude;
      if (!isBrazilCoordinate(rawLat, rawLng)) {
        if (isDevelopmentEnvironment()) { activateOnlineWithCoords(TEST_DRIVER_LOCATION.lat, TEST_DRIVER_LOCATION.lng, null, null, true); return; }
        setGpsStatus("error"); setGpsMessage("Sua localização não parece estar no Brasil. Ative o GPS real do aparelho e tente novamente."); setShowTestLocationButton(true); return;
      }
      const heading = Number.isFinite(pos.coords.heading as number) ? (pos.coords.heading as number) : null;
      const speed = Number.isFinite(pos.coords.speed as number) ? (pos.coords.speed as number) : null;
      activateOnlineWithCoords(rawLat, rawLng, heading, speed, false);
    };
    const finalFail = (err: GeolocationPositionError) => {
      setGpsStatus(err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "error");
      setGpsMessage("Não foi possível obter sua localização. Verifique se o GPS está ativo e tente novamente."); setShowTestLocationButton(isDevelopmentEnvironment());
    };
    const requestFastLocation = () => navigator.geolocation.getCurrentPosition(onSuccess, (err) => {
      if (err.code === err.PERMISSION_DENIED) { finalFail(err); return; }
      navigator.geolocation.getCurrentPosition(onSuccess, finalFail, { enableHighAccuracy: true, timeout: 30000, maximumAge: 300000 });
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
    const permsApi = (navigator as Navigator & { permissions?: { query: (p: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
    if (permsApi?.query) permsApi.query({ name: "geolocation" as PermissionName }).then((st) => {
      if (st.state === "denied") { setGpsStatus("denied"); setGpsMessage("Localização negada. Ative a permissão do navegador para receber corridas."); setShowTestLocationButton(isDevelopmentEnvironment()); return; }
      requestFastLocation();
    }).catch(requestFastLocation);
    else requestFastLocation();
  }, [online, statusBlock, activateOnlineWithCoords]);

  useEffect(() => {
    if (!userId) return;
    const presentOffer = (r: RideRow) => {
      const candidates: string[] = Array.isArray((r as any).candidate_driver_ids) ? (r as any).candidate_driver_ids : [];
      const rejected: string[] = Array.isArray((r as any).rejected_driver_ids) ? (r as any).rejected_driver_ids : [];
      const acceptedDriverId = (r as any).accepted_driver_id ?? r.driver_id ?? null;
      const isCandidate = candidates.includes(userId as string), didReject = rejected.includes(userId as string), expired = computeOfferCountdown(r) <= 0;
      if (incomingRef.current?.id === r.id) {
        if (acceptedDriverId && acceptedDriverId !== driverId) { removeIncomingRequest(r, "accepted_by_other"); toast.info("Corrida aceita por outro motorista"); return; }
        if (r.status === "cancelada_passageiro") { removeIncomingRequest(r, "passenger_cancelled"); return; }
        if (didReject) { removeIncomingRequest(r, "driver_rejected"); return; }
        if (!isCandidate) { removeIncomingRequest(r, "no_longer_candidate"); return; }
        if (expired) { removeIncomingRequest(r, "expired"); return; }
      }
      if (r.status !== "procurar_motorista" || acceptedDriverId || didReject || !isCandidate || expired || handledRidesRef.current.has(r.id) || ratingRef.current) return;
      const currentRide = activeRef.current;
      if (currentRide && currentRide.status !== "em_viagem") return;
      if (currentRide?.status === "em_viagem" && queuedRideRef.current) return;
      if (incomingRef.current && incomingRef.current.id !== r.id) return;
      setIncoming(r); setCountdown(computeOfferCountdown(r));
      if (navigator.vibrate) navigator.vibrate([280, 120, 280, 120, 280]);
    };
    const applyActive = (r: RideRow) => {
      if (incomingRef.current?.id === r.id) {
        if (r.status === "cancelada_passageiro") { removeIncomingRequest(r, "passenger_cancelled"); return; }
        const acceptedDriverId = (r as any).accepted_driver_id ?? r.driver_id ?? null;
        if (acceptedDriverId && acceptedDriverId !== driverId) { removeIncomingRequest(r, "accepted_by_other"); toast.info("Corrida aceita por outro motorista"); return; }
      }
      if (!driverId || (r.driver_id !== driverId && (r as any).accepted_driver_id !== driverId)) return;
      const queuedAfterRideId = (r as any).queued_after_ride_id as string | null | undefined;
      if (r.status === "procurar_motorista" && queuedAfterRideId && r.driver_id === driverId) { if (incomingRef.current?.id === r.id) setIncoming(null); handledRidesRef.current.add(r.id); setQueuedRide(r); return; }
      if (r.status === "finalizada") {
        setActive(null); setPolyline([]);
        if (ratedRidesRef.current.has(r.id)) { if (ratingRef.current?.id === r.id && !ratingSubmitted) setRatingRide(null); }
        else if (!r.driver_rated_at && !ratingRef.current) { setRatingRide(r); setStars(5); setRatingComment(""); setRatingSubmitted(false); }
        else if (r.driver_rated_at) { ratedRidesRef.current.add(r.id); if (ratingRef.current?.id === r.id && !ratingSubmitted) setRatingRide(null); }
        if (driverId) loadTodayStats(driverId);
      } else if (r.status === "cancelada_passageiro" || r.status === "cancelada_motorista") {
        const wasQueued = queuedRideRef.current?.id === r.id || Boolean((r as any).queued_after_ride_id && r.driver_id === driverId);
        if (wasQueued) { handledRidesRef.current.add(r.id); setIncoming(null); setQueuedRide(null); toast.warning("Próxima corrida cancelada", { description: "A corrida reservada foi cancelada. Sua viagem atual continua normalmente.", duration: 6000 }); return; }
        const wasActive = activeRef.current?.id === r.id || r.driver_id === driverId || (r as any).accepted_driver_id === driverId;
        if (wasActive && r.status === "cancelada_passageiro") {
          const reason = (r.cancellation_reason ?? "").trim();
          toast.warning("Passageiro cancelou a corrida", { description: reason ? `Motivo: ${reason}` : "Você está disponível para novas ofertas.", duration: 7000 });
          if (navigator.vibrate) navigator.vibrate([220, 90, 220, 90, 220]);
          showPush({ title: "APOIS • Corrida cancelada", body: reason ? `Motivo: ${reason}` : "O passageiro cancelou a corrida.", tag: `apois-ride-motorista-cancelada_passageiro-${r.id}`, url: "/motorista/app" });
        }
        handledRidesRef.current.add(r.id); setIncoming(null); setActive(null); setPolyline([]);
      } else if (r.status === "motorista_a_caminho" || r.status === "motorista_chegou" || r.status === "em_viagem") {
        if (incomingRef.current?.id === r.id) setIncoming(null); if (queuedRideRef.current?.id === r.id) setQueuedRide(null); handledRidesRef.current.add(r.id); setActive(r);
      }
    };
    const ch = supabase.channel(`driver-rides-${userId}`).on("postgres_changes", { event: "*", schema: "public", table: "rides" }, (p) => { const row = (p.new ?? p.old) as RideRow; if (!row) return; presentOffer(row); applyActive(row); }).subscribe(async (status) => { if (status === "SUBSCRIBED") await resyncDriverRides(); });
    const resyncDriverRides = async () => {
      const ongoing = await supabase.from("rides").select("*").eq("driver_id", driverId as string).in("status", ["motorista_a_caminho", "motorista_chegou", "em_viagem"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const current = ongoing.data as RideRow | null; if (current) applyActive(current);
      const queued = await (supabase.from("rides") as any).select("*").eq("driver_id", driverId as string).eq("status", "procurar_motorista").not("queued_after_ride_id", "is", null).order("queued_at", { ascending: true }).limit(1).maybeSingle();
      if (queued.data) applyActive(queued.data as RideRow); else setQueuedRide(null);
      const canReceiveNext = !current || (current.status === "em_viagem" && !queued.data); if (!canReceiveNext || ratingRef.current) return;
      const pending = await supabase.from("rides").select("*").contains("candidate_driver_ids", [userId as string]).eq("status", "procurar_motorista").is("driver_id", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (pending.data) presentOffer(pending.data as RideRow);
    };
    const onVisibility = async () => { if (document.visibilityState === "visible") await resyncDriverRides(); };
    document.addEventListener("visibilitychange", onVisibility);
    const onFocus = () => { void onVisibility(); }; window.addEventListener("focus", onFocus); window.addEventListener("online", onFocus);
    const poll = window.setInterval(async () => {
      const cur = activeRef.current; if (cur) { const { data } = await supabase.from("rides").select("*").eq("id", cur.id).maybeSingle(); if (data && (data as RideRow).status !== cur.status) applyActive(data as RideRow); }
      const queued = queuedRideRef.current; if (queued) { const { data } = await supabase.from("rides").select("*").eq("id", queued.id).maybeSingle(); if (data) applyActive(data as RideRow); }
    }, 8000);
    return () => { supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("focus", onFocus); window.removeEventListener("online", onFocus); window.clearInterval(poll); };
  }, [userId, driverId, loadTodayStats]);

  useEffect(() => {
    const pid = incoming?.passenger_id ?? active?.passenger_id ?? ratingRide?.passenger_id;
    if (!pid) { setPassenger(null); return; }
    supabase.from("users").select("name, phone, avatar_url, average_rating, total_ratings").eq("id", pid).maybeSingle().then(({ data }) => setPassenger(data ?? { name: null, phone: null, avatar_url: null, average_rating: 5, total_ratings: 0 }));
  }, [active?.passenger_id, ratingRide?.passenger_id, incoming?.passenger_id]);

  useEffect(() => {
    if (!incoming) return;
    if (countdown <= 0) { removeIncomingRequest(incoming, "expired"); void callReject({ data: { rideId: incoming.id } }).catch((e) => console.error("[APOIS MOTORISTA] erro ao expirar oferta:", e)); return; }
    const t = window.setTimeout(() => setCountdown(computeOfferCountdown(incoming)), 1000); return () => window.clearTimeout(t);
  }, [incoming, countdown, callReject, removeIncomingRequest]);

  async function handleAccept() {
    const offer = incomingRef.current; if (!offer) return;
    try {
      const r = await callAccept({ data: { rideId: offer.id } }); handledRidesRef.current.add(offer.id); setIncoming(null); const accepted = r as RideRow;
      if ((accepted as any).queued_after_ride_id && accepted.status === "procurar_motorista") { setQueuedRide(accepted); toast.success("Próxima corrida reservada", { description: "Finalize a viagem atual. Depois, a rota para o próximo embarque será aberta automaticamente.", duration: 6500 }); }
      else { setActive(accepted); sheetRef.current?.snapTo(34); }
    } catch (e) { handledRidesRef.current.delete(offer.id); setIncoming(offer); setGpsMessage(e instanceof Error ? e.message : "Não foi possível aceitar a corrida. Tente novamente."); }
  }
  async function handleReject() { const offer = incomingRef.current; if (!offer) return; removeIncomingRequest(offer, "driver_rejected"); try { await callReject({ data: { rideId: offer.id } }); } catch (e) { console.error("[APOIS MOTORISTA] erro ao recusar:", e); } }
  async function handleDriverCancelRide(motivo: string) {
    const ride = activeRef.current; if (!ride) return;
    try { await callCancel({ data: { rideId: ride.id, motivo } }); handledRidesRef.current.add(ride.id); setActive(null); setPolyline([]); setEtaSeconds(null); setLegKm(null); toast.success("Corrida cancelada", { description: "Você está disponível para receber outra chamada." }); }
    catch (e) { const msg = e instanceof Error ? e.message : "Não foi possível cancelar a corrida."; toast.error("Falha ao cancelar", { description: msg }); throw e; }
  }

  const positionRef = useRef<typeof position>(null); useEffect(() => { positionRef.current = position; }, [position]);
  const [initialMapCenter, setInitialMapCenter] = useState<LatLng | null>(null);
  useEffect(() => { if (!initialMapCenter && position && isBrazilCoordinate(position.lat, position.lng)) setInitialMapCenter({ lat: position.lat, lng: position.lng }); }, [position, initialMapCenter]);
  const stableMapCenter = useMemo(() => initialMapCenter ?? BRAZIL_CENTER, [initialMapCenter]);
  const stableMapZoom = useMemo(() => (initialMapCenter ? 16 : 13), [initialMapCenter]);
  const autoFollowRef = useRef(true), lastFollowAtRef = useRef(0), lastFitKeyRef = useRef<string | null>(null), lastRouteRequestKeyRef = useRef<string | null>(null), navigationModeKeyRef = useRef<string | null>(null), lastNavigationPositionRef = useRef<LatLng | null>(null), routeFailToastedRef = useRef<string | null>(null);
  const [mapReadyNonce, setMapReadyNonce] = useState(0);
  const inNavigationMode = isNavigationRideStatus(active?.status), activeRouteKey = active ? `${active.id}-${active.status}` : null;
  const activeNavigationDestination = useMemo(() => {
    if (!active) return null;
    if (active.status === "motorista_a_caminho" || active.status === "motorista_chegou") return { lat: active.origin_lat, lng: active.origin_lng };
    if (isNavigationRideStatus(active.status)) return { lat: active.destination_lat, lng: active.destination_lng };
    return null;
  }, [active]);
  const cameraPolyline = activeRouteKey && lastFitKeyRef.current === activeRouteKey ? polyline : EMPTY_ROUTE;

  useEffect(() => { const map = mapRef.current; if (!map) return; const onDragStart = () => { if (!isNavigationRideStatus(activeRef.current?.status)) autoFollowRef.current = false; }; const listener = google.maps.event.addListener(map, "dragstart", onDragStart); return () => { google.maps.event.removeListener(listener); }; }, [initialMapCenter]);
  useEffect(() => {
    if (!position || !mapRef.current || !autoFollowRef.current || !active) return;
    const now = Date.now(); if (now - lastFollowAtRef.current < (inNavigationMode ? 900 : 1500)) return;
    if (inNavigationMode) {
      const previous = lastNavigationPositionRef.current; const movementHeading = previous && haversineKm(previous, position) > 0.006 ? bearingBetween(previous, position) : null;
      lastNavigationPositionRef.current = { lat: position.lat, lng: position.lng }; lastFollowAtRef.current = now;
      applyNavigationCamera(mapRef.current, { ...position, heading: normalizeHeading(position.heading) ?? movementHeading }, cameraPolyline, activeNavigationDestination); return;
    }
    const center = mapRef.current.getCenter(); if (center && haversineKm({ lat: center.lat(), lng: center.lng() }, position) < 0.015) return;
    lastFollowAtRef.current = now; mapRef.current.panTo(position);
  }, [position?.lat, position?.lng, position?.heading, active?.id, active?.status, polyline, activeNavigationDestination, inNavigationMode]);
  useEffect(() => {
    const map = mapRef.current; if (!map) return; const navMap = map as google.maps.Map & { setHeading?: (heading: number) => void; setTilt?: (tilt: number) => void };
    if (!inNavigationMode) { navigationModeKeyRef.current = null; lastNavigationPositionRef.current = null; navMap.setHeading?.(0); navMap.setTilt?.(0); return; }
    if (!position) return; const navKey = `${active?.id ?? "ride"}-${active?.status ?? "status"}`; if (navigationModeKeyRef.current === navKey) return;
    navigationModeKeyRef.current = navKey; autoFollowRef.current = true; lastFollowAtRef.current = Date.now(); lastNavigationPositionRef.current = { lat: position.lat, lng: position.lng }; applyNavigationCamera(map, position, cameraPolyline, activeNavigationDestination, true);
  }, [inNavigationMode, active?.id, active?.status, position, cameraPolyline, activeNavigationDestination]);

  useEffect(() => {
    if (!active) { setPolyline([]); setEtaSeconds(null); setLegKm(null); lastFitKeyRef.current = null; lastRouteRequestKeyRef.current = null; return; }
    const pos = position; if (!pos) return;
    const toPickup = active.status === "motorista_a_caminho" || active.status === "motorista_chegou";
    const dest = toPickup ? { lat: active.origin_lat, lng: active.origin_lng } : isNavigationRideStatus(active.status) ? { lat: active.destination_lat, lng: active.destination_lng } : null;
    if (!dest) { setPolyline([]); return; }
    const fitKey = `${active.id}-${active.status}`, routeRequestKey = fitKey;
    const focusRoute = (points: LatLng[]) => {
      const map = mapRef.current; if (!map) return; lastFitKeyRef.current = fitKey;
      if (isNavigationRideStatus(active.status)) { autoFollowRef.current = true; lastFollowAtRef.current = Date.now(); lastNavigationPositionRef.current = { lat: pos.lat, lng: pos.lng }; applyNavigationCamera(map, pos, points, dest, true); return; }
      autoFollowRef.current = false; const b = new google.maps.LatLngBounds(); b.extend(pos); b.extend(dest); points.forEach((p) => b.extend(p)); map.fitBounds(b, { top: 110, bottom: Math.round(window.innerHeight * 0.62), left: 56, right: 56 }); window.setTimeout(() => { autoFollowRef.current = true; }, 1200);
    };
    if (lastRouteRequestKeyRef.current === routeRequestKey) { if (polyline.length > 0 && lastFitKeyRef.current !== fitKey) focusRoute(polyline); return; }
    lastRouteRequestKeyRef.current = routeRequestKey; if (lastFitKeyRef.current !== fitKey) setPolyline([]); let cancelled = false;
    callRoute({ data: { origin: pos, destination: dest } }).then((res) => {
      if (cancelled) return; const points = decodePolyline(res.encodedPolyline); setPolyline(points); setEtaSeconds(res.durationSeconds); setLegKm(res.distanceMeters / 1000);
      setRouteSteps((res.steps ?? []).map((s: DriverRouteStep) => ({ lat: s.lat, lng: s.lng, distanceMeters: s.distanceMeters, instruction: s.instruction, maneuver: s.maneuver ?? undefined })));
      resetSpokenCache(); if (routeFailToastedRef.current === fitKey) routeFailToastedRef.current = null; focusRoute(points);
    }).catch(() => {
      if (cancelled) return; const fallback = [pos, dest]; setPolyline(fallback); setRouteSteps([]); const km = haversineKm(pos, dest); setLegKm(km); setEtaSeconds(Math.round((km / 35) * 3600)); focusRoute(fallback);
      if (routeFailToastedRef.current !== fitKey) { routeFailToastedRef.current = fitKey; toast.message("Não foi possível traçar a rota agora. Use navegação externa."); }
    });
    return () => { cancelled = true; };
  }, [active?.id, active?.status, position?.lat, position?.lng, mapReadyNonce]);

  useEffect(() => { void primeVoice(); }, []);
  useEffect(() => { if (active && position && routeSteps.length > 0 && (active.status === "motorista_a_caminho" || active.status === "em_viagem")) tickNavigation({ lat: position.lat, lng: position.lng }, routeSteps, active.id); }, [position?.lat, position?.lng, routeSteps, active?.id, active?.status]);
  useEffect(() => {
    if (!active || !position) return;
    if (active.status === "motorista_a_caminho" && haversineKm(position, { lat: active.origin_lat, lng: active.origin_lng }) <= 0.05) void speak("Você chegou ao ponto de embarque.", { dedupKey: `${active.id}:pickup-arrival` });
    else if (active.status === "em_viagem" && haversineKm(position, { lat: active.destination_lat, lng: active.destination_lng }) <= 0.05) void speak("Você chegou ao destino final.", { dedupKey: `${active.id}:destination-arrival` });
  }, [position?.lat, position?.lng, active?.id, active?.status]);
  const lastSpokenStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active) { lastSpokenStatusRef.current = null; return; }
    const key = `${active.id}:${active.status}`; if (lastSpokenStatusRef.current === key) return; lastSpokenStatusRef.current = key; resetSpokenCache();
    const t = setTimeout(() => {
      if (active.status === "motorista_a_caminho") void speak("Corrida aceita. Siga até o ponto de embarque.", { interrupt: true });
      else if (active.status === "em_viagem") void speak("Viagem iniciada. Boa viagem.", { interrupt: true });
      else if (active.status === "finalizada") void speak("Corrida finalizada.", { interrupt: true });
    }, 180);
    return () => clearTimeout(t);
  }, [active?.id, active?.status]);

  function recenter() { autoFollowRef.current = true; lastFollowAtRef.current = 0; const pos = positionRef.current; if (pos && mapRef.current) { if (inNavigationMode) applyNavigationCamera(mapRef.current, pos, cameraPolyline, activeNavigationDestination, true); else smoothPanZoom(mapRef.current, pos, 16, 650); } }
  async function submitRating() {
    if (!ratingRide || submittingRating || ratingSubmitted) return;
    if (ratedRidesRef.current.has(ratingRide.id)) { setRatingSubmitted(true); return; }
    setSubmittingRating(true); setRatingError(null);
    try { await callRate({ data: { rideId: ratingRide.id, stars, comment: ratingComment || null } }); ratedRidesRef.current.add(ratingRide.id); setRatingSubmitted(true); }
    catch (e) { const msg = (e as Error)?.message ?? "Falha ao enviar avaliação."; setRatingError(msg); }
    finally { setSubmittingRating(false); }
  }
  function dismissRating() { setRatingRide(null); setRatingSubmitted(false); setRatingError(null); setRatingComment(""); setStars(5); }
  function skipRating() { if (ratingRide) ratedRidesRef.current.add(ratingRide.id); dismissRating(); }

  const phase = active?.status;
  const hasRideUI = !!active || !!incoming || !!ratingRide;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0">
        <MovviMap center={stableMapCenter} zoom={stableMapZoom} height="100%" themeOverride="dark" onLoad={(m) => { mapRef.current = m; setMapReadyNonce((n) => n + 1); if (inNavigationMode && position) { autoFollowRef.current = true; navigationModeKeyRef.current = `${active?.id ?? "ride"}-${active?.status ?? "status"}`; lastNavigationPositionRef.current = { lat: position.lat, lng: position.lng }; applyNavigationCamera(m, position, polyline, activeNavigationDestination, true); } }}>
          {position && <InterpolatedDriverMarker position={position} heading={position.heading ?? 0} color={online ? "#F6BE1C" : "#94a3b8"} />}
          {active && <><PlacePinMarker position={{ lat: active.origin_lat, lng: active.origin_lng }} color="#F6BE1C" zIndexBase={9990} /><PlacePinMarker position={{ lat: active.destination_lat, lng: active.destination_lng }} color="#ef4444" zIndexBase={9992} /></>}
          {polyline.length > 0 && <><Polyline path={polyline} options={{ strokeColor: "#000000", strokeOpacity: 0.12, strokeWeight: 20, geodesic: true, zIndex: 1 }} /><Polyline path={polyline} options={{ strokeColor: "#ffffff", strokeOpacity: 0.95, strokeWeight: 14, geodesic: true, zIndex: 2 }} /><Polyline path={polyline} options={{ strokeColor: "#F6BE1C", strokeOpacity: 1, strokeWeight: 9, geodesic: true, zIndex: 3 }} /></>}
        </MovviMap>
      </div>
      {!active && <div className="absolute inset-x-0 top-0 z-40 px-3 pt-[calc(env(safe-area-inset-top)+8px)]"><div className="mx-auto flex h-[52px] max-w-5xl items-center gap-3 rounded-[20px] px-3" style={{ background: "color-mix(in oklab, #0b0d10 68%, transparent)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(8px) saturate(140%)" }}><button onClick={() => setSideMenuOpen(true)} aria-label="Abrir menu" className="press-scale inline-flex h-10 w-10 items-center justify-center rounded-full"><Menu className="h-[18px] w-[18px]" /></button><div className="min-w-0 flex-1"><div className="truncate text-[11px] text-muted-foreground">{greetingForNow()},</div><div className="truncate text-[15px] font-bold">{driverName || "Motorista"}</div></div><button onClick={handleLogout} aria-label="Sair" className="press-scale inline-flex h-10 w-10 items-center justify-center rounded-full"><LogOut className="h-[16px] w-[16px]" /></button></div></div>}
      <DriverSideMenu open={sideMenuOpen} onOpenChange={setSideMenuOpen} onLogout={handleLogout} />
      {statusBlock && !hasRideUI && <div className="absolute left-1/2 top-24 z-20 -translate-x-1/2 max-w-xs rounded-2xl bg-card/95 px-4 py-3 text-center shadow-2xl ring-1 ring-border"><div className="flex items-center justify-center gap-2 text-yellow-400"><AlertTriangle className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Mensalidade</span></div><p className="mt-1 text-xs text-muted-foreground">{statusBlock}</p><button onClick={() => navigate({ to: "/motorista/assinatura" })} className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Pagar mensalidade</button></div>}
      {!incoming && !ratingRide && (() => { const bottomOffset = isNavigationRideStatus(active?.status) ? "calc(env(safe-area-inset-bottom) + 148px)" : active ? "calc(78dvh + 12px)" : "calc(env(safe-area-inset-bottom) + 260px)"; return <button onClick={recenter} aria-label="Centralizar mapa" className="press-scale absolute z-30 flex h-12 w-12 items-center justify-center rounded-full" style={{ right: 20, bottom: bottomOffset, background: "color-mix(in oklab, #111418 72%, transparent)", border: "1px solid rgba(255,255,255,0.10)" }}><Crosshair className="h-[18px] w-[18px]" /></button>; })()}
      {!incoming && !ratingRide && active && active.status === "motorista_a_caminho" && <PickupNavOverlay ride={active} passenger={passenger} etaSeconds={etaSeconds} legKm={legKm} onOpenProfile={() => active.passenger_id && setProfilePassengerId(active.passenger_id)} onArrive={async () => { resetSpokenCache(); void speak("Você chegou ao ponto de embarque. Aguarde o passageiro.", { interrupt: true }); await callArrive({ data: { rideId: active.id } }); setActive((prev) => (prev && prev.id === active.id ? { ...prev, status: "motorista_chegou" } : prev)); }} onCancel={async () => { await handleDriverCancelRide("Cancelado pelo motorista"); }} />}
      {!incoming && !ratingRide && active && active.status === "em_viagem" && <ActiveTripNavOverlay ride={active} passenger={passenger} etaSeconds={etaSeconds} legKm={legKm} onOpenProfile={() => active.passenger_id && setProfilePassengerId(active.passenger_id)} onComplete={async () => { await callComplete({ data: { rideId: active.id } }); }} />}
      {!incoming && !ratingRide && active && active.status !== "motorista_a_caminho" && active.status !== "em_viagem" && <MovviSheet ref={sheetRef} snaps={[58, 78, 92]} initial={70}><ActiveRidePanel ride={active} passenger={passenger} etaSeconds={etaSeconds} legKm={legKm} onOpenProfile={() => active.passenger_id && setProfilePassengerId(active.passenger_id)} onArrive={async () => { await callArrive({ data: { rideId: active.id } }); }} onStart={async (code) => { await callStart({ data: { rideId: active.id, safety_code: code } }); setActive((prev) => (prev && prev.id === active.id ? { ...prev, status: "em_viagem" } : prev)); }} onComplete={async () => { await callComplete({ data: { rideId: active.id } }); }} onCancel={handleDriverCancelRide} /></MovviSheet>}
      {!incoming && !ratingRide && !active && <IdleBottomPanel driverName={driverName} online={online} disabled={!!statusBlock || gpsStatus === "loading"} toggleOnline={toggleOnline} stats={todayStats} gpsMessage={gpsMessage} loading={gpsStatus === "loading"} canUseTestLocation={!online && isDevelopmentEnvironment() && showTestLocationButton && (gpsStatus === "error" || gpsStatus === "denied" || gpsStatus === "timeout" || gpsStatus === "unavailable")} onUseTestLocation={ativarLocalizacaoTesteBrasil} />}
      {incoming && <IncomingOffer ride={incoming} passenger={passenger} countdown={countdown} driverPos={position} onAccept={handleAccept} onReject={handleReject} onOpenProfile={() => incoming.passenger_id && setProfilePassengerId(incoming.passenger_id)} />}
      <PassengerProfessionalProfileDialog open={profilePassengerId !== null} onOpenChange={(v) => { if (!v) setProfilePassengerId(null); }} passengerUserId={profilePassengerId} />
      {queuedRide && active?.status === "em_viagem" && !incoming && <div className="fixed left-4 right-4 z-[45] mx-auto max-w-md rounded-[18px] border border-[#F6BE1C]/25 bg-[#0D0F11]/94 px-4 py-3" style={{ top: "calc(env(safe-area-inset-top) + 134px)" }}><div className="flex items-center justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[0.17em] text-[#F6BE1C]">Próxima corrida reservada</p><p className="mt-1 truncate text-[12px] font-bold text-white">{queuedRide.pickup_label || queuedRide.origin_name}</p></div><p className="text-[14px] font-black text-[#F6BE1C]">{formatBRL(Number(queuedRide.estimated_price ?? 0))}</p></div></div>}
      {ratingRide && <RatingScreen ride={ratingRide} passenger={passenger} stars={stars} setStars={setStars} comment={ratingComment} setComment={setRatingComment} submitting={submittingRating} submitted={ratingSubmitted} errorMessage={ratingError} onSubmit={submitRating} onDismiss={dismissRating} onSkip={skipRating} />}
      <DriverVoiceToggle visible={!!active && (active.status === "motorista_a_caminho" || active.status === "em_viagem")} />
      <ApoisDriverBottomNav hidden={!!ratingRide} />
    </div>
  );
}

function greetingForNow(): string { const h = new Date().getHours(); if (h < 5) return "Boa madrugada"; if (h < 12) return "Bom dia"; if (h < 18) return "Boa tarde"; return "Boa noite"; }

function IdleBottomPanel({ driverName, online, disabled, toggleOnline, stats, gpsMessage, loading, canUseTestLocation, onUseTestLocation }: { driverName: string; online: boolean; disabled: boolean; toggleOnline: () => void; stats: { rides: number; earnings: number }; gpsMessage: string | null; loading: boolean; canUseTestLocation: boolean; onUseTestLocation: () => void }) {
  const navReserve = "calc(env(safe-area-inset-bottom) + 76px)"; const firstName = (driverName || "").trim().split(/\s+/)[0] || "Motorista";
  return <div className="absolute inset-x-0 z-30 rounded-t-[28px] text-foreground" style={{ bottom: navReserve, background: "#111418", borderTop: "1px solid rgba(255,255,255,0.06)" }}><div className="mx-auto mt-2.5 h-[4px] w-10 rounded-full bg-white/10" /><div className="flex flex-col gap-3 px-6 pb-5 pt-3"><div className="flex items-center justify-between gap-3"><div><div className="truncate text-[15px] font-bold">Olá, {firstName}</div><div className="text-[12px] text-muted-foreground">{online ? "Recebendo solicitações" : "Toque para ativar"}</div></div><div className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase ${online ? "bg-primary/12 text-primary" : "bg-white/5 text-muted-foreground"}`}>{online ? "Online" : "Offline"}</div></div><div className="grid grid-cols-2 gap-2.5"><StatMini label="Corridas hoje" value={stats.rides.toString()} /><StatMini label="Ganhos hoje" value={formatBRL(stats.earnings || 0)} /></div>{gpsMessage && <div className="rounded-xl px-3 py-2 text-[12px] text-destructive">{gpsMessage}</div>}{canUseTestLocation && <button type="button" onClick={onUseTestLocation} className="press-scale w-full rounded-xl px-3 py-2 text-[11px] font-semibold uppercase text-primary">Usar localização de teste no Brasil</button>}<button type="button" disabled={disabled} onClick={toggleOnline} className={`press-scale w-full h-14 rounded-[18px] text-[15px] font-semibold ${online ? "text-foreground" : "bg-primary text-primary-foreground"}`}>{loading ? "Obtendo localização..." : online ? "Ficar offline" : "Ficar online"}</button></div></div>;
}
function StatMini({ label, value }: { label: string; value: string }) { return <div className="flex flex-col gap-1 rounded-2xl px-3.5 py-2.5" style={{ background: "#0e1114", border: "1px solid rgba(255,255,255,0.06)" }}><span className="text-[11px] uppercase text-muted-foreground">{label}</span><span className="text-[20px] font-bold">{value}</span></div>; }

function IncomingOffer({ ride, passenger, countdown, driverPos, onAccept, onReject, onOpenProfile }: { ride: RideRow; passenger: Passenger | null; countdown: number; driverPos: LatLng | null; onAccept: () => void; onReject: () => void; onOpenProfile?: () => void }) {
  const pct = (countdown / RIDE_OFFER_TIMEOUT_SECONDS) * 100;
  const pickupKm = useMemo(() => !driverPos || ride.origin_lat == null || ride.origin_lng == null ? null : haversineKm(driverPos, { lat: ride.origin_lat, lng: ride.origin_lng }), [driverPos, ride.origin_lat, ride.origin_lng]);
  const pickupMin = pickupKm != null ? Math.max(1, Math.round((pickupKm / 32) * 60)) : null; const tripKm = ride.distance_km != null ? Number(ride.distance_km) : null; const totalKm = pickupKm != null && tripKm != null ? pickupKm + tripKm : null;
  const cat = RIDE_CATEGORIES.find((c) => c.key === ride.category), CatIcon = cat?.icon ?? RouteIcon, catLabel = cat?.label?.toUpperCase() ?? "CORRIDA";
  const score = useMemo(() => { const km = Number(ride.distance_km ?? 0), pk = pickupKm ?? 0; if (pk >= 4) return { label: "Embarque distante", tone: "text-sky-400", dot: "bg-sky-400", bg: "bg-sky-400/10", border: "border-sky-400/25" }; if (km >= 10) return { label: "Corrida excelente", tone: "text-primary", dot: "bg-primary", bg: "bg-primary/12", border: "border-primary/30" }; if (km >= 5) return { label: "Ótima corrida", tone: "text-primary", dot: "bg-primary", bg: "bg-primary/10", border: "border-primary/25" }; return { label: km > 0 ? "Boa corrida" : "Corrida disponível", tone: "text-primary", dot: "bg-primary", bg: "bg-primary/10", border: "border-primary/25" }; }, [ride.distance_km, pickupKm]);
  const ratingText = passengerRatingText(passenger, 2);
  useEffect(() => { startRideRingtone(); void speak("Nova corrida", { interrupt: true }); return () => { stopRideRingtone(); }; }, []);
  return <div className="fixed inset-x-0 top-0 z-50 flex items-end justify-center bg-black/40" style={{ bottom: "calc(env(safe-area-inset-bottom) + 68px)" }} role="dialog" aria-modal="true"><div className="relative flex w-full max-w-md flex-col rounded-t-[28px] border border-border bg-card" style={{ maxHeight: "min(94dvh, 680px)" }}><div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4"><div className="flex items-start justify-between gap-3"><div className={`inline-flex items-center gap-1.5 rounded-full border ${score.border} ${score.bg} px-3 py-1 text-[11px] font-semibold ${score.tone}`}><span className={`h-1.5 w-1.5 rounded-full ${score.dot}`} />{score.label}</div><CountdownRing seconds={countdown} pct={pct} /></div><div className="mt-2 text-center"><div className="text-[30px] font-extrabold">{ride.estimated_price != null ? formatBRL(Number(ride.estimated_price)) : "—"}</div><div className="text-[11px] text-muted-foreground">Ganho da corrida</div></div><div className="mt-3 grid grid-cols-4 gap-2"><InfoCard icon={<Clock className="h-[14px] w-[14px]" />} value={pickupMin != null ? `${pickupMin} min` : "—"} label="Até coleta" /><InfoCard icon={<MapPin className="h-[14px] w-[14px]" />} value={pickupKm != null ? `${pickupKm.toFixed(1)} km` : "—"} label="Embarque" /><InfoCard icon={<RouteIcon className="h-[14px] w-[14px]" />} value={ride.distance_km != null ? `${Number(ride.distance_km).toFixed(1)} km` : "—"} label="Corrida" /><InfoCard icon={<CatIcon className="h-[14px] w-[14px]" />} value={catLabel} label="Categoria" compactValue /></div><button type="button" onClick={onOpenProfile} className="mt-2.5 flex w-full items-center gap-3 rounded-2xl border border-border px-3 py-2 text-left"><Avatar src={passenger?.avatar_url ?? null} name={passenger?.name ?? "Passageiro"} size={34} /><div className="flex-1"><div className="text-[14px] font-semibold">{passenger?.name ?? "Passageiro"}</div><div className="text-[12px] text-muted-foreground"><Star className="inline h-3 w-3 fill-amber-400 text-amber-400" /> {ratingText}</div></div></button><div className="mt-2.5 rounded-2xl border border-border px-4 py-3"><AddressRow dotColor="bg-primary" label="Embarque" name={ride.pickup_label || ride.origin_name} /><div className="my-2 h-px bg-border" /><AddressRow dotColor="bg-destructive" label="Destino" name={ride.destination_name} /></div><div className="mt-2.5 grid grid-cols-2 gap-2"><div className="rounded-2xl border border-[#F6BE1C]/20 px-3 py-2"><span className="block text-[9px] uppercase text-[#F6BE1C]">Km total</span><span className="text-[13px] font-black">{totalKm != null ? `${totalKm.toFixed(1)} km` : "—"}</span></div><div className="rounded-2xl border border-border px-3 py-2 text-right"><span className="block text-[9px] uppercase text-muted-foreground">Pagamento</span><span className="text-[12px] font-semibold">{paymentLabelFor(ride.payment_method)}</span></div></div></div><div className="shrink-0 border-t border-white/5 bg-[#08090A] px-4 py-3"><div className="grid grid-cols-2 gap-3"><DSButton variant="outline" size="lg" onClick={onReject}>Recusar</DSButton><DSButton size="lg" onClick={onAccept}>Aceitar corrida</DSButton></div></div></div></div>;
}
function InfoCard({ icon, value, label, compactValue }: { icon: ReactNode; value: string; label: string; compactValue?: boolean }) { return <div className="flex min-w-0 flex-col items-center gap-1 rounded-2xl border border-border px-1.5 py-2.5"><div>{icon}</div><div className={compactValue ? "text-[11px] font-bold" : "text-[14px] font-bold"}>{value}</div><div className="text-[10px] text-muted-foreground">{label}</div></div>; }
function AddressRow({ dotColor, label, name }: { dotColor: string; label: string; name: string | null | undefined }) { return <div className="flex items-start gap-3"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${dotColor}`} /><div><div className="text-[13px] text-muted-foreground">{label}</div><div className="text-[15px] font-semibold">{(name && name.trim()) || "Endereço não identificado"}</div></div></div>; }
function CountdownRing({ seconds, pct }: { seconds: number; pct: number }) { const r = 18, c = 2 * Math.PI * r; return <div className="relative h-12 w-12"><svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90"><circle cx="22" cy="22" r={r} stroke="hsl(var(--border))" strokeWidth="3" fill="none" /><circle cx="22" cy="22" r={r} stroke="#F6BE1C" strokeWidth="3" fill="none" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} /></svg><span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-primary">{seconds}</span></div>; }
function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) { return <div className={`rounded-xl px-2.5 py-2 text-center ${highlight ? "bg-primary/10" : "bg-background/55"}`}><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className={`text-[14px] font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div></div>; }

function ActiveRidePanel({ ride, passenger, etaSeconds, legKm, onArrive, onStart, onComplete, onCancel, onOpenProfile }: { ride: RideRow; passenger: Passenger | null; etaSeconds: number | null; legKm: number | null; onArrive: () => Promise<void> | void; onStart: (code: string) => Promise<void> | void; onComplete: () => Promise<void> | void; onCancel: (motivo: string) => Promise<void> | void; onOpenProfile?: () => void }) {
  const [pinOpen, setPinOpen] = useState(false), [pinCode, setPinCode] = useState(""), [pinError, setPinError] = useState<string | null>(null), [pinBusy, setPinBusy] = useState(false), [cancelOpen, setCancelOpen] = useState(false), [cancelBusy, setCancelBusy] = useState(false), [cancelReason, setCancelReason] = useState("Passageiro não apareceu");
  const cancelReasons = ["Passageiro não apareceu", "Passageiro pediu para cancelar", "Problema no ponto de embarque", "Não consigo atender esta corrida"];
  async function submitCancelRide() { if (cancelBusy) return; setCancelBusy(true); try { await onCancel(cancelReason.trim() || "Cancelada pelo motorista"); setCancelOpen(false); } finally { setCancelBusy(false); } }
  async function submitPin() { if (pinBusy) return; if (!/^\d{4}$/.test(pinCode)) { setPinError("Digite os 4 dígitos do código."); return; } setPinBusy(true); setPinError(null); try { await onStart(pinCode); setPinOpen(false); setPinCode(""); } catch (e) { const msg = (e as Error)?.message ?? ""; setPinError(/[Cc]ódigo incorreto/.test(msg) ? "Código incorreto. Peça o código ao passageiro e tente novamente." : msg || "Não foi possível iniciar a corrida."); } finally { setPinBusy(false); } }
  const phase = ride.status, toPickup = phase === "motorista_a_caminho" || phase === "motorista_chegou";
  const header = useMemo(() => phase === "motorista_a_caminho" ? { title: "A caminho do passageiro", tone: "text-primary", dot: "bg-primary" } : phase === "motorista_chegou" ? { title: "Aguardando passageiro", tone: "text-primary", dot: "bg-primary" } : { title: phase === "em_viagem" ? "Em viagem" : "", tone: "text-primary", dot: "bg-primary" }, [phase]);
  const minutes = etaSeconds != null ? Math.max(1, Math.round(etaSeconds / 60)) : null;
  const cancelRideDialog = cancelOpen ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-t-[28px] bg-card p-5"><h3 className="text-[22px] font-extrabold">Informe o motivo</h3><div className="mt-4 grid gap-2">{cancelReasons.map((reason) => <button key={reason} type="button" onClick={() => setCancelReason(reason)} className="rounded-2xl px-4 py-3 text-left ring-1 ring-border">{reason}</button>)}</div><div className="mt-5 grid grid-cols-2 gap-2"><DSButton variant="outline" onClick={() => setCancelOpen(false)}>Voltar</DSButton><DSButton disabled={cancelBusy} onClick={submitCancelRide}>{cancelBusy ? "Cancelando…" : "Confirmar cancelamento"}</DSButton></div></div></div> : null;
  if (phase === "motorista_a_caminho") return <><div className="flex flex-col gap-4 pt-1"><div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase text-primary">A caminho do passageiro</span><button onClick={() => setCancelOpen(true)}><X className="h-4 w-4" /></button></div><div className="text-center"><div className="text-[28px] font-extrabold">{minutes != null ? `${minutes} min` : "—"}</div></div><button onClick={onOpenProfile} className="flex items-center gap-3 rounded-[20px] p-3 ring-1 ring-border"><Avatar src={passenger?.avatar_url ?? null} name={passenger?.name ?? "Passageiro"} size={52} /><div className="text-[20px] font-bold">{passenger?.name ?? "Passageiro"}</div></button><div className="rounded-[20px] p-3 ring-1 ring-border"><AddressRow dotColor="bg-primary" label="Embarque" name={ride.pickup_label || ride.origin_name} /><div className="my-2 h-px bg-border" /><AddressRow dotColor="bg-destructive" label="Destino" name={ride.destination_name} /></div><DSButton size="lg" onClick={() => onArrive()}>Cheguei no embarque</DSButton><SafetyCard role="driver" rideId={ride.id} counterpartLabel={`Passageiro ${passenger?.name ?? ""}`.trim()} shareInput={{ role: "driver", status: ride.status, passengerName: passenger?.name ?? null, originName: ride.pickup_label ?? ride.origin_name ?? null, destinationName: ride.destination_name }} />{cancelRideDialog}</div></>;
  if (phase === "em_viagem") return <div className="flex flex-col gap-4 pt-1"><div className="text-center"><div className="text-[30px] font-extrabold">{minutes != null ? `${minutes} min` : "—"}</div><div className="text-[12px] text-muted-foreground">{legKm != null ? `${legKm.toFixed(1)} km restantes` : ""}</div></div><button onClick={onOpenProfile} className="flex items-center gap-3 rounded-[20px] p-3 ring-1 ring-border"><Avatar src={passenger?.avatar_url ?? null} name={passenger?.name ?? "Passageiro"} size={52} /><div className="text-[20px] font-bold">{passenger?.name ?? "Passageiro"}</div></button><AddressRow dotColor="bg-destructive" label="Destino" name={ride.destination_name} /><DSButton onClick={onComplete} size="lg">Finalizar corrida</DSButton><SafetyCard role="driver" rideId={ride.id} counterpartLabel={`Passageiro ${passenger?.name ?? ""}`.trim()} shareInput={{ role: "driver", status: ride.status, passengerName: passenger?.name ?? null, originName: ride.pickup_label ?? ride.origin_name ?? null, destinationName: ride.destination_name }} /></div>;
  const isArrived = phase === "motorista_chegou";
  return <div className="flex flex-col gap-2.5 pt-1"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${header.dot}`} /><span className={`text-[11px] font-bold uppercase ${header.tone}`}>{header.title}</span></div>{!isArrived && (minutes != null || legKm != null) && <div className="grid grid-cols-2 gap-2"><Metric label="ETA" value={minutes != null ? `${minutes} min` : "—"} highlight /><Metric label="Distância" value={legKm != null ? `${legKm.toFixed(1)} km` : "—"} /></div>}<button onClick={onOpenProfile} className="flex items-center gap-2 rounded-2xl p-2 ring-1 ring-border"><Avatar src={passenger?.avatar_url ?? null} name={passenger?.name ?? "Passageiro"} size={44} /><div className="text-[14px] font-semibold">{passenger?.name ?? "Passageiro"}</div></button><div className="rounded-2xl p-2.5 ring-1 ring-border"><AddressRow dotColor="bg-primary" label="Embarque" name={ride.pickup_short_label || ride.pickup_label || ride.origin_name} /><AddressRow dotColor="bg-destructive" label="Destino" name={ride.destination_name} /></div>{isArrived && <div className="space-y-2"><ActionButton label="Iniciar corrida" onClick={() => { setPinError(null); setPinCode(""); setPinOpen(true); }} icon={ChevronRight} emphasize /><button type="button" onClick={() => setCancelOpen(true)} className="w-full rounded-2xl bg-destructive/10 px-4 py-2 text-destructive">Passageiro não apareceu</button></div>}{cancelRideDialog}{pinOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75"><div className="w-full max-w-md rounded-t-[28px] bg-card p-5"><h3 className="text-center text-[22px] font-extrabold">Peça o PIN ao passageiro</h3><input autoFocus inputMode="numeric" maxLength={4} value={pinCode} onChange={(e) => { setPinCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(null); }} className="mt-5 w-full rounded-[22px] p-5 text-center text-[40px] font-black tracking-[0.55em]" />{pinError && <div className="mt-3 text-destructive">{pinError}</div>}<div className="mt-4 grid grid-cols-2 gap-2"><DSButton variant="outline" onClick={() => setPinOpen(false)}>Cancelar</DSButton><DSButton onClick={submitPin} disabled={pinBusy || pinCode.length !== 4}>{pinBusy ? "Validando…" : "Iniciar viagem"}</DSButton></div></div></div>}</div>;
}

function ActionButton({ label, onClick, icon: Icon, emphasize = false }: { label: string; onClick: () => void | Promise<void>; icon: React.ComponentType<{ className?: string }>; variant?: "primary" | "success"; emphasize?: boolean }) { const [busy, setBusy] = useState(false); return <button disabled={busy} onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }} className={`press-scale relative mt-1 flex w-full items-center justify-center gap-2 rounded-2xl min-h-14 py-4 text-[14px] font-bold uppercase bg-primary text-primary-foreground ${emphasize ? "ring-2 ring-primary/40" : ""}`}><Icon className="h-[17px] w-[17px]" />{busy ? "…" : label}</button>; }

function RatingScreen({ ride, passenger, stars, setStars, comment, setComment, submitting, submitted, errorMessage, onSubmit, onDismiss, onSkip }: { ride: RideRow; passenger: Passenger | null; stars: number; setStars: (n: number) => void; comment: string; setComment: (s: string) => void; submitting: boolean; submitted: boolean; errorMessage: string | null; onSubmit: () => void; onDismiss: () => void; onSkip: () => void }) {
  const total = Number(ride.final_price ?? ride.estimated_price ?? 0), paymentLabel = paymentLabelFor(ride.payment_method), distanceLabel = ride.distance_km ? `${Number(ride.distance_km).toFixed(1)} km` : "—", durationLabel = ride.duration_min ? `${Math.round(Number(ride.duration_min))} min` : "—";
  const category = RIDE_CATEGORIES.find((c) => c.key === ride.category), CatIcon = category?.icon ?? RIDE_CATEGORIES[0].icon, pickupLabel = ride.pickup_short_label || ride.pickup_label || ride.origin_name || "—", destinationLabel = ride.destination_name || "—";
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"><div className="w-full max-w-md rounded-t-[28px] bg-card p-5"><div className="flex flex-col items-center text-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary"><CheckCircle2 className="h-8 w-8" /></div><h2 className="mt-4 text-[26px] font-bold">Corrida concluída</h2></div>{submitted ? <><div className="mt-5 rounded-[24px] p-5 text-center ring-1 ring-border"><div className="text-[13px] text-muted-foreground">Ganhos da corrida</div><div className="text-[36px] font-bold text-primary">{formatBRL(total)}</div><div className="mt-2"><Banknote className="inline h-3 w-3" /> {paymentLabel}</div></div><DSButton onClick={onDismiss} size="lg" className="mt-5 w-full">Concluir</DSButton></> : <><div className="mt-5 rounded-[24px] p-5 text-center ring-1 ring-border"><div className="text-[13px] text-muted-foreground">Ganhos da corrida</div><div className="text-[36px] font-bold text-primary">{formatBRL(total)}</div></div><div className="mt-3 rounded-[20px] p-3.5 ring-1 ring-border"><div className="grid grid-cols-2 gap-3"><SummaryRow icon={<RouteIcon className="h-3.5 w-3.5" />} label="Distância" value={distanceLabel} /><SummaryRow icon={<Clock className="h-3.5 w-3.5" />} label="Duração" value={durationLabel} /></div><div className="mt-3"><AddressRow dotColor="bg-primary" label="Embarque" name={pickupLabel} /><AddressRow dotColor="bg-destructive" label="Destino" name={destinationLabel} /></div></div><div className="mt-3 rounded-[20px] p-4 ring-1 ring-border"><div className="flex items-center gap-3"><Avatar src={passenger?.avatar_url ?? null} name={passenger?.name ?? "Passageiro"} size={48} /><div><div className="text-[16px] font-semibold">{passenger?.name ?? "Passageiro"}</div><div className="text-[12px] text-muted-foreground"><CatIcon className="inline h-3 w-3" /> APOIS {(category?.label ?? "CAR").toUpperCase()}</div></div></div><div className="mt-3 flex justify-center gap-1">{[1,2,3,4,5].map((n) => <button key={n} onClick={() => setStars(n)}><Star className={`h-8 w-8 ${n <= stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/35"}`} /></button>)}</div><textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentário (opcional)" className="mt-2.5 w-full rounded-[14px] p-2.5 ring-1 ring-border" rows={2} /></div>{errorMessage && <div className="mt-3 text-destructive">{errorMessage}</div>}<DSButton disabled={submitting} onClick={onSubmit} size="lg" className="mt-4 w-full">{submitting ? "Enviando…" : errorMessage ? "Tentar novamente" : "Concluir"}</DSButton><DSButton variant="ghost" onClick={onSkip} disabled={submitting} className="mt-1 w-full">Pular avaliação</DSButton></>}</div></div>;
}
function SummaryRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div><div className="flex items-center gap-1.5 text-[10.5px] uppercase text-muted-foreground">{icon}{label}</div><div className="text-[15px] font-semibold">{value}</div></div>; }
function TopStat({ icon, value, unit, label, highlight }: { icon: ReactNode; value: string; unit?: string; label: string; highlight?: boolean }) { return <div className="flex min-w-0 flex-1 flex-col items-center"><div className={`flex items-center gap-1.5 ${highlight ? "text-primary" : "text-foreground/85"}`}>{icon}<span className="text-[17px] font-extrabold">{value}</span>{unit && <span className="text-[11px] font-semibold">{unit}</span>}</div><div className="mt-1 text-[10px] uppercase text-muted-foreground">{label}</div></div>; }

function PickupNavOverlay({ ride, passenger, etaSeconds, legKm, onOpenProfile, onArrive, onCancel }: { ride: RideRow; passenger: Passenger | null; etaSeconds: number | null; legKm: number | null; onOpenProfile?: () => void; onArrive: () => Promise<void> | void; onCancel: () => Promise<void> | void }) {
  const [arriveBusy, setArriveBusy] = useState(false), [cancelBusy, setCancelBusy] = useState(false); const minutes = etaSeconds != null ? Math.max(1, Math.round(etaSeconds / 60)) : null; const arrivalTime = etaSeconds != null ? new Date(Date.now() + etaSeconds * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
  const handleArrive = async () => { if (arriveBusy) return; setArriveBusy(true); try { await onArrive(); } finally { setArriveBusy(false); } }; const handleCancel = async () => { if (cancelBusy || !window.confirm("Cancelar esta corrida?")) return; setCancelBusy(true); try { await onCancel(); } finally { setCancelBusy(false); } };
  return <><div className="fixed left-1/2 z-40 w-full max-w-md -translate-x-1/2 px-4" style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}><div className="rounded-[22px] border border-white/70 bg-white/90 px-4 py-3"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-bold uppercase text-primary">Indo até o passageiro</span><button onClick={handleCancel} disabled={cancelBusy}><X className="h-4 w-4" /></button></div><div className="flex items-center justify-between"><TopStat icon={<Clock className="h-[15px] w-[15px]" />} value={minutes != null ? String(minutes) : "—"} unit="min" label="ETA" highlight /><TopStat icon={<RouteIcon className="h-[15px] w-[15px]" />} value={legKm != null ? legKm.toFixed(1) : "—"} unit="km" label="Até coleta" /><TopStat icon={<MapPin className="h-[15px] w-[15px]" />} value={arrivalTime ?? "—"} label="Chegada" /></div></div></div><div className="fixed inset-x-0 bottom-0 z-40 bg-[#0B0F17]/95" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}><div className="mx-auto max-w-md px-4 py-3"><button onClick={onOpenProfile} className="flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2"><Avatar src={passenger?.avatar_url ?? null} name={passenger?.name ?? "Passageiro"} size={38} /><div className="flex-1 text-left"><div className="text-[13px] font-bold text-white">{passenger?.name ?? "Passageiro"}</div><div className="truncate text-[11.5px] text-white/60">{ride.pickup_label || ride.origin_name || "Embarque"}</div></div></button><button type="button" disabled={arriveBusy} onClick={handleArrive} className="mt-2 flex h-12 w-full items-center justify-center rounded-[14px] bg-[#F6BE1C] font-bold text-black">{arriveBusy ? "Confirmando…" : "Cheguei no embarque"}</button></div></div></>;
}
function CircleAction({ icon: Icon, label, onClick, href, target, disabled }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; onClick?: () => void; href?: string; target?: string; disabled?: boolean }) { const cls = "press-scale flex h-12 w-12 items-center justify-center rounded-full bg-background ring-1 ring-border"; const content = <Icon className="h-[19px] w-[19px]" />; return <div>{href && !disabled ? <a href={href} target={target} rel={target === "_blank" ? "noreferrer" : undefined} aria-label={label} className={cls}>{content}</a> : <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className={cls}>{content}</button>}<span className="sr-only">{label}</span></div>; }
function ActiveTripNavOverlay({ ride, passenger, etaSeconds, legKm, onOpenProfile, onComplete }: { ride: RideRow; passenger: Passenger | null; etaSeconds: number | null; legKm: number | null; onOpenProfile?: () => void; onComplete: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false); const minutes = etaSeconds != null ? Math.max(1, Math.round(etaSeconds / 60)) : null, arrivalTime = etaSeconds != null ? new Date(Date.now() + etaSeconds * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
  const handleComplete = async () => { if (busy) return; setBusy(true); try { await onComplete(); } finally { setBusy(false); } };
  return <><div className="fixed left-1/2 z-40 w-full max-w-md -translate-x-1/2 px-4" style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}><div className="rounded-[22px] border border-white/70 bg-white/90 px-4 py-3"><div className="mb-2 text-[11px] font-bold uppercase text-primary">Indo para o destino</div><div className="flex items-center justify-between"><TopStat icon={<Clock className="h-[15px] w-[15px]" />} value={minutes != null ? String(minutes) : "—"} unit="min" label="ETA" highlight /><TopStat icon={<RouteIcon className="h-[15px] w-[15px]" />} value={legKm != null ? legKm.toFixed(1) : "—"} unit="km" label="Restante" /><TopStat icon={<MapPin className="h-[15px] w-[15px]" />} value={arrivalTime ?? "—"} label="Chegada" /></div></div></div><div className="fixed inset-x-0 bottom-0 z-40 bg-[#0B0F17]/95" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}><div className="mx-auto max-w-md px-4 py-3"><button onClick={onOpenProfile} className="flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2"><Avatar src={passenger?.avatar_url ?? null} name={passenger?.name ?? "Passageiro"} size={36} /><div className="flex-1 text-left"><div className="text-[13px] font-bold text-white">{passenger?.name ?? "Passageiro"}</div><div className="truncate text-[11.5px] text-white/60">{ride.destination_name || "Destino"}</div></div></button><button type="button" disabled={busy} onClick={handleComplete} className="mt-2 flex h-12 w-full items-center justify-center rounded-[14px] bg-[#F6BE1C] font-bold text-black">{busy ? "Finalizando…" : "Finalizar corrida"}</button></div></div></>;
}
