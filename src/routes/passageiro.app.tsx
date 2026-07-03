import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Avatar } from "@/components/Avatar";
import { DriverProfessionalProfileDialog } from "@/components/profile/DriverProfessionalProfileDialog";
import { SafetyCard } from "@/components/safety/SafetyCard";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import {
  ArrowLeft,
  Bike,
  Box,
  Car,
  ChevronRight,
  Clock,
  CreditCard,
  Crosshair,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Navigation2,
  Package,
  Phone,
  Search,
  Send,
  Shield,
  Star,
  Sun,
  Sunrise,
  Sunset,
  Truck,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { PassengerSideMenu } from "@/components/PassengerSideMenu";
import { MovviMap } from "@/components/MovviMap";
import { MovviSheet, type MovviSheetHandle } from "@/components/MovviSheet";
import {
  PassengerLocationMarker,
  PlacePinMarker,
  NearbyDriverMarker,
  InterpolatedDriverMarker,
} from "@/components/mapMarkers";
import { smoothPanZoom } from "@/lib/mapCamera";
import { supabase } from "@/integrations/supabase/client";
import {
  BRAZIL_CENTER,
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  isBrazilCoordinate,
  purgeForeignMapCache,
  safePoint,
  safeSymbol,
} from "@/lib/googleMaps";
import { DEV_MODE, isDevelopmentEnvironment } from "@/lib/environment";

import { computeRoute, type RouteResult } from "@/lib/routes.functions";
import { reverseGeocode, nearestPoiLookup, type GeocodeResult } from "@/lib/geocode.functions";
import { criarCorrida, cancelarPeloPassageiro, redispatchRide, diagnoseDispatch, avaliarMotorista, type RideStatus } from "@/lib/rideLifecycle";
import { notifyRideStatus } from "@/lib/rideStatusToast";
import { toast } from "sonner";
import { requestPushPermission } from "@/lib/pushNotifications";
import { useNearbyDrivers } from "@/hooks/useNearbyDrivers";
import {
  RIDE_CATEGORIES,
  estimateFare,
  formatBRL,
  type RideCategory,
  type TariffMap,
} from "@/lib/rideCategories";
import { useTariffs } from "@/hooks/useTariffs";
import { UiCategoriesProvider, useUiCategories } from "@/lib/uiCategories";
import { logGpsTelemetry } from "@/lib/gpsTelemetry";
import { listFavorites, type FavoritePlace } from "@/lib/favoritePlaces";
import { Briefcase, Heart, Home as HomeIcon } from "lucide-react";

import type { Database } from "@/integrations/supabase/types";

/** Saudação dinâmica com base no horário local (pt-BR). */
function getGreeting(): { text: string; icon: LucideIcon } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { text: "Bom dia", icon: Sunrise };
  if (h >= 12 && h < 18) return { text: "Boa tarde", icon: Sun };
  if (h >= 18 && h < 22) return { text: "Boa noite", icon: Sunset };
  return { text: "Boa noite", icon: Moon };
}

function firstName(full: string): string {
  return (full || "").trim().split(/\s+/)[0] || "";
}

/** Converte "FRANCIEL DA SILVA" → "Franciel". Mantém acentos. */
function properCase(name: string): string {
  const first = firstName(name);
  if (!first) return "";
  return first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1).toLocaleLowerCase("pt-BR");
}

/** Reduz o tamanho da fonte da saudação conforme o nome cresce, evitando reticências. */
function greetingTextSize(name: string): string {
  const len = name.length;
  if (len <= 10) return "text-[14px]";
  if (len <= 14) return "text-[13px]";
  if (len <= 18) return "text-[12px]";
  return "text-[11px]";
}

// ====== CACHE LOCAL DE PICKUP LABEL ======
const PICKUP_CACHE_KEY = "movvi.lastPickupLabel";
type PickupCache = {
  lat: number; lng: number;
  label: string; short?: string; sub?: string;
  address?: string; ts: number;
};
function readPickupCache(): PickupCache | null {
  try {
    const raw = localStorage.getItem(PICKUP_CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as PickupCache;
    if (!j?.label || typeof j.lat !== "number" || typeof j.lng !== "number") return null;
    // Cache válido por 24h.
    if (Date.now() - (j.ts ?? 0) > 24 * 60 * 60 * 1000) return null;
    return j;
  } catch { return null; }
}
function writePickupCache(c: PickupCache) {
  try { localStorage.setItem(PICKUP_CACHE_KEY, JSON.stringify(c)); } catch { /* noop */ }
}

// ====== COMPONENTES PREMIUM ======


function PremiumTopBar({
  userName,
  gpsState,
  drivers,
  searching,
  onLogout,
  onOpenMenu,
}: {
  userName: string;
  gpsState: "idle" | "requesting" | "granted" | "denied" | "unavailable";
  drivers: number;
  searching: boolean;
  onLogout: () => void;
  onOpenMenu: () => void;
}) {
  const { text: greet, icon: GIcon } = getGreeting();
  const fname = properCase(userName) || "passageiro";
  const greetingClass = greetingTextSize(fname);

  let statusIcon = "🔎";
  let statusText = "Procurando motoristas próximos";
  if (gpsState === "requesting" || gpsState === "idle") {
    statusIcon = "📍";
    statusText = "Obtendo sua localização...";
  } else if (gpsState === "unavailable" || gpsState === "denied") {
    statusIcon = "⚠️";
    statusText = "Localização indisponível";
  } else if (searching) {
    statusIcon = "🔎";
    statusText = "Procurando motoristas próximos";
  } else if (drivers > 0) {
    statusIcon = "🚗";
    statusText = `${drivers} ${drivers === 1 ? "motorista próximo" : "motoristas próximos"}`;
  }


  return (
    <div className="absolute inset-x-0 top-0 z-40 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
      <div className="mx-auto flex max-w-5xl items-center gap-3 rounded-[24px] border border-border/60 bg-card/85 px-3.5 py-2.5 shadow-[0_10px_28px_-16px_rgba(15,23,42,0.28)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-300">
        <button
          onClick={onOpenMenu}
          aria-label="Abrir menu"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/80 transition hover:bg-[#76C139]/10 hover:text-[#76C139] active:scale-[0.95]"
        >
          <Menu className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        <div className="min-w-0 flex-1">
          <div className={`${greetingClass} flex items-center gap-1.5 font-normal leading-tight tracking-tight text-[#707070]`}>
            <GIcon className="h-[13px] w-[13px] text-[#76C139]" strokeWidth={2} />
            <span>{greet},</span>
            <span className="truncate font-semibold text-[#1B1B1B]">{fname}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 truncate text-[12px] text-[#707070]">
            <MapPin className="h-[12px] w-[12px] shrink-0 text-[#76C139]" strokeWidth={2} />
            <span className="truncate">{statusText}</span>
          </div>
        </div>
        <button
          onClick={onLogout}
          aria-label="Sair"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#707070] transition hover:bg-destructive/10 hover:text-destructive active:scale-[0.95]"
        >
          <LogOut className="h-[16px] w-[16px]" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}


function PulsingUserMarker({ position }: { position: LatLng }) {
  const pulseIcon = useMemo(
    () => ({
      path: safeSymbol("CIRCLE"),
      scale: 22,
      fillColor: "#3b82f6",
      fillOpacity: 0.18,
      strokeColor: "#3b82f6",
      strokeOpacity: 0.35,
      strokeWeight: 1,
    }),
    [],
  );
  const dotIcon = useMemo(
    () => ({
      path: safeSymbol("CIRCLE"),
      scale: 8,
      fillColor: "#3b82f6",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
    }),
    [],
  );
  return (
    <>
      <Marker position={position} icon={pulseIcon} clickable={false} zIndex={9998} />
      <Marker position={position} icon={dotIcon} zIndex={9999} />
    </>
  );
}

/**
 * Círculo de raio de busca animado durante "procurar_motorista".
 * Cresce de 1km até 8km de forma cíclica, pulsando suavemente.
 * Não interfere em lógica de despacho — é puramente visual.
 */
function SearchRadiusCircle({ center }: { center: LatLng }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);
  // Cresce de 1km até 8km em ~28s, depois reinicia (loop visual).
  const radiusKm = 1 + (tick % 28) * 0.25;
  const radius = radiusKm * 1000;
  const fillOpacity = 0.10 - ((tick % 28) / 28) * 0.07; // desvanece ao crescer
  return (
    <Circle
      center={center}
      radius={radius}
      options={{
        strokeColor: "#8DD92B",
        strokeOpacity: 0.55,
        strokeWeight: 1.5,
        fillColor: "#8DD92B",
        fillOpacity: Math.max(0.03, fillOpacity),
        clickable: false,
        zIndex: 1,
      }}
    />
  );
}

function OriginActionsSheet({
  geo,
  position,
  onClose,
  onUseGps,
  onPickOnMap,
  onTypeAddress,
  gpsRequesting,
}: {
  geo: GeocodeResult | null;
  position: LatLng | null;
  onClose: () => void;
  onUseGps: () => void;
  onPickOnMap: () => void;
  onTypeAddress: () => void;
  gpsRequesting: boolean;
}) {
  const isExact = geo?.precision === "exact";
  const rua = geo?.components.rua;
  const numero = geo?.components.numero;
  const bairro = geo?.components.bairro || geo?.components.povoado;
  const region = geo?.region;
  const ruaLine = isExact && rua ? (numero ? `${rua}, ${numero}` : rua) : "";
  const pickupAddressLine =
    geo?.pickupLabel ||
    ruaLine ||
    geo?.components?.rua ||
    geo?.components?.bairro ||
    geo?.components?.povoado ||
    geo?.components?.cidade ||
    geo?.friendly ||
    geo?.region ||
    geo?.address ||
    "";
  const pickupSubLine = geo?.pickupSubLabel || "";

  return (
    <div className="fixed inset-0 z-[60] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full rounded-t-3xl bg-card p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-2xl ring-1 ring-border animate-in slide-in-from-bottom duration-300"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-foreground/15" />
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <MapPin className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-primary">
              Local de partida
            </div>
            {pickupAddressLine ? (
              <>
                <div className="mt-0.5 truncate text-[15px] font-bold text-foreground">{pickupAddressLine}</div>
                {pickupSubLine && pickupSubLine !== pickupAddressLine ? (
                  <div className="truncate text-[12.5px] text-foreground/80">{pickupSubLine}</div>
                ) : (
                  <>
                    {bairro && bairro !== pickupAddressLine && (
                      <div className="truncate text-[12.5px] text-foreground/80">{bairro}</div>
                    )}
                    {region && region !== pickupAddressLine && (
                      <div className="truncate text-[12px] text-muted-foreground">{region}</div>
                    )}
                  </>
                )}
              </>
            ) : position ? (
              <div className="mt-0.5 text-[13px] font-semibold text-foreground">
                Localização atual
              </div>
            ) : (
              <div className="mt-0.5 text-[13px] text-muted-foreground">Endereço não identificado</div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <OriginAction
            icon={<Crosshair className="h-4 w-4" />}
            label="Usar minha localização novamente"
            description="Recapturar GPS do aparelho"
            onClick={onUseGps}
            disabled={gpsRequesting}
            primary
          />
          <OriginAction
            icon={<Navigation2 className="h-4 w-4" />}
            label="Escolher outro local no mapa"
            description="Arraste o mapa e confirme o ponto"
            onClick={onPickOnMap}
          />
          <OriginAction
            icon={<Search className="h-4 w-4" />}
            label="Digitar outro endereço"
            description="Buscar pelo nome da rua, bairro ou CEP"
            onClick={onTypeAddress}
          />
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-background/60 py-3 text-sm font-semibold text-muted-foreground ring-1 ring-border transition active:scale-[0.98]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function OriginAction({
  icon,
  label,
  description,
  onClick,
  disabled,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition active:scale-[0.98] disabled:opacity-60 ${
        primary
          ? "bg-primary/15 ring-1 ring-primary/40 hover:bg-primary/20"
          : "bg-background/60 ring-1 ring-border hover:bg-background"
      }`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
          primary ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-bold text-foreground">{label}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}



export const Route = createFileRoute("/passageiro/app")({
  head: () => ({ meta: [{ title: "MOVVI Drive — Passageiro" }] }),
  component: () => (
    <UiCategoriesProvider>
      <PassageiroApp />
    </UiCategoriesProvider>
  ),
  errorComponent: ({ error, reset }) => {
    console.error("[MOVVI] Erro na tela do passageiro:", error);
    const message = (error as Error)?.message ?? String(error ?? "Erro desconhecido");
    const stack = (error as Error)?.stack ?? "";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <h1 className="font-display text-2xl font-bold">Tivemos um problema ao abrir o mapa</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          O app continua disponível. Recarregue para tentar novamente — sua localização e seu cadastro estão preservados.
        </p>
        <details className="w-full max-w-md rounded-lg bg-card/60 p-3 text-left text-[11px] text-muted-foreground ring-1 ring-border">
          <summary className="cursor-pointer font-semibold text-foreground">Detalhes técnicos</summary>
          <div className="mt-2 break-words font-mono text-[10px] text-destructive-foreground">{message}</div>
          {stack && (
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] opacity-70">{stack}</pre>
          )}
        </details>
        <div className="flex gap-2">
          <button
            onClick={() => { try { reset(); } catch { /* ignore */ } if (typeof window !== "undefined") window.location.reload(); }}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Tentar novamente
          </button>
          <button
            onClick={() => { if (typeof window !== "undefined") window.location.href = "/"; }}
            className="rounded-xl bg-card px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  },
});


type LatLng = { lat: number; lng: number };
type Suggestion = { placeId: string; primary: string; secondary: string };
type RideRow = Database["public"]["Tables"]["rides"]["Row"];
type DriverRow = Database["public"]["Tables"]["drivers"]["Row"];

const REVERSE_GEOCODE_CLIENT_TIMEOUT_MS = 5000;
const NEARBY_PLACES_CLIENT_TIMEOUT_MS = 3000;

const RECENT_KEY = "movvi.recent_destinations";

/**
 * Antes forçávamos a origem como aproximada no Lovable Preview. Removido:
 * se o Google devolver um endereço válido (ROOFTOP, rua/número, dist < 30m),
 * exibimos o endereço real. Coordenadas só aparecem como fallback quando o
 * reverse geocoding realmente falha ou retorna baixa confiança.
 */
const FORCE_APPROXIMATE_ORIGIN_IN_PREVIEW = false;


/** Distância em metros entre dois pares lat/lng (Haversine). */
function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function withClientTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<{ status: "success"; value: T } | { status: "timeout" } | { status: "error"; error: unknown }> {
  return new Promise((resolve) => {
    const id = window.setTimeout(() => resolve({ status: "timeout" }), ms);
    promise
      .then((value) => resolve({ status: "success", value }))
      .catch((error) => resolve({ status: "error", error }))
      .finally(() => window.clearTimeout(id));
  });
}

function hasDisplayablePickup(geo: GeocodeResult | null): boolean {
  return !!(
    geo?.pickupLabel ||
    geo?.components?.rua ||
    geo?.components?.bairro ||
    geo?.components?.povoado ||
    geo?.components?.cidade ||
    geo?.friendly ||
    geo?.region ||
    geo?.address
  );
}

function geocodeFromPickupCache(cached: PickupCache): GeocodeResult {
  return {
    address: cached.address || cached.label,
    friendly: "",
    region: cached.sub || "",
    approximate: true,
    precision: "approximate",
    confidence: "fallback",
    selectionReason: "Cache local",
    locationType: "",
    partialMatch: false,
    types: [],
    components: {},
    pickupLabel: cached.label,
    pickupShortLabel: cached.short,
    pickupSubLabel: cached.sub,
    pickupSource: "gps",
  };
}

/** Catálogo visual de categorias da MOVVI (mapeia para o enum backend). */
type UiCategory = {
  key: string;
  label: string;
  icon: LucideIcon;
  backend: RideCategory;
  tagline: string;
};
// UI_CATEGORIES agora vem do banco em realtime via `useUiCategories()` (lib/uiCategories.tsx).

const fmtMin = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;
const fmtKm = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;

function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0,
    lat = 0,
    lng = 0;
  while (index < encoded.length) {
    let b,
      shift = 0,
      result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }
  return points;
}

type Recent = { label: string; secondary?: string; placeId: string };
type PassengerUiStage =
  | "selecting_destination"
  | "route_preview"
  | "selecting_category"
  | "confirming_request"
  | "searching_driver";

function PassageiroApp() {
  const navigate = useNavigate();
  const callComputeRoute = useServerFn(computeRoute);
  const callRequestRide = useServerFn(criarCorrida);
  const callCancelByPassenger = useServerFn(cancelarPeloPassageiro);
  const callReverseGeocode = useServerFn(reverseGeocode);
  const callNearestPoi = useServerFn(nearestPoiLookup);
  const callRedispatch = useServerFn(redispatchRide);
  const callDiagnose = useServerFn(diagnoseDispatch);
  const callRateDriver = useServerFn(avaliarMotorista);

  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const ratedRideIdsRef = useRef<Set<string>>(new Set());

  async function submitDriverRating() {
    if (!ride) return;
    const rideId = ride.id;
    if (submittingRating) return; // bloqueia cliques duplicados
    if (ratedRideIdsRef.current.has(rideId)) {
      // já enviou nesta sessão — apenas marca local p/ mostrar confirmação
      setRide((prev) => (prev && prev.id === rideId
        ? { ...prev, passenger_rated_at: prev.passenger_rated_at ?? new Date().toISOString() }
        : prev));
      return;
    }
    setSubmittingRating(true);
    setRatingError(null);
    try {
      await callRateDriver({ data: { rideId, stars: ratingStars, comment: ratingComment || null } });
      ratedRideIdsRef.current.add(rideId);
      // Marca localmente como avaliada para exibir a etapa de confirmação
      // sem depender do Realtime e impedir a reabertura do formulário.
      setRide((prev) => (prev && prev.id === rideId
        ? { ...prev, passenger_rated_at: new Date().toISOString() }
        : prev));
    } catch (e) {
      const msg = (e as Error)?.message ?? "Falha ao enviar avaliação.";
      if (import.meta.env.DEV) console.warn("[MOVVI] erro ao avaliar motorista:", msg);
      setRatingError(msg);
    } finally {
      setSubmittingRating(false);
    }
  }

  function skipDriverRating() {
    if (!ride) return;
    ratedRideIdsRef.current.add(ride.id);
    setRatingError(null);
    setRide((prev) => (prev
      ? { ...prev, passenger_rated_at: prev.passenger_rated_at ?? new Date().toISOString() }
      : prev));
  }

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  const [position, setPosition] = useState<LatLng | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [geo, setGeo] = useState<GeocodeResult | null>(null);
  const latestGeoRef = useRef<GeocodeResult | null>(null);
  const [addressStatus, setAddressStatus] = useState<
    "idle" | "loading" | "resolved" | "failed"
  >("idle");
  const [reverseGeocodeFailureReason, setReverseGeocodeFailureReason] = useState<string | null>(null);
  const [addressDetailsOpen, setAddressDetailsOpen] = useState(false);
  const [originPickOnMap, setOriginPickOnMap] = useState(false);
  const [originManualOpen, setOriginManualOpen] = useState(false);
  const [originPickCenter, setOriginPickCenter] = useState<LatLng | null>(null);
  const [pickupSource, setPickupSource] = useState<"gps" | "manual" | "places">("gps");
  const [tick, setTick] = useState(0); // re-render para saudação dinâmica
  const [gpsState, setGpsState] = useState<
    "idle" | "requesting" | "granted" | "denied" | "unavailable"
  >("idle");
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string>("");
  // 🔧 Painel temporário de diagnóstico de geolocalização (DEV)
  const [gpsDiag, setGpsDiag] = useState<{
    status: "ok" | "rejected-outside-br";
    lat: number;
    lng: number;
    accuracy: number | null;
    altitude: number | null;
    heading: number | null;
    speed: number | null;
    timestamp: number;
    reason?: string;
  } | null>(null);
  // Status da permissão de geolocalização (Permissions API).
  // - checking: ainda consultando a Permissions API
  // - prompt: navegador ainda não decidiu — precisa de ação do usuário
  // - granted: usuário já liberou; podemos pedir GPS imediatamente
  // - denied: usuário negou; mostrar fluxo manual
  // - unsupported: Permissions API ausente (Safari antigo etc.) — tratamos como "prompt"
  const [permissionStatus, setPermissionStatus] = useState<
    "checking" | "prompt" | "granted" | "denied" | "unsupported"
  >("checking");
  
  

  const [destinationText, setDestinationText] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [destination, setDestination] = useState<{
    point: LatLng;
    label: string;
  } | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [passengerUiStage, setPassengerUiStage] = useState<PassengerUiStage>("selecting_destination");
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"dinheiro" | "pix" | "cartao_credito">("dinheiro");
  const uiCategories = useUiCategories();
  const selectedUiCategory = useMemo(
    () => uiCategories.find((c) => c.key === selectedCategoryKey) ?? null,
    [uiCategories, selectedCategoryKey],
  );
  const category: RideCategory = selectedUiCategory?.backend ?? "carros";
  const [recent, setRecent] = useState<Recent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { tariffs } = useTariffs();

  // ride lifecycle
  const [rideId, setRideId] = useState<string | null>(null);
  const [ride, setRide] = useState<RideRow | null>(null);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [driverInfo, setDriverInfo] = useState<DriverRow | null>(null);
  const [driverProfileOpen, setDriverProfileOpen] = useState(false);

  // Solicita permissão de notificações push uma vez ao montar.
  useEffect(() => { void requestPushPermission(); }, []);

  // Toast em cada transição de status (sem reload)
  const lastNotifiedStatusRef = useRef<RideStatus | null>(null);
  useEffect(() => {
    const s = ride?.status as RideStatus | undefined;
    if (!s) { lastNotifiedStatusRef.current = null; return; }
    if (lastNotifiedStatusRef.current === s) return;
    // Pula a primeira leitura ao restaurar uma corrida já em andamento, exceto pelo "procurar_motorista".
    const isFirst = lastNotifiedStatusRef.current === null;
    lastNotifiedStatusRef.current = s;
    if (isFirst && s !== "procurar_motorista") return;
    notifyRideStatus("passageiro", s);
  }, [ride?.status]);

  const mapRef = useRef<google.maps.Map | null>(null);
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);
  const sheetRef = useRef<MovviSheetHandle | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const drivers = useNearbyDrivers({ category });

  useEffect(() => {
    latestGeoRef.current = geo;
  }, [geo]);

  // Conta apenas motoristas dentro do raio de 15 km da origem (mesmo raio do despacho).
  const nearbyCount = useMemo(() => {
    if (!position) return 0;
    const R = 6371;
    const toRad = (v: number) => (v * Math.PI) / 180;
    return drivers.filter((d) => {
      const dLat = toRad(d.current_lat - position.lat);
      const dLng = toRad(d.current_lng - position.lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(position.lat)) * Math.cos(toRad(d.current_lat)) * Math.sin(dLng / 2) ** 2;
      const km = 2 * R * Math.asin(Math.sqrt(a));
      return km <= 15;
    }).length;
  }, [drivers, position?.lat, position?.lng]);


  useEffect(() => {
    if (import.meta.env.DEV) console.log("[MOVVI UI] etapa atual:", passengerUiStage);
  }, [passengerUiStage]);

  /* ---------------------- auth ---------------------- */
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.user) {
        navigate({ to: "/passageiro/login" });
        return;
      }
      // Bloqueio/suspensão aplicado pelo Admin Panel — fonte: public.users
      try {
        const { data: u } = await supabase
          .from("users")
          .select("blocked_at, suspended_at, block_reason")
          .eq("auth_user_id", data.user.id)
          .maybeSingle();
        if (u?.blocked_at) {
          toast.error(
            u.block_reason
              ? `Conta bloqueada: ${u.block_reason}`
              : "Sua conta foi bloqueada. Entre em contato com o suporte.",
            { duration: 8000 },
          );
          await supabase.auth.signOut();
          navigate({ to: "/passageiro/login" });
          return;
        }
        if (u?.suspended_at) {
          toast.error("Sua conta está suspensa temporariamente.", { duration: 8000 });
          await supabase.auth.signOut();
          navigate({ to: "/passageiro/login" });
          return;
        }
      } catch {
        /* fallback: deixa entrar; bloqueio será reavaliado em ações */
      }
      setUserId(data.user.id);
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      setUserName(
        (meta.name as string) ||
          (meta.full_name as string) ||
          data.user.email?.split("@")[0] ||
          "Passageiro",
      );
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Realtime: se o admin bloquear o passageiro durante a sessão, encerra na hora.
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`user-self-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users", filter: `auth_user_id=eq.${userId}` },
        async (payload) => {
          const row = payload.new as { blocked_at?: string | null; suspended_at?: string | null };
          if (row.blocked_at || row.suspended_at) {
            toast.error("Sua conta foi bloqueada/suspensa pelo suporte.", { duration: 8000 });
            await supabase.auth.signOut();
            navigate({ to: "/passageiro/login" });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, navigate]);

  /* ---------------------- recents (localStorage) ---------------------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  function pushRecent(r: Recent) {
    setRecent((prev) => {
      const next = [r, ...prev.filter((x) => x.placeId !== r.placeId)].slice(0, 5);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  /* ---------------------- reverse geocode (endereço atual) ---------------------- */
  const lastGeocodedRef = useRef<LatLng | null>(null);
  useEffect(() => {
    if (!position) {
      if (import.meta.env.DEV) console.warn("[MOVVI Reverse Geocoding Diagnostic] reverse geocoding was not called: GPS has not returned coordinates yet.");
      return;
    }
    const last = lastGeocodedRef.current;
    if (
      last &&
      Math.abs(last.lat - position.lat) < 0.002 &&
      Math.abs(last.lng - position.lng) < 0.002
    )
    {
      if (import.meta.env.DEV) console.warn("[MOVVI Reverse Geocoding Diagnostic] reverse geocoding was not called: coordinate delta is below throttle threshold.", {
        previous: last,
        current: position,
      });
      return;
    }
    lastGeocodedRef.current = position;
    let active = true;
    setAddressStatus("loading");
    setReverseGeocodeFailureReason(null);
    const diagnosticRequestUrl = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?latlng=${position.lat},${position.lng}&language=pt-BR&region=br`;
    if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] latitude:", position.lat);
    if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] longitude:", position.lng);
    if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] exact request URL:", diagnosticRequestUrl);
    if (import.meta.env.DEV) console.log("[MOVVI] Reverse geocoding iniciado");
    // Timeout de segurança: nunca deixar o cartão preso em "Obtendo seu endereço...".
    // Limite máximo do Reverse Geocoding: 5s. Após isso, marcamos failed se ainda estiver loading.
    const timeoutId = window.setTimeout(() => {
      if (!active) return;
      const reason = "Reverse Geocoding timed out after 5000ms.";
      if (import.meta.env.DEV) console.warn("[MOVVI] Reverse geocode timeout (5s)");
      console.error("[MOVVI Reverse Geocoding Diagnostic] Reverse Geocoding failed:", reason);
      setReverseGeocodeFailureReason(reason);
      setAddressStatus((s) => {
        if (s !== "loading") return s;
        return hasDisplayablePickup(latestGeoRef.current) ? "resolved" : "failed";
      });
    }, REVERSE_GEOCODE_CLIENT_TIMEOUT_MS);

    void (async () => {
      const reverseResult = await withClientTimeout(
        callReverseGeocode({ data: { lat: position.lat, lng: position.lng } }) as Promise<GeocodeResult>,
        REVERSE_GEOCODE_CLIENT_TIMEOUT_MS,
      );
      window.clearTimeout(timeoutId);
      if (!active) return;

      if (reverseResult.status === "timeout") {
        const reason = `Reverse Geocoding timed out after ${REVERSE_GEOCODE_CLIENT_TIMEOUT_MS}ms.`;
        if (import.meta.env.DEV) console.warn("[MOVVI] Reverse geocode finished: timeout");
        setReverseGeocodeFailureReason(reason);
        setAddressStatus(hasDisplayablePickup(latestGeoRef.current) ? "resolved" : "failed");
        return;
      }

      if (reverseResult.status === "error") {
        const reason = reverseResult.error instanceof Error ? reverseResult.error.message : String(reverseResult.error);
        console.error("[MOVVI] Reverse geocode finished: error", reverseResult.error);
        console.error("[MOVVI Reverse Geocoding Diagnostic] Reverse Geocoding failed:", reason);
        setReverseGeocodeFailureReason(reason);
        setAddressStatus(hasDisplayablePickup(latestGeoRef.current) ? "resolved" : "failed");
        return;
      }

      try {
        if (import.meta.env.DEV) console.log("[MOVVI] Reverse geocode finished: success");
        const raw = reverseResult.value;
        const r = raw as GeocodeResult;
        const diagnostic = r.diagnostic;
        if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] returned latitude:", diagnostic?.latitude ?? position.lat);
        if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] returned longitude:", diagnostic?.longitude ?? position.lng);
        if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] returned request URL:", diagnostic?.requestUrl ?? diagnosticRequestUrl);
        if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] HTTP response status:", diagnostic?.httpStatus ?? "not returned");
        if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] complete Google JSON/body:", diagnostic?.responseBody ?? "not returned");
        if (diagnostic?.googleError) {
          console.error("[MOVVI Reverse Geocoding Diagnostic] Google returned error exactly:", diagnostic.googleError);
        }
        if (diagnostic?.rejectionReason) {
          console.error("[MOVVI Reverse Geocoding Diagnostic] API key rejection / failure reason:", diagnostic.rejectionReason);
        }
        if (diagnostic?.failureReason || !r.address) {
          const reason = diagnostic?.failureReason || diagnostic?.googleError || diagnostic?.googleStatus || "Google returned no formatted_address.";
          console.error("[MOVVI Reverse Geocoding Diagnostic] Reverse Geocoding failed:", reason);
          // Fallback: tentar cache local recente (≤ 200 m do GPS atual).
          const cached = readPickupCache();
          if (cached && distanceMeters(position, { lat: cached.lat, lng: cached.lng }) < 200) {
            if (import.meta.env.DEV) console.log("[MOVVI Pickup Cache] reaproveitando label cacheado:", cached.label);
            const cachedGeo = geocodeFromPickupCache(cached);
            latestGeoRef.current = cachedGeo;
            setGeo(cachedGeo);
            setAddressStatus("resolved");
            return;
          }
          setReverseGeocodeFailureReason(reason);
          setGeo(null);
          setAddressStatus("failed");
          return;
        }

        let dist = Number.POSITIVE_INFINITY;
        if (typeof r.geocodedLat === "number" && typeof r.geocodedLng === "number") {
          dist = distanceMeters(position, { lat: r.geocodedLat, lng: r.geocodedLng });
        }

        if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] selected formatted_address:", r.address);
        if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] selected location_type:", r.locationType || "(none)");
        if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] confidence:", r.confidence);
        if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] reason:", r.selectionReason);
        if (import.meta.env.DEV) console.log("[MOVVI] Distância GPS↔geocoding:", Number.isFinite(dist) ? `${dist.toFixed(1)} m` : "n/d");

        // Stage 1: limpa erro e mostra o endereço imediatamente — sem esperar POI.
        setReverseGeocodeFailureReason(null);
        latestGeoRef.current = r;
        setGeo(r);
        setAddressStatus("resolved");
        if (import.meta.env.DEV) console.log("[MOVVI] Pickup label generated", r.pickupLabel || r.address);
        // Cache local do último pickup label bom.
        if (r.pickupLabel) {
          writePickupCache({
            lat: position.lat,
            lng: position.lng,
            label: r.pickupLabel,
            short: r.pickupShortLabel,
            sub: r.pickupSubLabel,
            address: r.address,
            ts: Date.now(),
          });
        }

        // Stage 2 (background): só vale a pena enriquecer com POI quando não temos
        // rua nomeada, bairro ou povoado — ou seja, casos "Zona Rural" / rodovia.
        const c = r.components;
        const labelIsWeak =
          !c.rua && !c.bairro && !c.povoado &&
          (!r.pickupLabel || /zona rural|^br-|^[a-z]{2}-\d/i.test(r.pickupLabel));
        if (labelIsWeak) {
          if (import.meta.env.DEV) console.log("[MOVVI] Stage 2 POI lookup iniciado");
          void (async () => {
            const poiResult = await withClientTimeout(
              callNearestPoi({ data: { lat: position.lat, lng: position.lng } }) as Promise<{ name?: string; placeId?: string }>,
              NEARBY_PLACES_CLIENT_TIMEOUT_MS,
            );
            if (poiResult.status === "timeout") {
              if (import.meta.env.DEV) console.warn("[MOVVI] Nearby Places finished: timeout — mantendo label atual");
              return;
            }
            if (poiResult.status === "error") {
              if (import.meta.env.DEV) console.warn("[MOVVI] Nearby Places finished: error — mantendo label atual", poiResult.error);
              return;
            }
            const poi = poiResult.value;
              if (!active) return;
              if (import.meta.env.DEV) console.log("[MOVVI] Nearby Places finished:", poi?.name ?? "(nenhum)");
              if (!poi?.name) return;
              setGeo((prev) => {
                if (!prev) return prev;
                const newLabel = `Próximo a ${poi.name}`;
                if (import.meta.env.DEV) console.log("[MOVVI] Pickup label updated", newLabel);
                const updated: GeocodeResult = {
                  ...prev,
                  nearestPoi: poi.name,
                  nearestPoiPlaceId: poi.placeId,
                  pickupLabel: newLabel,
                  pickupShortLabel: poi.name,
                };
                latestGeoRef.current = updated;
                writePickupCache({
                  lat: position.lat,
                  lng: position.lng,
                  label: newLabel,
                  short: poi.name,
                  sub: prev.pickupSubLabel,
                  address: prev.address,
                  ts: Date.now(),
                });
                return updated;
              });
          })();
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    })();
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [position, callReverseGeocode, callNearestPoi]);

  // Atualiza saudação a cada minuto.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  void tick;

  /* ---------------------- GPS ---------------------- */
  // REGRA: nenhuma cidade fixa pode ser usada como fallback. Se o GPS falhar
  // ou retornar uma coordenada fora do Brasil, o app deve exibir "Localização
  // indisponível" e oferecer a entrada manual (Google Places).

  const gpsStateRef = useRef(gpsState);
  useEffect(() => {
    gpsStateRef.current = gpsState;
  }, [gpsState]);
  const watchIdRef = useRef<number | null>(null);
  const gpsRequestInFlightRef = useRef(false);

  const requestGps = useCallback(() => {
    // Guarda: não permitir cliques duplicados enquanto há uma solicitação em curso.
    if (gpsStateRef.current === "requesting" || gpsRequestInFlightRef.current) {
      if (import.meta.env.DEV) console.log("[MOVVI] Ignorando clique — já existe uma solicitação de GPS em andamento.");
      return;
    }
    if (import.meta.env.DEV) console.log("[MOVVI] Solicitando localização...");
    setPickupSource("gps");
    const fail = (msg: string) => {
      setGpsState("unavailable");
      gpsStateRef.current = "unavailable";
      setGpsErrorMsg(msg);
      gpsRequestInFlightRef.current = false;
    };
    if (!("geolocation" in navigator)) {
      fail("Seu navegador não oferece geolocalização.");
      return;
    }
    setGpsState("requesting");
    gpsStateRef.current = "requesting";
    gpsRequestInFlightRef.current = true;
    setGpsErrorMsg("");
    void logGpsTelemetry("retry_clicked");

    const onSuccess = (pos: GeolocationPosition) => {
      gpsRequestInFlightRef.current = false;
      try {
        const lat = pos?.coords?.latitude;
        const lng = pos?.coords?.longitude;
        if (import.meta.env.DEV) console.log("[MOVVI] Permissão concedida — coordenadas recebidas:", lat, lng, "accuracy:", pos?.coords?.accuracy);
        void logGpsTelemetry("getcurrentposition_success", { extra: { lat, lng, accuracy: pos?.coords?.accuracy } });

        if (
          typeof lat !== "number" ||
          typeof lng !== "number" ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lng)
        ) {
          if (import.meta.env.DEV) console.warn("[MOVVI] Coordenadas inválidas recebidas do GPS — ignorando.", { lat, lng });
          setGpsState("unavailable");
          gpsStateRef.current = "unavailable";
          setGpsErrorMsg("Coordenadas inválidas recebidas do GPS.");
          return;
        }

        const insideBR = isBrazilCoordinate(lat, lng);
        if (import.meta.env.DEV) console.log("[MOVVI] GPS acquired", { lat, lng, accuracy: pos?.coords?.accuracy });
        if (!insideBR) {
          if (import.meta.env.DEV) console.warn("[MOVVI] Aviso: coordenada fora do Brasil — aceitando mesmo assim.", { lat, lng });
          setGpsErrorMsg(
            "Sua localização parece estar fora do Brasil. Você pode digitar a origem manualmente se preferir.",
          );
        } else {
          setGpsErrorMsg("");
        }

        if (import.meta.env.DEV) console.log("[MOVVI] Atualizando centro do mapa para:", lat, lng);
        setPosition({ lat, lng });
        setGpsAccuracy(pos.coords.accuracy ?? null);
        setGpsDiag({
          status: insideBR ? "ok" : "rejected-outside-br",
          lat,
          lng,
          accuracy: pos.coords.accuracy ?? null,
          altitude: pos.coords.altitude ?? null,
          heading: pos.coords.heading ?? null,
          speed: pos.coords.speed ?? null,
          timestamp: pos.timestamp,
          reason: insideBR ? undefined : "Fora do bounding box do Brasil (aviso)",
        });
        setGpsState("granted");
        gpsStateRef.current = "granted";

        try {
          if (watchIdRef.current != null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
          }
          watchIdRef.current = navigator.geolocation.watchPosition(
            (p) => {
              try {
                const la = p?.coords?.latitude;
                const ln = p?.coords?.longitude;
                if (typeof la !== "number" || typeof ln !== "number" || !Number.isFinite(la) || !Number.isFinite(ln)) return;
                setPosition({ lat: la, lng: ln });
                setGpsAccuracy(p.coords.accuracy ?? null);
              } catch (err) {
                if (import.meta.env.DEV) console.warn("[MOVVI] watchPosition callback falhou:", err);
              }
            },
            (err) => { if (import.meta.env.DEV) console.warn("[MOVVI] watchPosition erro:", err); },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
          );
        } catch (err) {
          if (import.meta.env.DEV) console.warn("[MOVVI] Falha ao iniciar watchPosition:", err);
        }
      } catch (err) {
        console.error("[MOVVI] Erro no onSuccess do GPS:", err);
        setGpsState("unavailable");
        gpsStateRef.current = "unavailable";
      }
    };

    const tryLowAccuracy = () => {
      if (import.meta.env.DEV) console.log("[MOVVI] Tentativa 2 — enableHighAccuracy:false");
      try {
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          (err) => {
            gpsRequestInFlightRef.current = false;
            console.error("[MOVVI] Erro (low accuracy):", err);
            void logGpsTelemetry("getcurrentposition_error", { code: err.code, message: err.message, extra: { phase: "low_accuracy" } });
            setGpsState("denied");
            gpsStateRef.current = "denied";
            if (err.code === err.PERMISSION_DENIED) {
              setGpsErrorMsg("Permissão de localização negada.");
            } else {
              setGpsErrorMsg(
                "Não foi possível obter sua localização. Você pode digitar a origem manualmente ou tentar novamente.",
              );
            }
          },
          { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
        );
      } catch (e) {
        gpsRequestInFlightRef.current = false;
        console.error("[MOVVI] Falha 2ª tentativa:", e);
        fail("Não foi possível obter sua localização. Use a localização manual.");
      }
    };

    try {
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err) => {
          if (import.meta.env.DEV) console.warn("[MOVVI] Erro (high accuracy):", err);
          void logGpsTelemetry("getcurrentposition_error", { code: err.code, message: err.message, extra: { phase: "high_accuracy" } });
          if (err.code === err.PERMISSION_DENIED) {
            gpsRequestInFlightRef.current = false;
            setGpsState("denied");
            gpsStateRef.current = "denied";
            setGpsErrorMsg("Permissão de localização negada.");
            return;
          }
          // Timeout ou POSITION_UNAVAILABLE → tenta de novo sem alta precisão.
          tryLowAccuracy();
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
      );
    } catch (e) {
      console.error("[MOVVI] Falha ao iniciar geolocalização:", e);
      tryLowAccuracy();
    }
  }, []);


  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);



  const setManualLocation = useCallback((p: LatLng) => {
    if (!isBrazilCoordinate(p.lat, p.lng)) {
      if (import.meta.env.DEV) console.warn("[MOVVI] Origem manual fora do Brasil — aceitando assim mesmo.", p);
    }
    if (import.meta.env.DEV) console.log("[MOVVI] Origem manual selecionada", p);
    void logGpsTelemetry("manual_origin_set", { extra: { lat: p.lat, lng: p.lng } });
    setPosition(p);
    setPickupSource("manual");
    setGpsState("granted");
    gpsStateRef.current = "granted";
    setGpsErrorMsg("");
    try { toast.success("Ponto de partida confirmado."); } catch { /* noop */ }
  }, []);



  // Verifica a permissão de geolocalização ANTES de chamar getCurrentPosition.
  // - Se já estiver "granted", pedimos o GPS imediatamente (sem prompt do navegador).
  // - Se for "prompt" / Permissions API indisponível, NÃO pedimos nada agora —
  //   o usuário precisa tocar em "Permitir localização" para acionar o prompt
  //   oficial do navegador.
  // - Se for "denied", mostramos o fluxo manual sem nunca tentar de novo
  //   automaticamente (evita loops).
  useEffect(() => {
    try {
      purgeForeignMapCache();
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[MOVVI] purgeForeignMapCache falhou:", err);
    }
    let cancelled = false;
    if (import.meta.env.DEV) console.log("[MOVVI] Permissão de localização solicitada");

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setPermissionStatus("unsupported");
      setGpsState("unavailable");
      setGpsErrorMsg("Seu navegador não oferece geolocalização.");
      void logGpsTelemetry("geolocation_unsupported");
      return;
    }

    // Watchdog: se a Permissions API não responder em 1.5s (Safari/iOS antigo,
    // WebViews, navegadores embutidos), tratamos como "prompt" e disparamos o
    // pedido nativo de localização para garantir que o prompt apareça.
    const watchdog = window.setTimeout(() => {
      if (cancelled) return;
      setPermissionStatus((prev) => (prev === "checking" ? "prompt" : prev));
      if (gpsStateRef.current === "idle") {
        try { requestGps(); } catch (err) { if (import.meta.env.DEV) console.warn("[MOVVI] requestGps watchdog falhou:", err); }
      }
    }, 1500);

    const perms = (navigator as Navigator).permissions;
    if (!perms || typeof perms.query !== "function") {
      window.clearTimeout(watchdog);
      setPermissionStatus("prompt");
      try { requestGps(); } catch (err) { if (import.meta.env.DEV) console.warn("[MOVVI] requestGps fallback falhou:", err); }
      return () => { cancelled = true; };
    }

    let statusRef: PermissionStatus | null = null;
    perms
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        window.clearTimeout(watchdog);
        statusRef = status;
        const apply = (s: PermissionState) => {
          try {
            void logGpsTelemetry("permissions_query_ok", { extra: { state: s } });
            if (s === "granted") {
              if (import.meta.env.DEV) console.log("[MOVVI] Permissão de localização concedida");
              setPermissionStatus("granted");
              requestGps();
            } else if (s === "denied") {
              if (import.meta.env.DEV) console.log("[MOVVI] Permissão de localização negada");
              setPermissionStatus("denied");
              setGpsState("denied");
              setGpsErrorMsg("Permissão de localização negada.");
            } else {
              setPermissionStatus("prompt");
              requestGps();
            }
          } catch (err) {
            console.error("[MOVVI] Erro ao aplicar permissão de localização:", err);
          }
        };
        apply(status.state);
        status.onchange = () => apply(status.state);
      })
      .catch((err) => {
        if (cancelled) return;
        window.clearTimeout(watchdog);
        if (import.meta.env.DEV) console.warn("[MOVVI] permissions.query falhou:", err);
        void logGpsTelemetry("permissions_query_error", { message: (err as Error)?.message ?? String(err) });
        setPermissionStatus("prompt");
        try { requestGps(); } catch (e) { if (import.meta.env.DEV) console.warn("[MOVVI] requestGps catch falhou:", e); }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      if (statusRef) statusRef.onchange = null;
    };
  }, [requestGps]);



  /* ---------------------- autocomplete (Places API New) ---------------------- */
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = destinationText.trim();
    if (q.length < 2 || destination) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const places = (await google.maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
        if (!sessionTokenRef.current)
          sessionTokenRef.current = new places.AutocompleteSessionToken();
        const req: google.maps.places.AutocompleteRequest = {
          input: q,
          sessionToken: sessionTokenRef.current,
          language: "pt-BR",
          region: "br",
          includedRegionCodes: ["br"],
        };
        // `origin` (LatLng) é o sinal de bias suportado pelo Places API (New)
        // em fetchAutocompleteSuggestions — `locationBias` quebra a chamada
        // no SDK atual (TypeError em places_impl.js).
        if (position && Number.isFinite(position.lat) && Number.isFinite(position.lng)) {
          req.origin = { lat: position.lat, lng: position.lng };
        }
        const { suggestions: result } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        setSuggestions(
          result
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => !!p)
            .slice(0, 6)
            .map((p) => {
              // Places API New retorna FormattableText (objeto com .text);
              // toString() pode devolver vazio dependendo do build do SDK.
              const ft = (v: unknown): string =>
                v == null
                  ? ""
                  : typeof v === "string"
                  ? v
                  : typeof (v as { text?: unknown }).text === "string"
                  ? (v as { text: string }).text
                  : String(v);
              return {
                placeId: p.placeId,
                primary: ft(p.mainText) || ft(p.text),
                secondary: ft(p.secondaryText),
              };
            }),
        );
      } catch (e) {
        console.error("autocomplete error", e);
      }
    }, 220);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [destinationText, position, destination]);

  async function pickSuggestion(s: Suggestion) {
    setError(null);
    try {
      // Em vez de depender de Place.fetchFields (que em algumas builds do SDK
      // Places New não retorna `location` consistentemente), usamos o
      // Geocoder pelo placeId, que sempre devolve as coordenadas reais e
      // o endereço formatado.
      const geocoder = new google.maps.Geocoder();
      let loc: google.maps.LatLng | null = null;
      let formatted: string | null = null;
      try {
        const r = await geocoder.geocode({ placeId: s.placeId });
        const first = r.results?.[0];
        loc = first?.geometry?.location ?? null;
        formatted = first?.formatted_address ?? null;
      } catch (geocoderErr) {
        if (import.meta.env.DEV) console.warn("[MOVVI] Geocoder fallback falhou:", geocoderErr);
      }
      // Plano B: tentar Places New caso o Geocoder tenha retornado vazio.
      if (!loc) {
        try {
          const places = (await google.maps.importLibrary(
            "places",
          )) as google.maps.PlacesLibrary;
          const place = new places.Place({ id: s.placeId });
          await place.fetchFields({
            fields: ["location", "formattedAddress"],
          });
          loc = place.location ?? null;
          formatted = formatted ?? place.formattedAddress ?? null;
        } catch (placesErr) {
          if (import.meta.env.DEV) console.warn("[MOVVI] Places.fetchFields falhou:", placesErr);
        }
      }
      if (!loc) throw new Error("Local sem coordenadas.");
      const point: LatLng = { lat: loc.lat(), lng: loc.lng() };
      const label = formatted ?? `${s.primary} ${s.secondary}`.trim();
      setDestination({ point, label });
      setDestinationText(label);
      setSuggestions([]);
      sessionTokenRef.current = null;
      pushRecent({ placeId: s.placeId, label: s.primary, secondary: s.secondary });
      sheetRef.current?.snapTo(50);
      searchInputRef.current?.blur();
      await calcRoute(point);
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[MOVVI] pickSuggestion falhou:", e);
      setError(e instanceof Error ? e.message : "Falha ao buscar o local.");
    }
  }

  async function calcRoute(dest: LatLng) {
    // REGRA: a origem é SEMPRE as coordenadas reais do GPS. Texto de endereço
    // serve apenas para exibição — nunca como origem da rota.
    if (
      !position ||
      !Number.isFinite(position.lat) ||
      !Number.isFinite(position.lng) ||
      !isBrazilCoordinate(position.lat, position.lng) ||
      !dest ||
      !Number.isFinite(dest.lat) ||
      !Number.isFinite(dest.lng) ||
      !isBrazilCoordinate(dest.lat, dest.lng)
    ) {
      setError(
        "Não foi possível calcular a rota. Confirme a localização de origem e destino.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    setRoute(null);
    setSelectedCategoryKey(null);
    setPassengerUiStage("route_preview");
    try {
      const result = await callComputeRoute({
        data: {
          origin: { lat: position.lat, lng: position.lng },
          destination: { lat: dest.lat, lng: dest.lng },
        },
      });
      if (import.meta.env.DEV) console.log("[MOVVI UI] rota calculada:", result);
      setRoute(result);
      setPassengerUiStage("route_preview");
      sheetRef.current?.snapTo(50);
      if (mapRef.current) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(position);
        bounds.extend(dest);
        mapRef.current.fitBounds(bounds, { top: 90, bottom: Math.round(window.innerHeight * 0.5) + 16, left: 48, right: 48 });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao calcular rota.");
    } finally {
      setBusy(false);
    }
  }

  function clearDestination() {
    setDestination(null);
    setDestinationText("");
    setRoute(null);
    setError(null);
    setSelectedCategoryKey(null);
    setPassengerUiStage("selecting_destination");
    setSuggestions([]);
    sheetRef.current?.snapTo(24);
    if (mapRef.current && position) {
      smoothPanZoom(mapRef.current, position, 16, 700);
    }
  }

  async function submitRide() {
    if (!position || !destination || !route) return;
    if (!selectedUiCategory) {
      setError("Escolha uma categoria antes de solicitar a MOVVI.");
      setPassengerUiStage("selecting_category");
      sheetRef.current?.snapTo(50);
      return;
    }
    if (
      !isBrazilCoordinate(position.lat, position.lng) ||
      !isBrazilCoordinate(destination.point.lat, destination.point.lng)
    ) {
      setError(
        "Não foi possível calcular a rota. Confirme a localização de origem e destino.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const km = route.distanceMeters / 1000;
      const min = route.durationSeconds / 60;
      const fare = estimateFare(selectedUiCategory.backend, km, min, tariffs);
      // Texto da origem — apenas para exibição. As coordenadas reais é que
      // vão para o cálculo/rastreio. Se o Google não tiver nome, usamos as
      // coordenadas como rótulo.
      const originLabel =
        geo?.pickupLabel ||
        geo?.friendly ||
        geo?.region ||
        "Localização atual";
      const { rideId: newId } = await callRequestRide({
        data: {
          origin: { lat: position.lat, lng: position.lng },
          origin_name: originLabel,
          destination: { lat: destination.point.lat, lng: destination.point.lng },
          destination_name: destination.label,
          category: selectedUiCategory.backend,
          distance_km: Math.round(km * 100) / 100,
          duration_min: Math.round(min),
          estimated_price: fare,
          pickup_label: geo?.pickupLabel ?? null,
          pickup_short_label: geo?.pickupShortLabel ?? null,
          pickup_address: geo?.address ?? null,
          pickup_place_id: geo?.nearestPoiPlaceId ?? null,
          pickup_source: pickupSource,
        },
      });
      setRideId(newId);
      // Payment method is informational (MOVVI does not process ride payments).
      try {
        await supabase.from("rides").update({ payment_method: paymentMethod }).eq("id", newId);
      } catch { /* ignore — column is optional metadata */ }
      setPassengerUiStage("searching_driver");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao solicitar corrida.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------- realtime ---------------------- */
  useEffect(() => {
    if (!rideId) return;
    let active = true;
    let pollTimer: number | null = null;
    let subscribed = false;

    const load = async (tag: string) => {
      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .eq("id", rideId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        if (import.meta.env.DEV) console.warn("[MOVVI PASSAGEIRO] erro ao recarregar corrida:", tag, error.message);
        return;
      }
      if (data) {
        setRide((prev) => {
          if (prev && prev.id === data.id && prev.status !== data.status) {
            if (import.meta.env.DEV) console.log("[MOVVI PASSAGEIRO] status atualizou:", prev.status, "→", data.status);
          }
          return data;
        });
      }
    };

    const stopPolling = () => {
      if (pollTimer != null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    const startPolling = () => {
      if (pollTimer != null || !active) return;
      if (import.meta.env.DEV) console.log("[MOVVI PASSAGEIRO] polling de segurança da corrida ativo");
      pollTimer = window.setInterval(() => { void load("poll"); }, 3500);
    };

    void load("init");
    startPolling();

    const ch = supabase
      .channel(`ride-${rideId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` },
        (p) => {
          const next = p.new as RideRow;
          if (import.meta.env.DEV) console.log("[MOVVI PASSAGEIRO] realtime UPDATE rides:", next.id, "status=", next.status);
          setRide(next);
        },
      )
      .subscribe((status) => {
        if (import.meta.env.DEV) console.log("[MOVVI PASSAGEIRO] canal ride-" + rideId + " status:", status);
        if (status === "SUBSCRIBED") {
          subscribed = true;
          // recarrega para capturar updates ocorridos durante o handshake;
          // o polling de segurança permanece ativo para não deixar o passageiro preso em "procurando".
          void load("subscribed");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          subscribed = false;
          startPolling();
        }
      });

    // Só liga polling se o canal não ficou SUBSCRIBED em 5s.
    const handshakeGuard = window.setTimeout(() => {
      if (!subscribed) startPolling();
    }, 5000);

    // Rede de segurança: re-sincroniza ao retomar a aba
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (import.meta.env.DEV) console.log("[MOVVI PASSAGEIRO] aba visível — ressincronizando corrida");
        void load("visibility");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearTimeout(handshakeGuard);
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
      supabase.removeChannel(ch);
    };
  }, [rideId]);


  /* ---- Re-despacho periódico enquanto a corrida está procurando motorista ---- */
  const [dispatchDiag, setDispatchDiag] = useState<any>(null);
  const [noDriversAvailable, setNoDriversAvailable] = useState(false);
  useEffect(() => {
    if (!ride || ride.status !== "procurar_motorista") {
      setNoDriversAvailable(false);
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    let emptyStreak = 0;
    const tick = async () => {
      if (cancelled) return;
      try {
        const r = await callRedispatch({ data: { rideId: ride.id } });
        if (import.meta.env.DEV) console.log("[MOVVI PASSAGEIRO] re-despacho:", r);
        const c = (r as { candidates?: number }).candidates ?? 0;
        const offered = (r as { skipped?: string | null }).skipped === "already_offered";
        if (!offered && c === 0) {
          emptyStreak += 1;
        } else {
          emptyStreak = 0;
        }
        if (!cancelled) setNoDriversAvailable(emptyStreak >= 3);
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[MOVVI PASSAGEIRO] re-despacho falhou:", (e as Error).message);
      }
      if (DEV_MODE || isDevelopmentEnvironment()) {
        try {
          const diag = await callDiagnose({ data: { rideId: ride.id } });
          if (!cancelled) setDispatchDiag(diag);
        } catch { /* silencioso */ }
      }
      if (!cancelled) timer = window.setTimeout(tick, 5000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [ride?.id, ride?.status, callRedispatch, callDiagnose]);


  useEffect(() => {
    const driverId = ride?.driver_id;
    if (!driverId) {
      setDriverInfo(null);
      return;
    }
    let cancelled = false;
    let pollTimer: number | null = null;
    let subscribed = false;

    // Passageiro lê motorista pela visão pública (apenas motoristas online,
    // sem PII sensível). RLS no `drivers` impede leitura direta por
    // outros usuários — por isso usamos `driver_public_locations`.
    const load = () => {
      supabase
        .from("driver_public_locations" as never)
        .select("*")
        .eq("user_id", driverId)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data) {
            setDriverInfo((prev) => ({ ...(prev ?? (data as DriverRow)), ...(data as DriverRow) }));
          }
        });
    };
    const stopPolling = () => {
      if (pollTimer != null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    const startPolling = () => {
      if (pollTimer != null || cancelled) return;
      if (import.meta.env.DEV) console.log("[MOVVI PASSAGEIRO] fallback polling motorista (realtime indisponível)");
      pollTimer = window.setInterval(load, 5000);
    };

    load();

    const ch = supabase
      .channel(`driver-track-${driverId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "driver_public_locations",
          filter: `user_id=eq.${driverId}`,
        },
        (p) => {
          const next = p.new as DriverRow;
          setDriverInfo((prev) => ({ ...(prev ?? next), ...next }));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscribed = true;
          stopPolling();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          subscribed = false;
          startPolling();
        }
      });

    const handshakeGuard = window.setTimeout(() => {
      if (!subscribed) startPolling();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(handshakeGuard);
      stopPolling();
      supabase.removeChannel(ch);
    };
  }, [ride?.driver_id]);

  function resetRide() {
    setRideId(null);
    setRide(null);
    setDriverInfo(null);
    setRatingStars(5);
    setRatingComment("");
    clearDestination();
  }

  async function cancelRide() {
    if (!ride) return;
    if (ride.status === "em_viagem") {
      toast.info("Viagem em andamento", {
        description: "Para encerrar, fale com o motorista ou suporte.",
      });
      return;
    }
    try {
      await callCancelByPassenger({ data: { rideId: ride.id } });
      toast.success("Corrida cancelada");
    } catch (err) {
      console.error("[MOVVI] cancelarPeloPassageiro falhou:", err);
      toast.error("Não foi possível cancelar agora", {
        description: err instanceof Error ? err.message : undefined,
      });
      return;
    }
    resetRide();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  function recenter() {
    autoFollowRef.current = true;
    if (mapRef.current && position) {
      smoothPanZoom(mapRef.current, position, 16, 650);
    }
  }


  function focusSearch() {
    sheetRef.current?.snapTo(88);
    setTimeout(() => searchInputRef.current?.focus(), 220);
  }

  const polyPath = useMemo(
    () => (route ? decodePolyline(route.encodedPolyline) : []),
    [route],
  );

  // Centro estável do mapa — congelado na primeira coordenada válida para
  // evitar jitter por atualizações contínuas do GPS. O follow ativo usa
  // panTo controlado abaixo.
  const [stableInitialCenter, setStableInitialCenter] = useState<LatLng | null>(null);
  useEffect(() => {
    if (!stableInitialCenter && position && isBrazilCoordinate(position.lat, position.lng)) {
      setStableInitialCenter({ lat: position.lat, lng: position.lng });
    }
  }, [position, stableInitialCenter]);
  const center = stableInitialCenter ?? BRAZIL_CENTER;
  const stableZoom = stableInitialCenter ? 16 : 5;

  // Auto-follow do passageiro com throttle + zona morta (anti-shake).
  const autoFollowRef = useRef(true);
  const lastFollowAtRef = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onDragStart = () => { autoFollowRef.current = false; };
    const listener = google.maps.event.addListener(map, "dragstart", onDragStart);
    return () => { google.maps.event.removeListener(listener); };
  }, [stableInitialCenter]);
  useEffect(() => {
    if (!position || !mapRef.current || !autoFollowRef.current) return;
    // Durante uma corrida ativa o passageiro normalmente está parado;
    // não faz sentido ficar reposicionando o mapa em cima dele e brigar
    // com a visualização do motorista chegando.
    if (ride && (ride.status === "motorista_a_caminho" || ride.status === "motorista_chegou" || ride.status === "em_viagem")) return;
    const now = Date.now();
    if (now - lastFollowAtRef.current < 1500) return;
    const c = mapRef.current.getCenter();
    if (c) {
      const meters = distanceMeters({ lat: c.lat(), lng: c.lng() }, position);
      if (meters < 15) return;
    }
    lastFollowAtRef.current = now;
    mapRef.current.panTo(position);
  }, [position?.lat, position?.lng, ride?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastPassengerFitKeyRef = useRef<string | null>(null);


  const phase = ride?.status;

  const rideDriverInfo = useMemo<DriverRow | null>(() => {
    // Snapshot do motorista gravado na corrida tem prioridade — é o que garante
    // que o passageiro veja foto/nome/veículo mesmo se a leitura de drivers falhar.
    const snapshotPhoto = (ride as { driver_photo_url?: string | null } | null)?.driver_photo_url ?? null;
    if (!driverInfo && !ride?.driver_id && !ride?.driver_name) return null;

    const vehicleSrc = ride?.driver_vehicle ?? "";
    const vehicleParts = vehicleSrc.split(" • ").map((p) => p.trim()).filter(Boolean);
    const vehiclePlate = vehicleParts.length >= 1 ? vehicleParts[vehicleParts.length - 1] : "";
    const vehicleModel = vehicleParts.length >= 2 ? vehicleParts[vehicleParts.length - 2] : vehicleSrc;
    const vehicleColor = vehicleParts.length >= 3 ? vehicleParts[0] : "";

    return {
      user_id: driverInfo?.user_id ?? ride?.driver_id ?? "",
      name: driverInfo?.name ?? ride?.driver_name ?? "Motorista MOVVI",
      phone: driverInfo?.phone ?? ride?.driver_phone ?? "",
      current_lat: driverInfo?.current_lat ?? ride?.driver_lat ?? null,
      current_lng: driverInfo?.current_lng ?? ride?.driver_lng ?? null,
      current_heading: driverInfo?.current_heading ?? null,
      current_speed: driverInfo?.current_speed ?? null,
      rating: driverInfo?.rating ?? 5,
      selfie_url: driverInfo?.selfie_url ?? null,
      photo_url: driverInfo?.photo_url ?? snapshotPhoto,
      vehicle_color: driverInfo?.vehicle_color ?? vehicleColor,
      vehicle_model: driverInfo?.vehicle_model ?? vehicleModel,
      vehicle_plate: driverInfo?.vehicle_plate ?? vehiclePlate,
    } as DriverRow;
  }, [driverInfo, ride]);

  // FitBounds ÚNICO por transição de fase: quando o motorista aceita
  // e quando chega no ponto de embarque, enquadra passageiro + motorista
  // (ou origem + destino na viagem). Não roda novamente a cada GPS.
  useEffect(() => {
    if (!ride || !mapRef.current) return;
    const driverLat = rideDriverInfo?.current_lat;
    const driverLng = rideDriverInfo?.current_lng;
    const fitKey = `${ride.id}-${ride.status}`;
    if (lastPassengerFitKeyRef.current === fitKey) return;
    let a: LatLng | null = null;
    let b: LatLng | null = null;
    if (ride.status === "motorista_a_caminho" || ride.status === "motorista_chegou") {
      // passageiro + motorista aceito
      if (typeof driverLat === "number" && typeof driverLng === "number" &&
          isBrazilCoordinate(driverLat, driverLng)) {
        const pax = position && isBrazilCoordinate(position.lat, position.lng)
          ? position
          : (isBrazilCoordinate(ride.origin_lat, ride.origin_lng)
              ? { lat: ride.origin_lat, lng: ride.origin_lng }
              : null);
        a = pax;
        b = { lat: driverLat, lng: driverLng };
      }
    } else if (ride.status === "em_viagem") {
      // motorista + destino
      if (typeof driverLat === "number" && typeof driverLng === "number" &&
          isBrazilCoordinate(driverLat, driverLng) &&
          isBrazilCoordinate(ride.destination_lat, ride.destination_lng)) {
        a = { lat: driverLat, lng: driverLng };
        b = { lat: ride.destination_lat, lng: ride.destination_lng };
      }
    }
    if (!a || !b) return;
    lastPassengerFitKeyRef.current = fitKey;
    autoFollowRef.current = false;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(a); bounds.extend(b);
    // Padding enxuto: o cartão fixo do código ocupa ~140px no topo e o
    // bottom sheet colapsado ocupa ~32vh. Sem inflar o viewport.
    mapRef.current.fitBounds(bounds, {
      top: 150,
      bottom: Math.round(window.innerHeight * 0.28) + 16,
      left: 48,
      right: 48,
    });
  }, [ride?.id, ride?.status, rideDriverInfo?.current_lat, rideDriverInfo?.current_lng, position]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------- GPS initial loading ---------------------- */
  // Padrão Uber/99/InDrive:
  //  1) Enquanto a Permissions API ainda responde, mostramos um loader curto.
  //  2) Se a permissão é "prompt" / desconhecida → tela explicativa com botão
  //     "Permitir localização" (só aí chamamos getCurrentPosition).
  //  3) Se foi negada / indisponível → tela com retry + localização manual.
  //  4) Se concedida → o app abre normalmente assim que as coordenadas chegam.
  if (!position && permissionStatus === "checking") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Preparando a MOVVI...</p>
        </div>
      </div>
    );
  }

  // Quando a permissão já está concedida e estamos só esperando o GPS responder,
  // mostramos um loader curto em vez da tela de "permitir localização".
  if (
    !position &&
    permissionStatus === "granted" &&
    gpsState !== "denied" &&
    gpsState !== "unavailable"
  ) {
    return (
      <div className="mx-auto flex h-[100dvh] w-full max-w-[430px] items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground inline-flex items-baseline gap-0.5">
            Obtendo sua localização
            <span className="inline-flex gap-0.5 ml-1">
              <span className="animate-movvi-dots">.</span>
              <span className="animate-movvi-dots [animation-delay:150ms]">.</span>
              <span className="animate-movvi-dots [animation-delay:300ms]">.</span>
            </span>
          </p>
        </div>
      </div>
    );
  }

  // Permissão pendente (prompt) e ainda não tentamos nada → tela de explicação.
  // Se o GPS falhou ou foi negado mas o usuário já interagiu, NÃO bloqueamos
  // mais a tela: deixamos o app abrir com o mapa centralizado no Brasil e
  // permitimos digitar a origem manualmente.
  if (!position && (permissionStatus === "prompt" || permissionStatus === "unsupported") && gpsState === "idle") {
    return (
      <GpsDeniedScreen
        mode="prompt"
        onRetry={requestGps}
        onHome={() => { void navigate({ to: "/" }); }}
        onManual={setManualLocation}
        errorMessage={gpsErrorMsg}
        requesting={false}
      />
    );
  }

  // Permissão negada / indisponível e ainda SEM origem: mostra a tela dedicada
  // com o seletor manual de endereço (origem). O usuário pode escolher cidade
  // ou endereço para liberar o mapa e calcular a rota normalmente.
  if (!position && (permissionStatus === "denied" || gpsState === "denied" || gpsState === "unavailable")) {
    return (
      <GpsDeniedScreen
        mode="denied"
        onRetry={requestGps}
        onHome={() => { void navigate({ to: "/" }); }}
        onManual={setManualLocation}
        errorMessage={gpsErrorMsg || "Não conseguimos acessar sua localização. Selecione sua origem manualmente abaixo."}
        requesting={gpsState === "requesting"}
      />
    );
  }
  const gpsFailed = (gpsState === "denied" || gpsState === "unavailable") && !!gpsErrorMsg;




  const inPreview = DEV_MODE && isDevelopmentEnvironment();
  return (
    <div className="relative mx-auto h-[100dvh] w-full max-w-[430px] overflow-hidden bg-background text-foreground shadow-2xl sm:my-0">

      {inPreview && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center px-3 pt-[max(env(safe-area-inset-top),0px)]"
        >
          <div className="pointer-events-auto mt-2 max-w-[92%] rounded-full bg-amber-500/15 px-3 py-1.5 text-center text-[11px] font-medium text-amber-300 ring-1 ring-amber-500/30 backdrop-blur">
            Ambiente de teste detectado. A localização real pode não funcionar aqui.
          </div>
        </div>
      )}
      {DEV_MODE && gpsDiag && (
        <div className="pointer-events-auto absolute left-2 top-14 z-50 max-w-[280px] rounded-lg bg-black/85 p-3 font-mono text-[10px] leading-tight text-white ring-1 ring-white/20 backdrop-blur">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className={`font-bold ${gpsDiag.status === "ok" ? "text-emerald-400" : "text-red-400"}`}>
              {gpsDiag.status === "ok" ? "🛰️ GPS OK" : "⛔ GPS REJEITADO"}
            </span>
            <button
              onClick={() => setGpsDiag(null)}
              className="rounded px-1.5 text-white/60 hover:text-white"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
          {gpsDiag.status === "rejected-outside-br" ? (
            <div className="space-y-0.5">
              <div>Latitude recebida: {gpsDiag.lat.toFixed(6)}</div>
              <div>Longitude recebida: {gpsDiag.lng.toFixed(6)}</div>
              <div>Accuracy: {gpsDiag.accuracy != null ? `${Math.round(gpsDiag.accuracy)} m` : "—"}</div>
              <div>Motivo: {gpsDiag.reason}</div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div>Latitude: {gpsDiag.lat.toFixed(6)}</div>
              <div>Longitude: {gpsDiag.lng.toFixed(6)}</div>
              <div>Accuracy: {gpsDiag.accuracy != null ? `${Math.round(gpsDiag.accuracy)} m` : "—"}</div>
              <div>Altitude: {gpsDiag.altitude != null ? `${gpsDiag.altitude.toFixed(1)} m` : "—"}</div>
              <div>Heading: {gpsDiag.heading != null ? `${gpsDiag.heading.toFixed(1)}°` : "—"}</div>
              <div>Speed: {gpsDiag.speed != null ? `${gpsDiag.speed.toFixed(2)} m/s` : "—"}</div>
              <div>Timestamp: {new Date(gpsDiag.timestamp).toISOString()}</div>
            </div>
          )}
          <div className="mt-2 border-t border-white/10 pt-1.5 text-white/60">
            <div className="truncate">UA: {typeof navigator !== "undefined" ? navigator.userAgent : ""}</div>
            <div>Platform: {typeof navigator !== "undefined" ? navigator.platform : ""}</div>
            <div>secureContext: {typeof window !== "undefined" && window.isSecureContext ? "true" : "false"}</div>
            <div className="truncate">origin: {typeof document !== "undefined" ? document.location.origin : ""}</div>
          </div>
        </div>
      )}
      {/* MAPA — sempre presente, ~70% da tela */}

      <div className="absolute inset-0">
        <MovviMap
          center={center}
          zoom={stableZoom}
          height="100%"
          themeOverride={ride && (ride.status === "motorista_a_caminho" || ride.status === "motorista_chegou" || ride.status === "em_viagem") ? "light" : undefined}
          onLoad={(m) => {
            mapRef.current = m;
          }}
        >
          {position && (
            <>
              <Circle
                center={position}
                radius={Math.max(40, gpsAccuracy ?? 60)}
                options={{
                  strokeColor: "#3b82f6",
                  strokeOpacity: 0.32,
                  strokeWeight: 1,
                  fillColor: "#3b82f6",
                  fillOpacity: 0.1,
                  clickable: false,
                }}
              />
              <PassengerLocationMarker position={position} />
            </>
          )}

          {/* Círculo de raio de busca durante "procurar motoristas" */}
          {ride && ride.status === "procurar_motorista" && position && (
            <SearchRadiusCircle center={position} />
          )}

          {(!ride || ride.status === "procurar_motorista") &&
            drivers.map((d) => (
              <NearbyDriverMarker
                key={d.user_id}
                position={{ lat: d.current_lat, lng: d.current_lng }}
              />
            ))}

          {destination && (
            <PlacePinMarker position={destination.point} color="#ef4444" zIndexBase={9990} />
          )}

          {/* Marcador do motorista durante a corrida (rastreamento em tempo real) */}
          {ride &&
            (ride.status === "motorista_a_caminho" ||
              ride.status === "motorista_chegou" ||
              ride.status === "em_viagem") &&
            rideDriverInfo &&
            typeof rideDriverInfo.current_lat === "number" &&
            typeof rideDriverInfo.current_lng === "number" && (
              <InterpolatedDriverMarker
                position={{ lat: rideDriverInfo.current_lat, lng: rideDriverInfo.current_lng }}
                heading={rideDriverInfo.current_heading ?? 0}
                color="#2563eb"
              />
            )}


          {polyPath.length > 0 && (
            <>
              {/* Sombra suave para profundidade */}
              <Polyline
                path={polyPath}
                options={{
                  strokeColor: "#000000",
                  strokeOpacity: 0.18,
                  strokeWeight: 16,
                  geodesic: true,
                  zIndex: 1,
                }}
              />
              {/* Casing branco para contraste em qualquer tema */}
              <Polyline
                path={polyPath}
                options={{
                  strokeColor: "#ffffff",
                  strokeOpacity: 1,
                  strokeWeight: 11,
                  geodesic: true,
                  zIndex: 2,
                }}
              />
              {/* Núcleo verde MOVVI */}
              <Polyline
                path={polyPath}
                options={{
                  strokeColor: "#8DD92B",
                  strokeOpacity: 1,
                  strokeWeight: 7,
                  geodesic: true,
                  zIndex: 3,
                }}
              />
            </>
          )}

        </MovviMap>

      </div>

      {/* TOP BAR — premium: saudação + status dinâmico */}
      <PremiumTopBar
        userName={userName}
        gpsState={gpsState}
        drivers={nearbyCount}
        searching={!!ride && ride.status === "procurar_motorista"}
        onLogout={handleLogout}
        onOpenMenu={() => setSideMenuOpen(true)}
      />

      <PassengerSideMenu
        open={sideMenuOpen}
        onOpenChange={setSideMenuOpen}
        onLogout={handleLogout}
      />

      {/* Floating recenter — 56px, glass, MOVVI DS */}
      <div className="pointer-events-none absolute right-4 z-30" style={{ bottom: "calc(24vh + 16px)" }}>
        <button
          onClick={recenter}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border border-border/60 bg-card/90 text-[#76C139] shadow-[0_12px_28px_-14px_rgba(15,23,42,0.35)] backdrop-blur-xl transition active:scale-[0.92] hover:scale-105"
          aria-label="Recentralizar"
        >
          <Crosshair className="h-[22px] w-[22px]" strokeWidth={2} />
        </button>
      </div>

      {/* BOTTOM SHEET — novo, próprio do MOVVI */}
      {!ride && (
        <MovviSheet ref={sheetRef} snaps={[24, 50, 88]} initial={24}>
          <SheetContent
            geo={geo}
            addressStatus={addressStatus}
            hasPosition={!!position}
            position={position}
            onOpenAddressDetails={() => setAddressDetailsOpen(true)}
            destination={destination}
            destinationText={destinationText}
            setDestinationText={setDestinationText}
            suggestions={suggestions}
            onFocusSearch={focusSearch}
            onPick={pickSuggestion}
            onPickFavorite={async (point, label) => {
              setDestination({ point, label });
              setDestinationText(label);
              setSuggestions([]);
              sheetRef.current?.snapTo(50);
              searchInputRef.current?.blur();
              await calcRoute(point);
            }}
            onClearDestination={clearDestination}
            route={route}
            uiStage={passengerUiStage}
            setUiStage={setPassengerUiStage}
            busy={busy}
            error={error}
            reverseGeocodeFailureReason={reverseGeocodeFailureReason}
            selectedCategoryKey={selectedCategoryKey}
            setSelectedCategoryKey={setSelectedCategoryKey}
            driversCount={nearbyCount}
            tariffs={tariffs}
            onSubmit={submitRide}
            searchInputRef={searchInputRef}
            gpsFailed={gpsFailed}
            gpsErrorMsg={gpsErrorMsg}
            gpsRequesting={gpsState === "requesting"}
            onRetryGps={requestGps}
            onExpandSheet={(p) => sheetRef.current?.snapTo(p)}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
          />
        </MovviSheet>
      )}

      {/* Sheet de ações para o Local de partida */}
      {addressDetailsOpen && (
        <OriginActionsSheet
          geo={geo}
          position={position}
          gpsRequesting={gpsState === "requesting"}
          onClose={() => setAddressDetailsOpen(false)}
          onUseGps={() => {
            setAddressDetailsOpen(false);
            requestGps();
          }}
          onPickOnMap={() => {
            setAddressDetailsOpen(false);
            setOriginPickCenter(position ?? BRAZIL_CENTER);
            setOriginPickOnMap(true);
            if (mapRef.current && position) {
              smoothPanZoom(mapRef.current, position, 17, 600);
            }
          }}
          onTypeAddress={() => {
            setAddressDetailsOpen(false);
            setOriginManualOpen(true);
          }}
        />
      )}

      {/* Seletor no mapa — overlay com crosshair fixo + botão confirmar */}
      {originPickOnMap && (
        <OriginMapPickerOverlay
          mapRef={mapRef}
          initialCenter={originPickCenter ?? position ?? BRAZIL_CENTER}
          onCancel={() => setOriginPickOnMap(false)}
          onConfirm={(p) => {
            setOriginPickOnMap(false);
            setManualLocation(p);
          }}
        />
      )}

      {/* Busca manual de endereço para a origem */}
      {originManualOpen && (
        <OriginManualSearchOverlay
          onCancel={() => setOriginManualOpen(false)}
          onConfirm={(p) => {
            setOriginManualOpen(false);
            setManualLocation(p);
          }}
        />
      )}


      {ride && ride.status === "procurar_motorista" && (
        <MovviSheet snaps={[22, 55, 88]} initial={22}>
          <SearchingPanel
            category={category}
            driversCount={nearbyCount}
            noDriversAvailable={noDriversAvailable}
            onCancel={cancelRide}
          />
        </MovviSheet>
      )}

      {(DEV_MODE || isDevelopmentEnvironment()) && ride && ride.status === "procurar_motorista" && dispatchDiag && (
        <div className="pointer-events-auto absolute left-2 top-20 z-50 max-w-[280px] rounded-lg bg-black/85 p-2 font-mono text-[10px] text-white ring-1 ring-white/20">
          <div className="mb-1 font-bold text-primary">[DEV] DISPATCH</div>
          <div>category: {dispatchDiag.ride?.category}</div>
          <div>offer_driver: {dispatchDiag.ride?.current_offer_driver_id ?? "—"}</div>
          <div>total: {dispatchDiag.totals?.total} · online: {dispatchDiag.totals?.online} · aprov: {dispatchDiag.totals?.aprovados}</div>
          <div>com GPS: {dispatchDiag.totals?.com_gps} · cat match: {dispatchDiag.totals?.categoria_match} · elegíveis: {dispatchDiag.totals?.elegiveis}</div>
          <div className="mt-1 border-t border-white/20 pt-1">
            {dispatchDiag.radii?.map((r: any) => (
              <div key={r.km}>raio {r.km}km → {r.count}</div>
            ))}
          </div>
          {dispatchDiag.drivers?.length > 0 && (
            <div className="mt-1 border-t border-white/20 pt-1">
              {dispatchDiag.drivers.slice(0, 5).map((d: any) => (
                <div key={d.user_id} className="truncate">
                  {d.name ?? d.user_id.slice(0, 6)} · {d.dist_km != null ? `${d.dist_km.toFixed(1)}km` : "?"} · {d.reasons.length ? d.reasons.join(",") : "OK"}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cartão FIXO do código de segurança — visível sobre tudo,
          enquanto o motorista está a caminho ou chegou, antes da viagem iniciar.
          Não fica escondido atrás do bottom sheet. */}
      {ride &&
        ride.safety_code &&
        (phase === "motorista_a_caminho" || phase === "motorista_chegou") && (
          <div
            className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-3"
            style={{ top: "calc(env(safe-area-inset-top) + 76px)" }}
          >
            <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-card/92 px-4 py-2.5 ring-1 ring-border/50 shadow-[0_10px_28px_-14px_rgba(0,0,0,0.55)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-400">
              <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/90">
                <Shield className="h-3 w-3 text-primary/80" strokeWidth={2} />
                Código de segurança
              </div>
              <div className="mt-1.5 flex items-center justify-center gap-1.5">
                {ride.safety_code.split("").map((d, i) => (
                  <span
                    key={i}
                    className="grid h-9 w-8 place-items-center rounded-lg bg-background/70 text-[20px] font-extrabold tabular-nums text-foreground ring-1 ring-border/70"
                  >
                    {d}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground/80">
                Informe ao motorista antes de iniciar a corrida.
              </p>
            </div>

          </div>
        )}

      {ride &&
        rideDriverInfo &&
        (phase === "motorista_a_caminho" ||
          phase === "motorista_chegou" ||
          phase === "em_viagem") && (
          <MovviSheet
            snaps={[26, 55, 92]}
            initial={26}
          >
            <DriverEnRoute
              ride={ride}
              driver={rideDriverInfo}
              onCancel={cancelRide}
              onOpenProfile={() => setDriverProfileOpen(true)}
            />
          </MovviSheet>
        )}


      {ride && phase === "finalizada" && !ride.passenger_rated_at && (
        <MovviSheet snaps={[58]} initial={58}>
          <div className="pt-2">
            <div className="text-center">
              <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary text-2xl">
                ✓
              </div>
              <h2 className="font-display text-lg font-bold">Viagem concluída</h2>
              {ride.final_price && (
                <p className="mt-1 text-xl font-bold text-primary">
                  {formatBRL(Number(ride.final_price))}
                </p>
              )}
              <p className="mt-4 text-sm font-semibold">
                Avalie {ride.driver_name ?? "o motorista"}
              </p>
              <div className="mt-2 flex items-center justify-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRatingStars(n)}
                    className="px-1 text-3xl"
                    aria-label={`${n} estrelas`}
                  >
                    <span className={n <= ratingStars ? "text-primary" : "text-muted-foreground/40"}>★</span>
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Comentário (opcional)"
              maxLength={500}
              rows={3}
              className="mt-4 w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {ratingError && (
              <div className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive ring-1 ring-destructive/30">
                {ratingError} Toque em <strong>Tentar novamente</strong> ou pule esta avaliação.
              </div>
            )}
            <button
              onClick={submitDriverRating}
              disabled={submittingRating}
              className="mt-4 w-full rounded-2xl bg-primary py-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 disabled:opacity-60"
            >
              {submittingRating ? "Enviando…" : (ratingError ? "Tentar novamente" : "Enviar avaliação")}
            </button>
            <button
              type="button"
              onClick={skipDriverRating}
              disabled={submittingRating}
              className="mt-2 w-full rounded-2xl bg-transparent py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              Pular avaliação
            </button>
          </div>
        </MovviSheet>
      )}

      {ride && phase === "finalizada" && ride.passenger_rated_at && (
        <MovviSheet snaps={[32]} initial={32}>
          <div className="pt-2 text-center">
            <div className="mx-auto mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary text-3xl">
              ✓
            </div>
            <h2 className="font-display text-xl font-bold">Avaliação enviada</h2>
            <p className="mt-1 text-sm text-muted-foreground">Obrigado por usar a MOVVI!</p>
            <button
              onClick={resetRide}
              className="mt-6 w-full rounded-2xl bg-primary py-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30"
            >
              Pedir outra corrida
            </button>
          </div>
        </MovviSheet>
      )}

      <DriverProfessionalProfileDialog
        open={driverProfileOpen}
        onOpenChange={setDriverProfileOpen}
        driverUserId={ride?.driver_id ?? rideDriverInfo?.user_id ?? null}
      />
    </div>
  );
}

/* ============================================================ */
/*                         SHEET CONTENT                        */
/* ============================================================ */

/* (Grupos antigos removidos — agora exibimos as 5 categorias flat conforme spec MOVVI.) */

function FavoritesStrip({ onPick }: { onPick: (point: LatLng, label: string) => void }) {
  const [items, setItems] = useState<FavoritePlace[]>([]);
  useEffect(() => {
    let alive = true;
    listFavorites()
      .then((r) => alive && setItems(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const navigate = useNavigate();

  return (
    <div className="-mx-1 mb-2 flex items-center gap-2 overflow-x-auto px-1 pb-1">
      {items.slice(0, 6).map((f) => {
        const Icon = f.kind === "home" ? HomeIcon : f.kind === "work" ? Briefcase : Heart;
        const color =
          f.kind === "home"
            ? "text-[#8DD92B]"
            : f.kind === "work"
              ? "text-blue-400"
              : "text-pink-400";
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onPick({ lat: f.lat, lng: f.lng }, f.address)}
            className="flex shrink-0 items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-2 text-xs font-semibold transition hover:border-primary/50"
          >
            <Icon className={`h-4 w-4 ${color}`} />
            <span className="max-w-[140px] truncate">{f.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => navigate({ to: "/passageiro/favoritos" })}
        className="flex shrink-0 items-center gap-2 rounded-full border border-dashed border-border/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
      >
        <Heart className="h-4 w-4" />
        <span>{items.length === 0 ? "Adicionar favoritos" : "Gerenciar"}</span>
      </button>
    </div>
  );
}

function SheetContent({
  geo,
  addressStatus,
  hasPosition,
  position,
  onOpenAddressDetails,
  destination,
  destinationText,
  setDestinationText,
  suggestions,
  onFocusSearch,
  onPick,
  onPickFavorite,
  onClearDestination,
  route,
  uiStage,
  setUiStage,
  busy,
  error,
  reverseGeocodeFailureReason,
  selectedCategoryKey,
  setSelectedCategoryKey,
  driversCount,
  tariffs,
  onSubmit,
  searchInputRef,
  gpsFailed,
  gpsErrorMsg,
  gpsRequesting,
  onRetryGps,
  onExpandSheet,
  paymentMethod,
  setPaymentMethod,
}: {
  geo: GeocodeResult | null;
  addressStatus: "idle" | "loading" | "resolved" | "failed";
  hasPosition: boolean;
  position: LatLng | null;
  onOpenAddressDetails: () => void;
  destination: { point: LatLng; label: string } | null;
  destinationText: string;
  setDestinationText: (s: string) => void;
  suggestions: Suggestion[];
  onFocusSearch: () => void;
  onPick: (s: Suggestion) => void;
  onPickFavorite: (point: LatLng, label: string) => void;
  onClearDestination: () => void;
  route: RouteResult | null;
  uiStage: PassengerUiStage;
  setUiStage: (stage: PassengerUiStage) => void;
  busy: boolean;
  error: string | null;
  reverseGeocodeFailureReason: string | null;
  selectedCategoryKey: string | null;
  setSelectedCategoryKey: (k: string | null) => void;
  driversCount: number;
  tariffs: TariffMap;
  onSubmit: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  gpsFailed: boolean;
  gpsErrorMsg: string;
  gpsRequesting: boolean;
  onRetryGps: () => void;
  onExpandSheet: (p: number) => void;
  paymentMethod: "dinheiro" | "pix" | "cartao_credito";
  setPaymentMethod: (m: "dinheiro" | "pix" | "cartao_credito") => void;
}) {
  const km = route ? route.distanceMeters / 1000 : 0;
  const min = route ? route.durationSeconds / 60 : 0;

  const uiCategories = useUiCategories();
  const selectedCategory = useMemo(
    () => uiCategories.find((c) => c.key === selectedCategoryKey) ?? null,
    [uiCategories, selectedCategoryKey],
  );
  const selectedFare = route && selectedCategory
    ? estimateFare(selectedCategory.backend, km, min, tariffs)
    : null;


  const isExact = geo?.precision === "exact";
  const rua = geo?.components.rua;
  const numero = geo?.components.numero;
  const bairro = geo?.components.bairro || geo?.components.povoado;
  const region = geo?.region || "";
  // Só exibimos rua/número como origem se o Google indicou ROOFTOP sem partial_match.
  // Caso contrário (APPROXIMATE/GEOMETRIC_CENTER/RANGE_INTERPOLATED) mostramos coords + referência.
  const streetLine = isExact && rua ? (numero ? `${rua}, ${numero}` : rua) : "";
  const pickupAddressLine =
    geo?.pickupLabel ||
    streetLine ||
    geo?.components?.rua ||
    geo?.components?.bairro ||
    geo?.components?.povoado ||
    geo?.components?.cidade ||
    geo?.friendly ||
    geo?.region ||
    geo?.address ||
    "";
  const pickupSubLine = geo?.pickupSubLabel || "";
  const hasApproxAddress = !!geo && !isExact;
  const showApprox = hasApproxAddress && hasPosition && !!position;
  const showDestinationInput = !destination || uiStage === "selecting_destination";

  return (
    <div className="pt-1">
      {/* Endereço atual — toque abre sheet de ações. Em caso de falha de GPS, mostra erro inline com retry. */}
      {gpsFailed ? (
        <div className="mb-2.5 flex w-full items-start gap-2.5 rounded-2xl bg-destructive/10 px-3 py-2.5 ring-1 ring-destructive/40">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-destructive/80 text-destructive-foreground">
            <MapPin className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-destructive leading-none">
              Localização indisponível
            </div>
            <div className="mt-0.5 text-[12px] leading-snug text-foreground/90">
              {gpsErrorMsg || "Não foi possível identificar sua localização."}
            </div>
          </div>
          <button
            type="button"
            onClick={onRetryGps}
            disabled={gpsRequesting}
            className="shrink-0 self-center rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground shadow-md shadow-primary/20 transition active:scale-95 disabled:opacity-60"
          >
            {gpsRequesting ? "..." : "Tentar novamente"}
          </button>
        </div>
      ) : addressStatus === "failed" && reverseGeocodeFailureReason ? (
        <div className="mb-2.5 w-full rounded-2xl bg-red-950/90 px-3 py-2.5 text-left ring-1 ring-red-500/70">
          <div className="text-[11px] font-black uppercase tracking-widest text-red-200">
            Reverse Geocoding failed
          </div>
          <div className="mt-1 break-words font-mono text-[11px] leading-snug text-red-100">
            {reverseGeocodeFailureReason}
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={onOpenAddressDetails}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenAddressDetails();
            }
          }}
          className="mb-2.5 flex w-full cursor-pointer items-center gap-2.5 rounded-2xl bg-primary/10 px-3 py-2 text-left ring-1 ring-primary/30 transition active:scale-[0.99] hover:bg-primary/15"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <MapPin className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-primary leading-none">
                📍 Seu local de embarque
              </div>
              {hasPosition && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-primary/80">
                  Ajustar local
                </span>
              )}
            </div>
            {addressStatus === "loading" && !pickupAddressLine ? (
              <div className="mt-0.5 truncate text-[12.5px] font-semibold leading-tight text-foreground">
                Localização atual
              </div>
            ) : pickupAddressLine ? (
              <>
                <div className="mt-0.5 truncate text-[13.5px] font-bold leading-tight text-foreground">
                  {pickupAddressLine}
                </div>
                {pickupSubLine && pickupSubLine !== pickupAddressLine ? (
                  <div className="truncate text-[12px] leading-tight text-foreground/80">
                    {pickupSubLine}
                  </div>
                ) : (
                  <>
                    {bairro && bairro !== pickupAddressLine && (
                      <div className="truncate text-[12px] leading-tight text-foreground/80">
                        {bairro}
                      </div>
                    )}
                    {region && region !== pickupAddressLine && (
                      <div className="truncate text-[11.5px] font-medium leading-tight text-muted-foreground">
                        {region}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : hasPosition ? (
              <div className="mt-0.5 truncate text-[12.5px] font-semibold leading-tight text-foreground">
                Localização atual
              </div>
            ) : (
              <div className="mt-0.5 truncate text-[12px] font-medium leading-tight text-muted-foreground">
                Endereço não identificado
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetryGps();
            }}
            disabled={gpsRequesting}
            aria-label="Atualizar GPS"
            title="Atualizar GPS"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/30 transition hover:bg-primary/30 active:scale-90 disabled:opacity-60"
          >
            <Crosshair className={`h-4 w-4 ${gpsRequesting ? "animate-spin" : ""}`} />
          </button>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      )}





      {/* "Para onde você vai?" — só aparece antes de confirmar um destino. */}
      {showDestinationInput && (
        <div className="mb-2">
          <div className="flex items-center gap-3 rounded-2xl bg-background/80 px-4 py-3.5 ring-1 ring-border focus-within:ring-primary/60">
            <Search className="h-5 w-5 shrink-0 text-primary" />
            <input
              ref={searchInputRef}
              value={destinationText}
              onChange={(e) => {
                if (destination) onClearDestination();
                setDestinationText(e.target.value);
              }}
              onFocus={onFocusSearch}
              placeholder="Para onde você vai?"
              className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:text-muted-foreground/80"
            />
            {destinationText && (
              <button
                type="button"
                onClick={() => {
                  setDestinationText("");
                  onClearDestination();
                  searchInputRef.current?.focus();
                }}
                aria-label="Limpar"
                className="rounded-full p-1 text-muted-foreground hover:bg-accent/30"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Favoritos rápidos */}
      {showDestinationInput && !destination && suggestions.length === 0 && (
        <FavoritesStrip onPick={onPickFavorite} />
      )}



      {/* Sugestões ao vivo */}
      {showDestinationInput && suggestions.length > 0 && !destination && (
        <ul className="-mx-1 mb-2 space-y-1">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-accent/30 active:scale-[0.99]"
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{s.primary}</span>
                  {s.secondary && (
                    <span className="truncate text-xs text-muted-foreground">
                      {s.secondary}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* SEM destino: dica discreta — sem categorias aqui */}
      {showDestinationInput && !destination && suggestions.length === 0 && (
        <div className="mb-1 mt-1 rounded-2xl border border-dashed border-border/70 bg-background/40 px-4 py-3 text-center">
          <p className="text-[12px] leading-snug text-muted-foreground">
            Informe o destino para ver as opções de{" "}
            <span className="font-semibold text-foreground">Corridas</span>,{" "}
            <span className="font-semibold text-foreground">Envios</span> e{" "}
            <span className="font-semibold text-foreground">Serviços</span>{" "}
            disponíveis no trajeto.
          </p>
        </div>
      )}

      {/* COM destino: fluxo em 4 etapas (estilo Uber/99/InDrive) */}
      {destination && (
        <StepFlow
          destination={destination}
          route={route}
          uiStage={uiStage}
          setUiStage={setUiStage}
          busy={busy}
          error={error}
          km={km}
          min={min}
          tariffs={tariffs}
          selectedCategoryKey={selectedCategoryKey}
          setSelectedCategoryKey={setSelectedCategoryKey}
          selectedCategory={selectedCategory}
          selectedFare={selectedFare}
          onClearDestination={onClearDestination}
          onSubmit={onSubmit}
          onExpandSheet={onExpandSheet}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Fluxo em etapas após o destino
// ──────────────────────────────────────────────────────────────

type StepFlowProps = {
  destination: { point: LatLng; label: string };
  route: RouteResult | null;
  uiStage: PassengerUiStage;
  setUiStage: (stage: PassengerUiStage) => void;
  busy: boolean;
  error: string | null;
  km: number;
  min: number;
  tariffs: TariffMap;
  selectedCategoryKey: string | null;
  setSelectedCategoryKey: (k: string | null) => void;
  selectedCategory: UiCategory | null;
  selectedFare: number | null;
  onClearDestination: () => void;
  onSubmit: () => void;
  onExpandSheet: (p: number) => void;
  paymentMethod: "dinheiro" | "pix" | "cartao_credito";
  setPaymentMethod: (m: "dinheiro" | "pix" | "cartao_credito") => void;
};

function StepFlow({
  destination,
  route,
  uiStage,
  setUiStage,
  busy,
  error,
  km,
  min,
  tariffs,
  selectedCategoryKey,
  setSelectedCategoryKey,
  selectedCategory,
  selectedFare,
  onClearDestination,
  onSubmit,
  onExpandSheet,
  paymentMethod,
  setPaymentMethod,
}: StepFlowProps) {
  const uiCategories = useUiCategories();
  useEffect(() => {
    if (route && uiStage === "selecting_destination") setUiStage("route_preview");
  }, [route, uiStage, setUiStage]);

  useEffect(() => {
    if (uiStage === "selecting_category" || uiStage === "confirming_request") onExpandSheet(50);
  }, [uiStage, onExpandSheet]);

  useEffect(() => {
    if (uiStage === "selecting_category") {
      if (import.meta.env.DEV) console.log("[MOVVI UI] exibindo categorias:", uiCategories.map((c) => c.label));
    }
  }, [uiStage, uiCategories]);

  // Preço de prévia (primeira categoria visível) para a Etapa 2
  const previewFare = route && uiCategories[0]
    ? estimateFare(uiCategories[0].backend, km, min, tariffs)
    : null;

  return (
    <div className="animate-in fade-in duration-200">
      {/* Cabeçalho do destino com voltar */}
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-background/60 px-2.5 py-2 ring-1 ring-border">
        {(uiStage === "selecting_category" || uiStage === "confirming_request") && (
          <button
            type="button"
            onClick={() => {
              if (uiStage === "confirming_request") setUiStage("selecting_category");
              else setUiStage("route_preview");
            }}
            aria-label="Voltar"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <MapPin className="h-4 w-4 shrink-0 text-destructive" />
        <span className="line-clamp-1 flex-1 text-[12.5px] font-medium">
          {destination.label}
        </span>
        <button
          onClick={onClearDestination}
          aria-label="Remover destino"
          className="rounded-full p-1 text-muted-foreground hover:bg-accent/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <p className="mb-2 rounded-xl bg-destructive/15 px-3 py-2 text-xs text-destructive-foreground ring-1 ring-destructive/40">
          {error}
        </p>
      )}

      {/* ETAPA 1 — calculando rota */}
      {(!route || busy) && uiStage === "route_preview" && (
        <div className="flex items-center justify-center gap-3 rounded-2xl bg-background/60 px-4 py-6 ring-1 ring-border">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm font-medium text-muted-foreground">
            Calculando rota...
          </span>
        </div>
      )}

      {/* ETAPA 2 — resumo em uma linha + Continuar */}
      {uiStage === "route_preview" && route && !busy && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
          <FareEstimateCard route={route} fare={previewFare} />
          <button
            type="button"
            onClick={() => {
              if (import.meta.env.DEV) console.log("[MOVVI UI] botão continuar clicado");
              setUiStage("selecting_category");
              onExpandSheet(50);
            }}
            className="w-full rounded-2xl bg-primary py-3.5 text-[14px] font-bold text-primary-foreground shadow-xl shadow-primary/25 transition active:scale-[0.98]"
          >
            Continuar
          </button>
        </div>
      )}

      {/* ETAPA 3 — carrossel horizontal de categorias */}
      {uiStage === "selecting_category" && route && (
        <RideCategorySelector
          route={route}
          km={km}
          min={min}
          tariffs={tariffs}
          selectedCategoryKey={selectedCategoryKey}
          onSelect={(c) => {
            if (import.meta.env.DEV) console.log("[MOVVI UI] categoria selecionada:", c.label);
            setSelectedCategoryKey(c.key);
            setUiStage("confirming_request");
          }}
        />
      )}

      {/* ETAPA 4 — confirmação + botão inline */}
      {uiStage === "confirming_request" && route && selectedCategory && selectedFare != null && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 space-y-2">
          <div className="flex items-center gap-2.5 rounded-2xl bg-primary/5 px-3 py-2.5 ring-1 ring-primary/30">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <selectedCategory.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[9.5px] font-semibold uppercase tracking-widest text-primary leading-none">
                Categoria
              </div>
              <div className="mt-0.5 truncate text-[14px] font-extrabold text-foreground leading-tight">
                {selectedCategory.label}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9.5px] font-semibold uppercase tracking-widest text-muted-foreground leading-none">
                Estimado
              </div>
              <div className="mt-0.5 text-[16px] font-extrabold text-foreground leading-none">
                {formatBRL(selectedFare)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const next = paymentMethod === "dinheiro" ? "pix" : paymentMethod === "pix" ? "cartao_credito" : "dinheiro";
              setPaymentMethod(next);
            }}
            className="flex w-full items-center gap-2.5 rounded-2xl bg-background/60 px-3 py-2.5 text-left ring-1 ring-border transition hover:bg-accent/20 active:scale-[0.99]"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <CreditCard className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[9.5px] font-semibold uppercase tracking-widest text-muted-foreground leading-none">
                Forma de pagamento (direto ao motorista)
              </div>
              <div className="mt-0.5 truncate text-[13px] font-bold text-foreground leading-tight">
                {paymentMethod === "dinheiro" ? "Dinheiro" : paymentMethod === "pix" ? "PIX" : "Cartão de crédito"}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>

          <RequestRideButton busy={busy} categoryLabel={selectedCategory.label} onSubmit={onSubmit} />
        </div>
      )}
    </div>
  );
}

function FareEstimateCard({ route, fare }: { route: RouteResult; fare: number | null }) {
  return (
    <div className="mb-3 rounded-2xl bg-primary/5 px-4 py-4 ring-1 ring-primary/30">
      <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-center">
        <span className="text-[15px] font-extrabold text-foreground">
          {fmtMin(route.durationSeconds)}
        </span>
        <span className="text-muted-foreground">•</span>
        <span className="text-[15px] font-extrabold text-foreground">
          {fmtKm(route.distanceMeters)}
        </span>
        <span className="text-muted-foreground">•</span>
        <span className="text-[15px] font-extrabold text-primary">
          {fare != null ? formatBRL(fare) : "Valor estimado"}
        </span>
      </div>
      <p className="mt-1.5 text-center text-[10.5px] text-muted-foreground">
        Valor estimado. Pode variar conforme rota e disponibilidade.
      </p>
    </div>
  );
}

function RideCategorySelector({
  route,
  km,
  min,
  tariffs,
  selectedCategoryKey,
  onSelect,
}: {
  route: RouteResult;
  km: number;
  min: number;
  tariffs: TariffMap;
  selectedCategoryKey: string | null;
  onSelect: (category: UiCategory) => void;
}) {
  const uiCategories = useUiCategories();
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        Escolha a categoria
      </div>
      <div className="-mx-4 mb-3 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex snap-x snap-mandatory gap-2.5 pb-1">
          {uiCategories.map((c) => {
            const active = c.key === selectedCategoryKey;
            const fare = estimateFare(c.backend, km, min, tariffs);
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onSelect(c)}
                aria-pressed={active}
                className={`flex w-[120px] shrink-0 snap-start flex-col items-center gap-1.5 rounded-2xl border-2 px-3 py-3 text-center transition active:scale-95 ${
                  active
                    ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                    : "border-border bg-background/60 hover:border-primary/40"
                }`}
              >
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl ${
                    active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[12.5px] font-bold leading-none">{c.label}</span>
                <span className="text-[10px] leading-none text-muted-foreground">
                  {fmtMin(route.durationSeconds)}
                </span>
                <span className="text-[12.5px] font-extrabold leading-none text-primary">
                  {formatBRL(fare)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RequestRideButton({
  busy,
  categoryLabel,
  onSubmit,
}: {
  busy: boolean;
  categoryLabel: string;
  onSubmit: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onSubmit}
      className="mt-1 w-full rounded-2xl bg-primary py-3.5 text-[15px] font-extrabold text-primary-foreground shadow-xl shadow-primary/30 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? "Solicitando..." : `Solicitar MOVVI ${categoryLabel}`}
    </button>
  );
}

function EnviosBlock({
  mode,
  setMode,
  size,
  setSize,
  fare,
}: {
  mode: "enviar" | "receber";
  setMode: (m: "enviar" | "receber") => void;
  size: "P" | "M" | "G";
  setSize: (s: "P" | "M" | "G") => void;
  fare: number | null;
}) {
  return (
    <div className="mb-2.5 space-y-2.5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("enviar")}
          className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-left transition ${
            mode === "enviar"
              ? "border-primary bg-primary/10"
              : "border-border bg-background/60"
          }`}
        >
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <span className="text-[12.5px] font-bold">Enviar pacote</span>
          </div>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            Você despacha no endereço atual
          </p>
        </button>
        <button
          type="button"
          onClick={() => setMode("receber")}
          className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-left transition ${
            mode === "receber"
              ? "border-primary bg-primary/10"
              : "border-border bg-background/60"
          }`}
        >
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <span className="text-[12.5px] font-bold">Receber pacote</span>
          </div>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            Coleta na origem indicada
          </p>
        </button>
      </div>

      <div>
        <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tamanho do pacote
        </div>
        <div className="flex gap-2">
          {(["P", "M", "G"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={`flex-1 rounded-xl border-2 py-2 text-[12px] font-bold transition ${
                size === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background/60 text-muted-foreground"
              }`}
            >
              {s === "P" ? "Pequeno" : s === "M" ? "Médio" : "Grande"}
            </button>
          ))}
        </div>
      </div>

      {fare != null && (
        <div className="flex items-center justify-between rounded-xl bg-background/60 px-3 py-2 ring-1 ring-border">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Valor estimado
          </span>
          <span className="text-base font-bold text-primary">{formatBRL(fare)}</span>
        </div>
      )}
    </div>
  );
}



/* ============================================================ */
/*                         SUB COMPONENTS                       */
/* ============================================================ */


function Stat({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-background/60 px-3 py-2 ring-1 ring-border">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`text-base font-bold ${
          highlight ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function SearchingPanel({
  category,
  driversCount,
  noDriversAvailable,
  onCancel,
}: {
  category: RideCategory;
  driversCount: number;
  noDriversAvailable?: boolean;
  onCancel: () => void;
}) {
  const cat = RIDE_CATEGORIES.find((c) => c.key === category)!;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, []);
  // raio em km cresce com o tempo (cap 8km), animado
  const radiusKm = Math.min(8, 1 + elapsed * 0.25);
  const mm = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0");
  const ss = (elapsed % 60).toString().padStart(2, "0");

  return (
    <div className="px-1 pt-0.5">
      {/* Header compacto: indicador pulsante + título + cancelar */}
      <div className="flex items-center gap-3">
        <div className="relative grid h-10 w-10 shrink-0 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-duration:1.6s]" />
          <span className="relative grid h-7 w-7 place-items-center rounded-full bg-primary text-base shadow-lg shadow-primary/40">
            {cat.emoji}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-[14px] font-extrabold leading-tight">
            {noDriversAvailable ? "Nenhum motorista disponível" : "Procurando motoristas..."}
          </h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {noDriversAvailable ? "Tentando novamente" : `Conectando com ${cat.label} próximos`}
          </p>
        </div>
        <button
          onClick={onCancel}
          aria-label="Cancelar solicitação"
          className="shrink-0 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[11px] font-semibold text-destructive-foreground transition active:scale-[0.96] hover:bg-destructive/20"
        >
          Cancelar
        </button>
      </div>

      {/* Métricas compactas em linha */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <div className="rounded-lg bg-primary/10 px-2 py-1.5 text-center ring-1 ring-primary/30">
          <div className="text-[13px] font-extrabold tabular-nums leading-none text-primary">
            {driversCount}
          </div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            Motoristas
          </div>
        </div>
        <div className="rounded-lg bg-background/60 px-2 py-1.5 text-center ring-1 ring-border">
          <div className="text-[13px] font-extrabold tabular-nums leading-none text-foreground">
            {radiusKm.toFixed(1)}<span className="text-[9px] font-bold">km</span>
          </div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            Raio
          </div>
        </div>
        <div className="rounded-lg bg-background/60 px-2 py-1.5 text-center ring-1 ring-border">
          <div className="text-[13px] font-extrabold tabular-nums leading-none text-foreground">
            {mm}:{ss}
          </div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            Tempo
          </div>
        </div>
      </div>

      {/* Indeterminate premium progress bar */}
      <div className="relative mt-3 h-1 w-full overflow-hidden rounded-full bg-muted/40">
        <div
          className="animate-movvi-indeterminate absolute inset-y-0 left-0 h-full w-2/5 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent"
        />
      </div>

      {/* Dica de arraste — visível só nos primeiros segundos */}
      <p className="mt-2 text-center text-[10px] text-muted-foreground/80">
        Arraste para cima para mais detalhes
      </p>

    </div>
  );
}

function DriverEnRoute({
  ride,
  driver,
  onCancel,
  onOpenProfile,
}: {
  ride: RideRow;
  driver: DriverRow;
  onCancel: () => void;
  onOpenProfile?: () => void;
}) {
  const phaseLabel =
    ride.status === "motorista_chegou"
      ? "Seu motorista chegou"
      : ride.status === "em_viagem"
        ? "Em viagem para o destino"
        : "Motorista a caminho";
  // ETA/distância reais quando disponíveis:
  //  - Aproximando: haversine motorista → origem (velocidade média urbana 32 km/h)
  //  - Em viagem: usa ride.duration_min / ride.distance_km calculados no aceite
  const isInTrip = ride.status === "em_viagem";

  const approachKm = (() => {
    const dLat = driver.current_lat as number | null | undefined;
    const dLng = driver.current_lng as number | null | undefined;
    if (typeof dLat !== "number" || typeof dLng !== "number") return null;
    if (typeof ride.origin_lat !== "number" || typeof ride.origin_lng !== "number") return null;
    const R = 6371;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dφ = toRad(ride.origin_lat - dLat);
    const dλ = toRad(ride.origin_lng - dLng);
    const a =
      Math.sin(dφ / 2) ** 2 +
      Math.cos(toRad(dLat)) * Math.cos(toRad(ride.origin_lat)) * Math.sin(dλ / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  })();

  const eta = isInTrip
    ? (ride.duration_min ? Math.max(1, Math.round(Number(ride.duration_min))) : null)
    : (approachKm != null ? Math.max(1, Math.round((approachKm / 32) * 60)) : null);
  const distKm = isInTrip
    ? (ride.distance_km != null ? Number(ride.distance_km) : null)
    : approachKm;

  return (
    <div className="pt-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="mb-3 flex items-center justify-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.22em] text-muted-foreground/90">
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
          <span className="relative h-2 w-2 rounded-full bg-primary" />
        </span>
        <span className="text-foreground/95">{phaseLabel}</span>
      </div>

      {/* ETA destacado — só quando dados reais disponíveis */}
      {(eta != null || distKm != null) && ride.status !== "motorista_chegou" && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-background/50 px-4 py-3 ring-1 ring-border/60">
          <div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted-foreground leading-none">
              {isInTrip ? "Tempo restante" : "Chegando em"}
            </div>
            <div key={eta ?? "eta-empty"} className="mt-1.5 text-[26px] font-extrabold leading-none text-foreground tabular-nums animate-count-pop">
              {eta ?? "—"}
              <span className="ml-1 text-[13px] font-semibold text-muted-foreground">min</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted-foreground leading-none">
              Distância
            </div>
            <div key={distKm?.toFixed(1) ?? "d-empty"} className="mt-1.5 text-[17px] font-extrabold leading-none text-foreground tabular-nums animate-count-pop">
              {distKm != null ? distKm.toFixed(1) : "—"}
              <span className="ml-1 text-[11px] font-semibold text-muted-foreground">km</span>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onOpenProfile}
        className="flex w-full items-center gap-4 rounded-2xl bg-background/50 p-4 text-left ring-1 ring-border/60 transition active:scale-[0.99] hover:ring-primary/40"
        aria-label="Ver perfil do motorista"
      >
        <div className="shrink-0 rounded-full ring-2 ring-white/85 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.5)]">
          <Avatar
            src={driver.photo_url ?? null}
            name={driver.name}
            size={64}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15.5px] font-semibold tracking-tight text-foreground">
              {driver.name}
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted/35 px-1.5 py-0.5 text-[11px] font-medium text-foreground/85">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {driver.rating?.toFixed(1) ?? "5.0"}
            </span>
          </div>
          <div className="mt-1 truncate text-[12.5px] text-muted-foreground">
            {driver.vehicle_color} · {driver.vehicle_model}
          </div>
          <div className="mt-2 inline-flex items-center rounded-md bg-white px-2 py-[3px] text-[11px] font-extrabold tracking-[0.2em] text-black shadow-[0_2px_6px_-2px_rgba(0,0,0,0.35)]">
            {driver.vehicle_plate}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
      </button>


      <RideQuickActions ride={ride} driver={driver} onCancel={onCancel} />

      <div className="mt-3">
        <SafetyCard
          role="passenger"
          rideId={ride.id}
          counterpartLabel={`Motorista ${driver.name}${driver.vehicle_plate ? ` · ${driver.vehicle_plate}` : ""}`}
          shareInput={{
            role: "passenger",
            status: ride.status,
            driverName: driver.name,
            vehicleModel: driver.vehicle_model,
            vehicleColor: driver.vehicle_color,
            vehiclePlate: driver.vehicle_plate,
            originName: ride.origin_name ?? ride.pickup_label ?? null,
            destinationName: ride.destination_name,
          }}
        />
      </div>

      {/* Código de segurança exibido somente no cartão fixo no topo da tela. */}




      <div className="mt-3 rounded-xl bg-background/50 px-3.5 py-2.5 text-[12px] ring-1 ring-border/60">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3 w-3 shrink-0 text-destructive" />
          <span className="truncate">{ride.destination_name}</span>
        </div>
        {ride.estimated_price && (
          <div className="mt-1 flex items-center justify-between text-muted-foreground">
            <span>Estimativa</span>
            <span className="font-bold text-foreground">
              {formatBRL(Number(ride.estimated_price))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Action({
  icon,
  label,
  tone,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "destructive";
  onClick?: () => void;
  href?: string;
}) {
  const cls = `flex flex-col items-center gap-1 rounded-xl py-3 ring-1 ring-border transition active:scale-95 ${
    tone === "destructive"
      ? "bg-destructive/15 text-destructive-foreground hover:bg-destructive/25 ring-destructive/40"
      : "bg-background/60 hover:ring-primary/40"
  }`;
  const inner = (
    <>
      {icon}
      <span className="text-[11px]">{label}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function RideQuickActions({
  ride,
  driver,
  onCancel,
}: {
  ride: RideRow;
  driver: DriverRow;
  onCancel: () => void;
}) {
  const [sosOpen, setSosOpen] = useState(false);
  const [sosSending, setSosSending] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const [emergency, setEmergency] = useState<{ name: string | null; phone: string | null }>({
    name: null,
    phone: null,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) return;
        const { data } = await supabase
          .from("users")
          .select("emergency_contact_name, emergency_contact_phone")
          .eq("auth_user_id", auth.user.id)
          .maybeSingle();
        if (active && data) {
          setEmergency({
            name: data.emergency_contact_name ?? null,
            phone: data.emergency_contact_phone ?? null,
          });
        }
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const driverPhone = (driver.phone ?? "").replace(/\D/g, "");
  const telHref = driverPhone ? `tel:+${driverPhone.startsWith("55") ? driverPhone : "55" + driverPhone}` : undefined;

  async function handleShare() {
    const text =
      `🚗 MOVVI Drive — Estou em uma corrida\n` +
      `Motorista: ${driver.name}\n` +
      `Veículo: ${driver.vehicle_color ?? ""} ${driver.vehicle_model ?? ""} (${driver.vehicle_plate ?? "-"})\n` +
      `Destino: ${ride.destination_name ?? "-"}\n` +
      `Código de segurança: ${ride.safety_code ?? "-"}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "MOVVI Drive", text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("Detalhes da corrida copiados");
      }
    } catch {
      /* usuário cancelou */
    }
  }

  async function triggerSos() {
    if (sosSending) return;
    setSosSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("Sessão expirada");

      // Pega coordenadas em tempo real
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 },
        );
      });

      const { error } = await supabase.from("sos_alerts").insert({
        user_id: auth.user.id,
        ride_id: ride.id,
        lat: pos?.coords.latitude ?? ride.origin_lat ?? null,
        lng: pos?.coords.longitude ?? ride.origin_lng ?? null,
        message: `Alerta SOS — passageiro ${auth.user.email ?? ""} | motorista ${driver.name} | placa ${driver.vehicle_plate ?? "-"}`,
      });
      if (error) throw error;

      setSosSent(true);
      toast.success("Alerta SOS enviado. Nossa central foi notificada.");
    } catch (err) {
      console.error("[MOVVI] SOS falhou:", err);
      toast.error("Não foi possível enviar o SOS. Ligue 190 imediatamente.");
    } finally {
      setSosSending(false);
    }
  }

  const isInProgress = ride.status === "em_viagem";

  return (
    <>
      <div className="mt-2 grid grid-cols-4 gap-1.5 text-xs">
        <Action
          icon={<Phone className="h-4 w-4" />}
          label="Ligar"
          href={telHref}
          onClick={telHref ? undefined : () => toast.info("Telefone do motorista indisponível")}
        />
        <Action icon={<Navigation2 className="h-4 w-4" />} label="Compartilhar" onClick={handleShare} />
        <Action
          icon={<Shield className="h-4 w-4" />}
          label="SOS"
          tone="destructive"
          onClick={() => setSosOpen(true)}
        />
        {isInProgress ? (
          <Action
            icon={<Shield className="h-4 w-4" />}
            label="Suporte"
            onClick={() =>
              toast.info("Viagem em andamento", {
                description: "Para encerrar, fale com o motorista ou suporte.",
              })
            }
          />
        ) : (
          <Action icon={<X className="h-4 w-4" />} label="Cancelar" onClick={onCancel} />
        )}
      </div>

      {sosOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in"
          onClick={() => !sosSending && setSosOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl bg-card p-5 ring-1 ring-destructive/40 animate-in slide-in-from-bottom"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-destructive/20 text-destructive-foreground">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[15px] font-extrabold">Emergência durante a corrida</div>
                <div className="text-[12px] text-muted-foreground">
                  Use apenas em caso real de risco.
                </div>
              </div>
            </div>

            {sosSent ? (
              <div className="rounded-2xl bg-primary/10 p-3 text-[13px] ring-1 ring-primary/30">
                ✅ Alerta enviado. A central recebeu sua localização e os dados do motorista. Mantenha-se em local seguro.
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Vamos registrar um alerta com sua localização atual, dados do motorista ({driver.name} · {driver.vehicle_plate ?? "-"}) e detalhes da corrida.
              </p>
            )}

            <div className="mt-3 grid gap-2">
              <a
                href="tel:190"
                className="flex items-center justify-center gap-2 rounded-2xl bg-destructive py-3 text-[14px] font-bold text-destructive-foreground active:scale-[0.98]"
              >
                <Phone className="h-4 w-4" /> Ligar 190 — Polícia
              </a>
              {emergency.phone && (
                <a
                  href={`tel:${emergency.phone.replace(/\D/g, "")}`}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-[14px] font-bold text-primary-foreground active:scale-[0.98]"
                >
                  <Phone className="h-4 w-4" /> Ligar para {emergency.name || "contato de emergência"}
                </a>
              )}
              {!sosSent && (
                <button
                  disabled={sosSending}
                  onClick={triggerSos}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-destructive/60 bg-destructive/10 py-3 text-[14px] font-bold text-destructive-foreground active:scale-[0.98] disabled:opacity-50"
                >
                  <Shield className="h-4 w-4" />
                  {sosSending ? "Enviando alerta..." : "Enviar alerta para a MOVVI"}
                </button>
              )}
              <button
                onClick={() => setSosOpen(false)}
                disabled={sosSending}
                className="rounded-2xl bg-background/60 py-2.5 text-[13px] ring-1 ring-border"
              >
                Fechar
              </button>
            </div>

            {!emergency.phone && !sosSent && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Dica: cadastre um contato de emergência no seu perfil.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function GpsDeniedScreen({
  mode = "denied",
  onRetry,
  onHome,
  onManual,
  errorMessage,
  requesting,
}: {
  mode?: "prompt" | "denied";
  onRetry: () => void;
  onHome: () => void;
  onManual: (p: LatLng) => void;
  errorMessage: string;
  requesting: boolean;
}) {
  const isPrompt = mode === "prompt";
  const title = isPrompt
    ? "Ative sua localização"
    : "Não foi possível obter sua localização";
  const description = isPrompt
    ? "A MOVVI precisa da sua localização para encontrar motoristas próximos e calcular sua corrida."
    : errorMessage ||
      "Não conseguimos acessar sua localização automaticamente. Digite sua origem manualmente.";
  const primaryLabel = requesting
    ? "Solicitando..."
    : isPrompt
    ? "Permitir acesso à minha localização"
    : "Tentar novamente";
  const [manualOpen, setManualOpen] = useState(!isPrompt);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<{ placeId: string; primary: string; secondary: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualError, setManualError] = useState("");
  const debounceRef = useRef<number | null>(null);
  const { isLoaded: mapsReady, loadError: mapsLoadError } = useJsApiLoader({
    id: "movvi-google-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: "pt-BR",
    region: "BR",
  });

  useEffect(() => {
    if (errorMessage) setManualOpen(true);
  }, [errorMessage]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    setManualError("");
    if (q.length < 2) {
      setItems([]);
      return;
    }
    if (!mapsReady) return;
    debounceRef.current = window.setTimeout(async () => {
      try {
        setSearching(true);
        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        const sessionToken = new AutocompleteSessionToken();
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken,
          includedRegionCodes: ["br"],
          language: "pt-BR",
          region: "BR",
        });
        setItems(
          suggestions
            .map((s) => s.placePrediction)
            .filter(Boolean)
            .map((p) => ({
              placeId: p!.placeId,
              primary: p!.mainText?.text ?? p!.text?.text ?? "",
              secondary: p!.secondaryText?.text ?? "",
            }))
            .slice(0, 6),
        );
      } catch (e) {
        console.error("Erro no autocomplete manual:", e);
        setManualError("Falha temporária na busca de endereços. Tente novamente em alguns segundos.");
      } finally {
        setSearching(false);
      }
    }, 250);
  }, [query, mapsReady]);

  async function choose(placeId: string, label: string) {
    try {
      setManualError("");
      const { Place } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
      const place = new Place({ id: placeId });
      await place.fetchFields({ fields: ["location"] });
      const loc = place.location;
      if (!loc) throw new Error("Sem coordenadas");
      const point = { lat: loc.lat(), lng: loc.lng() };
      if (import.meta.env.DEV) console.log("Manual selecionado:", label, point.lat, point.lng);
      if (!isBrazilCoordinate(point.lat, point.lng)) {
        setManualError("Escolha uma cidade ou endereço dentro do Brasil.");
        return;
      }
      onManual(point);
    } catch (e) {
      console.error("Erro ao obter coordenadas do lugar:", e);
      setManualError("Não foi possível obter as coordenadas desse endereço.");
    }
  }

  async function submitManualSearch() {
    const first = items[0];
    if (first) {
      await choose(first.placeId, `${first.primary} ${first.secondary}`);
      return;
    }
    if (!mapsReady || query.trim().length < 2) return;
    setManualError("Digite um endereço no Brasil e selecione uma opção da lista.");
  }

  const showDevBadge = DEV_MODE && isDevelopmentEnvironment();

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <button
          onClick={onHome}
          className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-2 text-xs font-medium ring-1 ring-border"
        >
          ← Início
        </button>
        {showDevBadge && (
          <a
            href="/dev-diagnostics"
            className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/40"
            title="Ambiente de desenvolvimento — abrir diagnóstico"
          >
            🧪 Diagnóstico
          </a>
        )}
      </div>
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15 text-primary">
        <MapPin className="h-9 w-9" />
      </div>
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      {showDevBadge && (
        <p className="mt-3 max-w-sm rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300 ring-1 ring-amber-500/30">
          Ambiente de teste detectado. A localização real pode não funcionar corretamente aqui — use a busca manual abaixo.
        </p>
      )}
      {mapsLoadError && (
        <p className="mt-3 max-w-sm rounded-xl bg-destructive/10 px-3 py-2 text-[12px] text-destructive ring-1 ring-destructive/30">
          Falha temporária ao carregar o mapa. Verifique sua conexão e toque em tentar novamente.
        </p>
      )}


      <div className="mt-6 flex w-full max-w-sm flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            if (import.meta.env.DEV) console.log("[MOVVI] Clique em", primaryLabel);
            onRetry();
          }}
          disabled={requesting}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-sm font-bold text-primary-foreground shadow-xl shadow-primary/30 active:scale-95 disabled:opacity-60"
        >
          <Crosshair className="h-4 w-4" />
          {primaryLabel}
        </button>

        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-card px-6 py-4 text-sm font-semibold text-foreground ring-1 ring-border active:scale-95"
        >
          <Search className="h-4 w-4" /> Digitar origem manualmente
        </button>
      </div>



      {manualOpen && (
        <div className="mt-4 w-full max-w-sm rounded-2xl bg-card p-4 ring-1 ring-border text-left">
          <label className="text-xs font-medium text-muted-foreground">
            Digite cidade ou endereço
          </label>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitManualSearch();
            }}
            placeholder="Digite seu endereço, bairro ou cidade"
            className="mt-2 w-full rounded-xl bg-background px-3 py-3 text-sm outline-none ring-1 ring-border focus:ring-primary"
          />
          {mapsLoadError && (
            <p className="mt-2 text-xs text-destructive">Falha ao carregar a busca do Google Maps.</p>
          )}
          {!mapsReady && !mapsLoadError && (
            <p className="mt-2 text-xs text-muted-foreground">Carregando busca...</p>
          )}
          {searching && (
            <p className="mt-2 text-xs text-muted-foreground">Buscando...</p>
          )}
          <ul className="mt-2 max-h-64 overflow-y-auto">
            {items.map((it) => (
              <li key={it.placeId}>
                <button
                  type="button"
                  onClick={() => choose(it.placeId, `${it.primary} ${it.secondary}`)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-left hover:bg-background"
                >
                  <span className="text-sm font-medium">{it.primary}</span>
                  <span className="text-xs text-muted-foreground">{it.secondary}</span>
                </button>
              </li>
            ))}
          </ul>
          {query.trim().length >= 2 && !searching && mapsReady && items.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Continue digitando seu endereço e selecione uma sugestão da lista.
            </p>
          )}
          {manualError && <p className="mt-3 text-xs text-destructive">{manualError}</p>}
          <button
            type="button"
            onClick={() => void submitManualSearch()}
            disabled={!mapsReady || searching || query.trim().length < 2}
            className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            CONFIRMAR LOCALIZAÇÃO
          </button>
        </div>
      )}
    </div>
  );
}

function OriginMapPickerOverlay({
  mapRef,
  initialCenter,
  onCancel,
  onConfirm,
}: {
  mapRef: React.MutableRefObject<google.maps.Map | null>;
  initialCenter: LatLng;
  onCancel: () => void;
  onConfirm: (p: LatLng) => void;
}) {
  const [center, setCenter] = useState<LatLng>(initialCenter);
  const [valid, setValid] = useState<boolean>(isBrazilCoordinate(initialCenter.lat, initialCenter.lng));

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const c = map.getCenter();
      if (!c) return;
      const p = { lat: c.lat(), lng: c.lng() };
      setCenter(p);
      setValid(isBrazilCoordinate(p.lat, p.lng));
    };
    update();
    const l1 = map.addListener("center_changed", update);
    return () => {
      l1.remove();
    };
  }, [mapRef]);

  return (
    <>
      {/* Crosshair fixo no centro */}
      <div className="pointer-events-none absolute inset-0 z-[55] flex items-center justify-center">
        <div className="relative -translate-y-2">
          <div className="h-10 w-10 rounded-full bg-primary/20 ring-2 ring-primary/60" />
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-white" />
          <div className="absolute left-1/2 top-full h-4 w-0.5 -translate-x-1/2 bg-primary/70" />
        </div>
      </div>

      {/* Barra superior com instrução */}
      <div className="absolute inset-x-0 top-0 z-[56] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+10px)]">
        <div className="flex max-w-md items-center gap-2 rounded-2xl bg-card/95 px-3 py-2 text-[12.5px] font-medium shadow-xl ring-1 ring-border backdrop-blur">
          <MapPin className="h-4 w-4 text-primary" />
          Arraste o mapa e ajuste o ponto de partida
        </div>
      </div>

      {/* Card inferior com confirmação */}
      <div className="absolute inset-x-0 bottom-0 z-[56] px-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <div className="mx-auto max-w-md rounded-2xl bg-card p-4 shadow-2xl ring-1 ring-border">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-primary">
            Novo local de partida
          </div>
          <div className="mt-1 text-[12.5px] font-semibold text-foreground/80">
            Ponto selecionado no mapa
          </div>
          {!valid && (
            <p className="mt-2 rounded-xl bg-destructive/15 px-2 py-1.5 text-[11.5px] text-destructive-foreground ring-1 ring-destructive/40">
              Selecione um ponto dentro do Brasil.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl bg-background/60 py-3 text-[13px] font-semibold ring-1 ring-border active:scale-[0.98]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onConfirm(center)}
              disabled={!valid}
              className="flex-1 rounded-xl bg-primary py-3 text-[13px] font-bold text-primary-foreground shadow-md shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
            >
              Confirmar partida
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function OriginManualSearchOverlay({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (p: LatLng) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<{ placeId: string; primary: string; secondary: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const debounceRef = useRef<number | null>(null);
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    setErr("");
    if (q.length < 2) {
      setItems([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        setBusy(true);
        const places = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        if (!sessionRef.current) sessionRef.current = new places.AutocompleteSessionToken();
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: sessionRef.current,
          includedRegionCodes: ["br"],
          language: "pt-BR",
          region: "BR",
        });
        setItems(
          suggestions
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => !!p)
            .slice(0, 6)
            .map((p) => ({
              placeId: p.placeId,
              primary: p.mainText?.toString() ?? p.text.toString(),
              secondary: p.secondaryText?.toString() ?? "",
            })),
        );
      } catch (e) {
        console.error("[MOVVI] autocomplete origem manual", e);
        setErr("Falha na busca. Tente novamente em alguns segundos.");
      } finally {
        setBusy(false);
      }
    }, 220);
  }, [query]);

  async function choose(placeId: string) {
    try {
      setErr("");
      const places = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
      const place = new places.Place({ id: placeId });
      await place.fetchFields({ fields: ["location"] });
      const loc = place.location;
      if (!loc) throw new Error("Sem coordenadas");
      const p = { lat: loc.lat(), lng: loc.lng() };
      if (!isBrazilCoordinate(p.lat, p.lng)) {
        setErr("Selecione um endereço dentro do Brasil.");
        return;
      }
      sessionRef.current = null;
      onConfirm(p);
    } catch (e) {
      console.error("[MOVVI] falha origem manual", e);
      setErr("Não foi possível obter as coordenadas desse endereço.");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground">
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3 pt-[calc(env(safe-area-inset-top)+12px)]">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Voltar"
          className="grid h-9 w-9 place-items-center rounded-full bg-background/60 ring-1 ring-border active:scale-90"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-background/70 px-3 py-2 ring-1 ring-border focus-within:ring-primary/60">
          <Search className="h-4 w-4 text-primary" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite rua, bairro, cidade ou CEP"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
          />
          {busy && <span className="text-[11px] text-muted-foreground">...</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {err && (
          <p className="mx-2 my-2 rounded-xl bg-destructive/10 px-3 py-2 text-[12px] text-destructive-foreground ring-1 ring-destructive/40">
            {err}
          </p>
        )}
        {items.length === 0 && query.trim().length >= 2 && !busy && (
          <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
            Nenhum resultado. Tente outro termo.
          </p>
        )}
        <ul>
          {items.map((it) => (
            <li key={it.placeId}>
              <button
                type="button"
                onClick={() => void choose(it.placeId)}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-accent/30 active:scale-[0.99]"
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13.5px] font-semibold">{it.primary}</span>
                  {it.secondary && (
                    <span className="truncate text-[11.5px] text-muted-foreground">{it.secondary}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function LogoMark() {
  return (
    <svg width={22} height={22} viewBox="0 0 120 120" aria-hidden>
      <path d="M18 100 L18 28 L40 28 L60 70 L60 100 Z" fill="white" />
      <path
        d="M60 28 Q100 28 100 64 Q100 100 60 100 L60 78 Q82 78 82 64 Q82 50 60 50 Z"
        fill="hsl(95 75% 51%)"
      />
    </svg>
  );
}
