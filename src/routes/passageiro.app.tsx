import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import {
  Bike,
  Box,
  Car,
  ChevronRight,
  Clock,
  Crosshair,
  LogOut,
  MapPin,
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
import { MovviMap } from "@/components/MovviMap";
import { MovviSheet, type MovviSheetHandle } from "@/components/MovviSheet";
import { supabase } from "@/integrations/supabase/client";
import {
  BRAZIL_CENTER,
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  isBrazilCoordinate,
  purgeForeignMapCache,
} from "@/lib/googleMaps";
import { isDevelopmentEnvironment } from "@/lib/environment";

import { computeRoute, type RouteResult } from "@/lib/routes.functions";
import { reverseGeocode, type GeocodeResult } from "@/lib/geocode.functions";
import { requestRide } from "@/lib/ride.functions";
import { useNearbyDrivers } from "@/hooks/useNearbyDrivers";
import {
  RIDE_CATEGORIES,
  estimateFare,
  formatBRL,
  type RideCategory,
} from "@/lib/rideCategories";

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

// ====== COMPONENTES PREMIUM ======

function PremiumTopBar({
  userName,
  gpsState,
  drivers,
  searching,
  onLogout,
}: {
  userName: string;
  gpsState: "idle" | "requesting" | "granted" | "denied" | "unavailable";
  drivers: number;
  searching: boolean;
  onLogout: () => void;
}) {
  const { text: greet, icon: GIcon } = getGreeting();
  const fname = firstName(userName) || "passageiro";

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
    <div className="absolute inset-x-0 top-0 z-40 px-3 pt-[calc(env(safe-area-inset-top)+10px)]">
      <div className="mx-auto flex max-w-5xl items-center gap-3 rounded-2xl bg-card/90 px-3 py-2.5 shadow-xl ring-1 ring-border/60 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30">
          <GIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold leading-tight text-foreground">
            {greet}, {fname} <span className="opacity-90">👋</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <span className="text-[12px] leading-none">{statusIcon}</span>
            <span className="truncate">{statusText}</span>
          </div>
        </div>
        <button
          onClick={onLogout}
          aria-label="Sair"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive ring-1 ring-destructive/30 transition hover:bg-destructive/25 active:scale-90"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PulsingUserMarker({ position }: { position: LatLng }) {
  const pulseIcon = useMemo(
    () => ({
      path: google.maps.SymbolPath.CIRCLE,
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
      path: google.maps.SymbolPath.CIRCLE,
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
  const rua = geo?.components.rua;
  const numero = geo?.components.numero;
  const bairro = geo?.components.bairro || geo?.components.povoado;
  const region = geo?.region;
  const ruaLine = rua ? (numero ? `${rua}, ${numero}` : rua) : geo?.friendly || "";

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
            {ruaLine ? (
              <div className="mt-0.5 truncate text-[15px] font-bold text-foreground">{ruaLine}</div>
            ) : position ? (
              <div className="mt-0.5 truncate font-mono text-[12px] font-semibold text-foreground">
                {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
              </div>
            ) : (
              <div className="mt-0.5 text-[13px] text-muted-foreground">Sem endereço identificado</div>
            )}
            {bairro && <div className="truncate text-[12.5px] text-foreground/80">{bairro}</div>}
            {region && <div className="truncate text-[12px] text-muted-foreground">{region}</div>}
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
  component: PassageiroApp,
});

type LatLng = { lat: number; lng: number };
type Suggestion = { placeId: string; primary: string; secondary: string };
type RideRow = Database["public"]["Tables"]["rides"]["Row"];
type DriverRow = Database["public"]["Tables"]["drivers"]["Row"];

const RECENT_KEY = "movvi.recent_destinations";

/** Catálogo visual de categorias da MOVVI (mapeia para o enum backend). */
type UiCategory = {
  key: string;
  label: string;
  icon: LucideIcon;
  backend: RideCategory;
  tagline: string;
};
const UI_CATEGORIES: UiCategory[] = [
  { key: "carro",    label: "Carro",    icon: Car,     backend: "carros",  tagline: "Viagem do dia a dia" },
  { key: "moto",     label: "Moto",     icon: Bike,    backend: "motos",   tagline: "Rápido e econômico" },
  { key: "guincho",  label: "Guincho",  icon: Truck,   backend: "guincho", tagline: "Reboque 24h" },
  { key: "fretes",   label: "Fretes",   icon: Package, backend: "fretes",  tagline: "Cargas e volumes" },
  { key: "mudancas", label: "Mudanças", icon: Box,     backend: "fretes",  tagline: "Móveis e residencial" },
  { key: "entregas", label: "Entregas", icon: Send,    backend: "envios",  tagline: "Pequenos envios" },
];

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

function PassageiroApp() {
  const navigate = useNavigate();
  const callComputeRoute = useServerFn(computeRoute);
  const callRequestRide = useServerFn(requestRide);
  const callReverseGeocode = useServerFn(reverseGeocode);

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  const [position, setPosition] = useState<LatLng | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [geo, setGeo] = useState<GeocodeResult | null>(null);
  const [addressStatus, setAddressStatus] = useState<
    "idle" | "loading" | "resolved" | "failed"
  >("idle");
  const [addressDetailsOpen, setAddressDetailsOpen] = useState(false);
  const [originPickOnMap, setOriginPickOnMap] = useState(false);
  const [originManualOpen, setOriginManualOpen] = useState(false);
  const [originPickCenter, setOriginPickCenter] = useState<LatLng | null>(null);
  const [tick, setTick] = useState(0); // re-render para saudação dinâmica
  const [gpsState, setGpsState] = useState<
    "idle" | "requesting" | "granted" | "denied" | "unavailable"
  >("idle");
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string>("");
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
  const [uiCategoryKey, setUiCategoryKey] = useState<string>("carro");
  const category: RideCategory = useMemo(
    () =>
      UI_CATEGORIES.find((c) => c.key === uiCategoryKey)?.backend ?? "carros",
    [uiCategoryKey],
  );
  const [recent, setRecent] = useState<Recent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ride lifecycle
  const [rideId, setRideId] = useState<string | null>(null);
  const [ride, setRide] = useState<RideRow | null>(null);
  const [driverInfo, setDriverInfo] = useState<DriverRow | null>(null);

  const mapRef = useRef<google.maps.Map | null>(null);
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);
  const sheetRef = useRef<MovviSheetHandle | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const drivers = useNearbyDrivers({ category });

  /* ---------------------- auth ---------------------- */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate({ to: "/passageiro/login" });
        return;
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
  }, [navigate]);

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
    if (!position) return;
    const last = lastGeocodedRef.current;
    if (
      last &&
      Math.abs(last.lat - position.lat) < 0.002 &&
      Math.abs(last.lng - position.lng) < 0.002
    )
      return;
    lastGeocodedRef.current = position;
    let active = true;
    setAddressStatus("loading");
    console.log("[MOVVI] Reverse geocoding iniciado");
    // Timeout de segurança: nunca deixar o cartão preso em "Obtendo localização...".
    const timeoutId = window.setTimeout(() => {
      if (!active) return;
      console.warn("[MOVVI] Timeout de localização aplicado");
      setAddressStatus((s) => (s === "loading" ? "failed" : s));
    }, 8000);
    callReverseGeocode({ data: { lat: position.lat, lng: position.lng } })
      .then((r) => {
        if (!active) return;
        console.log("[MOVVI] Reverse geocoding concluído");
        setGeo(r);
        setAddressStatus("resolved");
      })
      .catch((e) => {
        if (!active) return;
        console.error("[MOVVI] Reverse geocoding falhou", e);
        setAddressStatus("failed");
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [position, callReverseGeocode]);

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
      console.log("[MOVVI] Ignorando clique — já existe uma solicitação de GPS em andamento.");
      return;
    }
    console.log("[MOVVI] Solicitando localização...");
    const fail = (msg: string) => {
      setGpsState("unavailable");
      gpsStateRef.current = "unavailable";
      setGpsErrorMsg(msg);
    };
    if (typeof window !== "undefined" && !window.isSecureContext) {
      fail("Geolocalização requer HTTPS.");
      return;
    }
    if (!("geolocation" in navigator)) {
      fail("Seu navegador não oferece geolocalização.");
      return;
    }
    setGpsState("requesting");
    gpsStateRef.current = "requesting";
    gpsRequestInFlightRef.current = true;
    setGpsErrorMsg("");
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          gpsRequestInFlightRef.current = false;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          console.log("[MOVVI] GPS recebido:", lat, lng);
          if (!isBrazilCoordinate(lat, lng)) {
            console.warn("[MOVVI] GPS rejeitado: fora do Brasil", { lat, lng });
            setGpsState("denied");
            gpsStateRef.current = "denied";
            setGpsErrorMsg(
              "Recebemos uma localização incompatível com o Brasil. Digite sua origem manualmente ou tente novamente com a localização real ativada.",
            );
            return;
          }

          setPosition({ lat, lng });
          setGpsAccuracy(pos.coords.accuracy ?? null);
          setGpsState("granted");
          gpsStateRef.current = "granted";
          setGpsErrorMsg("");
          console.log("[MOVVI] Origem válida confirmada", { lat, lng });

          // Evita múltiplos watchers acumulados em re-tentativas.
          if (watchIdRef.current != null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
          }
          watchIdRef.current = navigator.geolocation.watchPosition(
            (p) => {
              const la = p.coords.latitude;
              const ln = p.coords.longitude;
              if (isBrazilCoordinate(la, ln)) {
                setPosition({ lat: la, lng: ln });
                setGpsAccuracy(p.coords.accuracy ?? null);
              }
            },
            () => undefined,
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
          );
        },
        (err) => {
          gpsRequestInFlightRef.current = false;
          console.error("[MOVVI] Erro ao obter localização:", err);
          setGpsState("denied");
          gpsStateRef.current = "denied";
          if (err.code === err.PERMISSION_DENIED) {
            setGpsErrorMsg(
              "Permissão de localização negada.",
            );
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            setGpsErrorMsg(
              "Não conseguimos detectar sua posição. Verifique se o GPS está ativo ou use a localização manual.",
            );
          } else if (err.code === err.TIMEOUT) {
            setGpsErrorMsg(
              "Tempo esgotado ao tentar obter sua localização. Tente novamente ou use a localização manual.",
            );
          } else {
            setGpsErrorMsg(
              "Não foi possível obter sua localização. Use a localização manual para continuar.",
            );
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    } catch (e) {
      gpsRequestInFlightRef.current = false;
      console.error("[MOVVI] Falha ao iniciar geolocalização:", e);
      fail("A geolocalização foi bloqueada neste ambiente. Use a localização manual.");
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
      console.warn("[MOVVI] Origem manual rejeitada: fora do Brasil", p);
      return;
    }
    console.log("[MOVVI] Origem manual selecionada", p);
    setPosition(p);
    setGpsState("granted");
    gpsStateRef.current = "granted";
    setGpsErrorMsg("");
    console.log("[MOVVI] Origem válida confirmada", p);
  }, []);


  // Verifica a permissão de geolocalização ANTES de chamar getCurrentPosition.
  // - Se já estiver "granted", pedimos o GPS imediatamente (sem prompt do navegador).
  // - Se for "prompt" / Permissions API indisponível, NÃO pedimos nada agora —
  //   o usuário precisa tocar em "Permitir localização" para acionar o prompt
  //   oficial do navegador.
  // - Se for "denied", mostramos o fluxo manual sem nunca tentar de novo
  //   automaticamente (evita loops).
  useEffect(() => {
    purgeForeignMapCache();
    let cancelled = false;

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setPermissionStatus("unsupported");
      setGpsState("unavailable");
      setGpsErrorMsg("Seu navegador não oferece geolocalização.");
      return;
    }

    const perms = (navigator as Navigator).permissions;
    if (!perms || typeof perms.query !== "function") {
      // Sem Permissions API (Safari iOS antigo etc.): tratamos como prompt,
      // o usuário precisa tocar no botão para disparar a solicitação.
      setPermissionStatus("unsupported");
      return;
    }

    let statusRef: PermissionStatus | null = null;
    perms
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        statusRef = status;
        const apply = (s: PermissionState) => {
          if (s === "granted") {
            setPermissionStatus("granted");
            // Permissão já concedida em qualquer ambiente (inclusive preview):
            // tentamos obter o GPS real imediatamente. Se vier coordenada inválida
            // (fora do Brasil) o próprio requestGps cai para o fluxo manual.
            requestGps();
          } else if (s === "denied") {
            setPermissionStatus("denied");
            setGpsState("denied");
            setGpsErrorMsg("Permissão de localização negada.");
          } else {
            setPermissionStatus("prompt");
          }
        };
        apply(status.state);
        status.onchange = () => apply(status.state);
      })
      .catch(() => {
        if (cancelled) return;
        setPermissionStatus("unsupported");
      });

    return () => {
      cancelled = true;
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
        if (position)
          req.locationBias = {
            center: new google.maps.LatLng(position.lat, position.lng),
            radius: 50000,
          } as google.maps.CircleLiteral;
        const { suggestions: result } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        setSuggestions(
          result
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
      const places = (await google.maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      const place = new places.Place({ id: s.placeId });
      await place.fetchFields({
        fields: ["location", "formattedAddress", "displayName"],
      });
      const loc = place.location;
      if (!loc) throw new Error("Local sem coordenadas.");
      const point: LatLng = { lat: loc.lat(), lng: loc.lng() };
      const label = place.formattedAddress ?? `${s.primary} ${s.secondary}`.trim();
      setDestination({ point, label });
      setDestinationText(label);
      setSuggestions([]);
      sessionTokenRef.current = null;
      pushRecent({ placeId: s.placeId, label: s.primary, secondary: s.secondary });
      sheetRef.current?.snapTo(72);
      searchInputRef.current?.blur();
      await calcRoute(point);
    } catch (e) {
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
    try {
      const result = await callComputeRoute({
        data: {
          origin: { lat: position.lat, lng: position.lng },
          destination: { lat: dest.lat, lng: dest.lng },
        },
      });
      setRoute(result);
      if (mapRef.current) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(position);
        bounds.extend(dest);
        mapRef.current.fitBounds(bounds, { top: 100, bottom: window.innerHeight * 0.6, left: 60, right: 60 });
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
    setSuggestions([]);
    sheetRef.current?.snapTo(30);
    if (mapRef.current && position) {
      mapRef.current.panTo(position);
      mapRef.current.setZoom(16);
    }
  }

  async function submitRide() {
    if (!position || !destination || !route) return;
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
      const fare = estimateFare(category, km, min);
      // Texto da origem — apenas para exibição. As coordenadas reais é que
      // vão para o cálculo/rastreio. Se o Google não tiver nome, usamos as
      // coordenadas como rótulo.
      const originLabel =
        geo?.friendly ||
        geo?.region ||
        `GPS ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;
      const { rideId: newId } = await callRequestRide({
        data: {
          origin: { lat: position.lat, lng: position.lng },
          origin_name: originLabel,
          destination: { lat: destination.point.lat, lng: destination.point.lng },
          destination_name: destination.label,
          category,
          distance_km: Math.round(km * 100) / 100,
          duration_min: Math.round(min),
          estimated_price: fare,
        },
      });
      setRideId(newId);
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
    const load = async () => {
      const { data } = await supabase
        .from("rides")
        .select("*")
        .eq("id", rideId)
        .maybeSingle();
      if (active && data) setRide(data);
    };
    load();
    const ch = supabase
      .channel(`ride-${rideId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` },
        (p) => setRide(p.new as RideRow),
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [rideId]);

  useEffect(() => {
    if (!ride?.driver_id) {
      setDriverInfo(null);
      return;
    }
    supabase
      .from("drivers")
      .select("*")
      .eq("user_id", ride.driver_id)
      .maybeSingle()
      .then(({ data }) => setDriverInfo(data));
  }, [ride?.driver_id]);

  function resetRide() {
    setRideId(null);
    setRide(null);
    setDriverInfo(null);
    clearDestination();
  }

  async function cancelRide() {
    if (!ride) return;
    await supabase
      .from("rides")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: userId,
      })
      .eq("id", ride.id);
    resetRide();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  function recenter() {
    if (mapRef.current && position) {
      mapRef.current.panTo(position);
      mapRef.current.setZoom(16);
    }
  }

  function focusSearch() {
    sheetRef.current?.snapTo(92);
    setTimeout(() => searchInputRef.current?.focus(), 220);
  }

  const polyPath = useMemo(
    () => (route ? decodePolyline(route.encodedPolyline) : []),
    [route],
  );

  const center = position && isBrazilCoordinate(position.lat, position.lng) ? position : BRAZIL_CENTER;
  const phase = ride?.status;

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
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Obtendo sua localização...</p>
        </div>
      </div>
    );
  }

  const needsPermissionScreen =
    !position &&
    (permissionStatus === "prompt" ||
      permissionStatus === "unsupported" ||
      permissionStatus === "denied" ||
      gpsState === "denied" ||
      gpsState === "unavailable");

  if (needsPermissionScreen) {
    const mode: "prompt" | "denied" =
      permissionStatus === "denied" ||
      gpsState === "denied" ||
      gpsState === "unavailable"
        ? "denied"
        : "prompt";
    return (
      <GpsDeniedScreen
        mode={mode}
        onRetry={requestGps}
        onHome={() => { void navigate({ to: "/" }); }}
        onManual={setManualLocation}
        errorMessage={gpsErrorMsg}
        requesting={gpsState === "requesting"}
      />
    );

  }
  const gpsFailed = (gpsState === "denied" || gpsState === "unavailable") && !!gpsErrorMsg;



  const inPreview = isDevelopmentEnvironment();
  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-background text-foreground">
      {inPreview && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center px-3 pt-[max(env(safe-area-inset-top),0px)]"
        >
          <div className="pointer-events-auto mt-2 max-w-[92%] rounded-full bg-amber-500/15 px-3 py-1.5 text-center text-[11px] font-medium text-amber-300 ring-1 ring-amber-500/30 backdrop-blur">
            Ambiente de teste detectado. A localização real pode não funcionar aqui.
          </div>
        </div>
      )}
      {/* MAPA — sempre presente, ~70% da tela */}

      <div className="absolute inset-0">
        <MovviMap
          center={center}
          zoom={position ? 16 : 5}
          height="100%"
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
                  strokeOpacity: 0.35,
                  strokeWeight: 1,
                  fillColor: "#3b82f6",
                  fillOpacity: 0.12,
                  clickable: false,
                }}
              />
              <PulsingUserMarker position={position} />
            </>
          )}

          {!ride &&
            drivers.map((d) => (
              <Marker
                key={d.user_id}
                position={{ lat: d.current_lat, lng: d.current_lng }}
                icon={{
                  path: "M5 11l1.5-4.5h11L19 11M6 14h12M7.5 17a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm12 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM5 11h14v4H5z",
                  fillColor: "#8DD92B",
                  fillOpacity: 1,
                  strokeColor: "#05070D",
                  strokeWeight: 1.4,
                  scale: 1.2,
                  anchor: new google.maps.Point(12, 14),
                }}
              />
            ))}

          {destination && (
            <Marker
              position={destination.point}
              icon={{
                path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
                fillColor: "#ef4444",
                fillOpacity: 1,
                strokeColor: "#05070D",
                strokeWeight: 2,
                scale: 1.7,
                anchor: new google.maps.Point(12, 22),
              }}
            />
          )}

          {polyPath.length > 0 && (
            <Polyline
              path={polyPath}
              options={{
                strokeColor: "#8DD92B",
                strokeOpacity: 0.95,
                strokeWeight: 6,
                geodesic: true,
              }}
            />
          )}
        </MovviMap>
      </div>

      {/* TOP BAR — premium: saudação + status dinâmico */}
      <PremiumTopBar
        userName={userName}
        gpsState={gpsState}
        drivers={drivers.length}
        searching={!!ride && (ride.status === "searching_driver" || ride.status === "offered_to_driver")}
        onLogout={handleLogout}
      />

      {/* Floating controls */}
      <div className="pointer-events-none absolute right-3 z-30" style={{ bottom: "calc(32vh + 16px)" }}>
        <button
          onClick={recenter}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-card text-foreground shadow-2xl ring-1 ring-border transition active:scale-90 hover:scale-105"
          aria-label="Recentralizar"
        >
          <Crosshair className="h-5 w-5 text-primary" />
        </button>
      </div>

      {/* BOTTOM SHEET — novo, próprio do MOVVI */}
      {!ride && (
        <MovviSheet ref={sheetRef} snaps={[30, 72, 92]} initial={30}>
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
            onClearDestination={clearDestination}
            route={route}
            busy={busy}
            error={error}
            uiCategoryKey={uiCategoryKey}
            setUiCategoryKey={setUiCategoryKey}
            driversCount={drivers.length}
            onSubmit={submitRide}
            searchInputRef={searchInputRef}
            gpsFailed={gpsFailed}
            gpsErrorMsg={gpsErrorMsg}
            gpsRequesting={gpsState === "requesting"}
            onRetryGps={requestGps}
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
              mapRef.current.panTo(position);
              mapRef.current.setZoom(17);
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


      {ride && (phase === "searching_driver" || phase === "offered_to_driver") && (
        <MovviSheet snaps={[40]} initial={40}>
          <SearchingPanel category={category} onCancel={cancelRide} />
        </MovviSheet>
      )}

      {ride &&
        driverInfo &&
        (phase === "driver_assigned" ||
          phase === "driver_arrived" ||
          phase === "in_progress") && (
          <MovviSheet snaps={[44, 80]} initial={44}>
            <DriverEnRoute ride={ride} driver={driverInfo} onCancel={cancelRide} />
          </MovviSheet>
        )}

      {ride && phase === "completed" && (
        <MovviSheet snaps={[40]} initial={40}>
          <div className="pt-2 text-center">
            <div className="mx-auto mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary text-3xl">
              ✓
            </div>
            <h2 className="font-display text-xl font-bold">Viagem concluída</h2>
            {ride.final_price && (
              <p className="mt-1 text-2xl font-bold text-primary">
                {formatBRL(Number(ride.final_price))}
              </p>
            )}
            <button
              onClick={resetRide}
              className="mt-6 w-full rounded-2xl bg-primary py-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30"
            >
              Pedir outra corrida
            </button>
          </div>
        </MovviSheet>
      )}
    </div>
  );
}

/* ============================================================ */
/*                         SHEET CONTENT                        */
/* ============================================================ */

/* ---------------- Grupos de serviço ---------------- */
type GroupKey = "corridas" | "envios" | "servicos";
const GROUPS: { key: GroupKey; label: string; items: string[] }[] = [
  { key: "corridas", label: "Corridas", items: ["carro", "moto"] },
  { key: "envios",   label: "Envios",   items: ["entregas"] },
  { key: "servicos", label: "Serviços", items: ["guincho", "fretes", "mudancas"] },
];
function groupOf(uiKey: string): GroupKey {
  return GROUPS.find((g) => g.items.includes(uiKey))?.key ?? "corridas";
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
  onClearDestination,
  route,
  busy,
  error,
  uiCategoryKey,
  setUiCategoryKey,
  driversCount,
  onSubmit,
  searchInputRef,
  gpsFailed,
  gpsErrorMsg,
  gpsRequesting,
  onRetryGps,
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
  onClearDestination: () => void;
  route: RouteResult | null;
  busy: boolean;
  error: string | null;
  uiCategoryKey: string;
  setUiCategoryKey: (k: string) => void;
  driversCount: number;
  onSubmit: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  gpsFailed: boolean;
  gpsErrorMsg: string;
  gpsRequesting: boolean;
  onRetryGps: () => void;
}) {
  const km = route ? route.distanceMeters / 1000 : 0;
  const min = route ? route.durationSeconds / 60 : 0;

  const [activeGroup, setActiveGroup] = useState<GroupKey>(() => groupOf(uiCategoryKey));
  const [envioMode, setEnvioMode] = useState<"enviar" | "receber">("enviar");
  const [envioSize, setEnvioSize] = useState<"P" | "M" | "G">("P");

  // Quando o usuário define um destino, garantimos uma categoria válida no grupo ativo.
  useEffect(() => {
    if (!destination) return;
    const items = GROUPS.find((g) => g.key === activeGroup)?.items ?? [];
    if (!items.includes(uiCategoryKey) && items[0]) setUiCategoryKey(items[0]);
  }, [destination, activeGroup, uiCategoryKey, setUiCategoryKey]);

  const groupItems = useMemo(
    () =>
      (GROUPS.find((g) => g.key === activeGroup)?.items ?? [])
        .map((k) => UI_CATEGORIES.find((c) => c.key === k))
        .filter((c): c is UiCategory => !!c),
    [activeGroup],
  );

  const friendly = geo?.friendly || "";
  const region = geo?.region || "";
  const approximate = !!geo?.approximate;
  const primaryLine = friendly || (approximate ? "Localização aproximada" : "");
  

  return (
    <div className="pt-1">
      {/* Endereço atual — toque abre detalhes. Em caso de falha de GPS, mostra erro inline com retry. */}
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
              {gpsErrorMsg || "Não foi possível obter sua localização."}
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
      ) : (
        <button
          type="button"
          onClick={onOpenAddressDetails}
          className="mb-2.5 flex w-full items-center gap-2.5 rounded-2xl bg-primary/10 px-3 py-2 text-left ring-1 ring-primary/30 transition active:scale-[0.99] hover:bg-primary/15"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <MapPin className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-primary leading-none">
              Você está em
            </div>
            {addressStatus === "loading" && !primaryLine && !region ? (
              <div className="mt-0.5 truncate text-[12px] font-medium leading-tight text-muted-foreground">
                Obtendo localização...
              </div>
            ) : primaryLine || region ? (
              <>
                {primaryLine && (
                  <div
                    className={`mt-0.5 truncate text-[13px] leading-tight ${
                      approximate && !friendly
                        ? "font-medium text-muted-foreground"
                        : "font-semibold text-foreground"
                    }`}
                  >
                    {primaryLine}
                  </div>
                )}
                {region && (
                  <div className="truncate text-[11px] font-semibold text-foreground">{region}</div>
                )}
              </>
            ) : addressStatus === "failed" && hasPosition && position ? (
              <>
                <div className="mt-0.5 truncate text-[13px] font-medium leading-tight text-muted-foreground">
                  Coordenadas GPS
                </div>
                <div className="truncate font-mono text-[11px] font-semibold text-foreground">
                  lat: {position.lat.toFixed(6)} · lng: {position.lng.toFixed(6)}
                </div>
              </>
            ) : (
              <div className="mt-0.5 truncate text-[12px] font-medium leading-tight text-muted-foreground">
                {hasPosition ? "Localização aproximada" : "Localização indisponível"}
              </div>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}


      {/* "Para onde você vai?" — sempre em destaque */}
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

      {/* Sugestões ao vivo */}
      {suggestions.length > 0 && !destination && (
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
      {!destination && suggestions.length === 0 && (
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

      {/* COM destino: rota + grupos + opções */}
      {destination && (
        <>
          <div className="mb-2.5 flex items-center gap-2 rounded-xl bg-background/60 px-3 py-2 ring-1 ring-border">
            <MapPin className="h-4 w-4 shrink-0 text-destructive" />
            <span className="line-clamp-2 flex-1 text-[12.5px] font-medium">
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

          {route && (
            <div className="mb-2.5 grid grid-cols-3 gap-2">
              <Stat
                icon={<Clock className="h-3.5 w-3.5" />}
                label="Tempo"
                value={fmtMin(route.durationSeconds)}
                highlight
              />
              <Stat
                icon={<Navigation2 className="h-3.5 w-3.5" />}
                label="Distância"
                value={fmtKm(route.distanceMeters)}
              />
              <Stat
                icon={<Zap className="h-3.5 w-3.5" />}
                label="Motoristas"
                value={`${driversCount}`}
              />
            </div>
          )}

          {/* Tabs dos grupos */}
          <div className="mb-2.5 flex gap-1 rounded-2xl bg-background/60 p-1 ring-1 ring-border">
            {GROUPS.map((g) => {
              const active = activeGroup === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setActiveGroup(g.key)}
                  className={`flex-1 rounded-xl px-2 py-2 text-[12px] font-bold transition ${
                    active
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>

          {/* Conteúdo do grupo */}
          {activeGroup === "envios" ? (
            <EnviosBlock
              mode={envioMode}
              setMode={setEnvioMode}
              size={envioSize}
              setSize={setEnvioSize}
              fare={route ? estimateFare("envios", km, min) : null}
            />
          ) : (
            <div className="-mx-1 mb-2.5 flex gap-2 overflow-x-auto px-1 pb-1">
              {groupItems.map((c) => {
                const active = c.key === uiCategoryKey;
                const fare = route ? estimateFare(c.backend, km, min) : null;
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setUiCategoryKey(c.key)}
                    className={`flex w-[120px] shrink-0 flex-col items-start gap-1 rounded-2xl border-2 px-3 py-2.5 text-left transition active:scale-95 ${
                      active
                        ? "border-primary bg-primary/10 shadow-md shadow-primary/15"
                        : "border-border bg-background/60 hover:border-primary/40"
                    }`}
                  >
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-lg ${
                        active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-[12px] font-semibold leading-tight">{c.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {c.tagline}
                    </span>
                    {fare != null && (
                      <span
                        className={`mt-0.5 text-[13px] font-bold ${
                          active ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {formatBRL(fare)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {error && (
            <p className="mb-2 rounded-xl bg-destructive/15 px-3 py-2 text-xs text-destructive-foreground ring-1 ring-destructive/40">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!route || busy}
            onClick={onSubmit}
            className="w-full rounded-2xl bg-primary py-3.5 text-[14px] font-bold text-primary-foreground shadow-xl shadow-primary/25 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? "Solicitando..."
              : activeGroup === "envios"
                ? envioMode === "enviar"
                  ? "Solicitar entrega"
                  : "Solicitar coleta"
                : `Solicitar ${UI_CATEGORIES.find((c) => c.key === uiCategoryKey)?.label ?? "MOVVI"}`}
          </button>
        </>
      )}
    </div>
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
  onCancel,
}: {
  category: RideCategory;
  onCancel: () => void;
}) {
  const cat = RIDE_CATEGORIES.find((c) => c.key === category)!;
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/15">
        <span className="relative flex h-14 w-14 items-center justify-center text-4xl">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
          <span className="relative">{cat.emoji}</span>
        </span>
      </div>
      <h2 className="font-display text-lg font-bold">
        Procurando motoristas próximos…
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Avisaremos assim que alguém aceitar sua corrida.
      </p>
      <button
        onClick={onCancel}
        className="mt-5 w-full rounded-2xl border border-destructive/40 bg-destructive/10 py-3 text-sm font-semibold text-destructive-foreground hover:bg-destructive/20"
      >
        Cancelar solicitação
      </button>
    </div>
  );
}

function DriverEnRoute({
  ride,
  driver,
  onCancel,
}: {
  ride: RideRow;
  driver: DriverRow;
  onCancel: () => void;
}) {
  const phaseLabel =
    ride.status === "driver_arrived"
      ? "Seu motorista chegou"
      : ride.status === "in_progress"
        ? "Em viagem para o destino"
        : "Motorista a caminho";
  return (
    <div>
      <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-widest text-primary">
        {phaseLabel}
      </div>
      <div className="flex items-center gap-3 rounded-2xl bg-background/60 p-3 ring-1 ring-border">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-2xl">
          {driver.selfie_url ? (
            <img
              src={driver.selfie_url}
              alt={driver.name}
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            "👤"
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{driver.name}</span>
            <span className="inline-flex items-center gap-0.5 text-xs text-yellow-400">
              <Star className="h-3 w-3 fill-current" />{" "}
              {driver.rating?.toFixed(1) ?? "5.0"}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {driver.vehicle_color} · {driver.vehicle_model}
          </div>
          <div className="mt-1 inline-flex items-center rounded bg-white px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-black">
            {driver.vehicle_plate}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
        <Action icon={<Phone className="h-4 w-4" />} label="Ligar" />
        <Action icon={<Navigation2 className="h-4 w-4" />} label="Compartilhar" />
        <Action
          icon={<Shield className="h-4 w-4" />}
          label="SOS"
          tone="destructive"
        />
        <button
          onClick={onCancel}
          className="flex flex-col items-center gap-1 rounded-xl bg-background/60 py-3 ring-1 ring-border hover:ring-destructive/50"
        >
          <X className="h-4 w-4" />
          <span className="text-[11px]">Cancelar</span>
        </button>
      </div>

      <div className="mt-3 rounded-xl bg-background/60 px-3 py-2 text-xs ring-1 ring-border">
        <div className="truncate">
          <span className="text-muted-foreground">Destino:</span>{" "}
          {ride.destination_name}
        </div>
        {ride.estimated_price && (
          <div className="mt-1 text-muted-foreground">
            Estimativa:{" "}
            <span className="font-semibold text-foreground">
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
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "destructive";
}) {
  return (
    <button
      className={`flex flex-col items-center gap-1 rounded-xl py-3 ring-1 ring-border ${
        tone === "destructive"
          ? "bg-destructive/10 text-destructive-foreground hover:bg-destructive/20"
          : "bg-background/60 hover:ring-primary/40"
      }`}
    >
      {icon}
      <span className="text-[11px]">{label}</span>
    </button>
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
      console.log("Manual selecionado:", label, point.lat, point.lng);
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

  const showDevBadge = isDevelopmentEnvironment();

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
            console.log("[MOVVI] Clique em", primaryLabel);
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
