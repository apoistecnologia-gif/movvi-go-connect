import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Marker, Polyline } from "@react-google-maps/api";
import {
  ArrowLeft,
  Briefcase,
  Clock,
  Crosshair,
  Home as HomeIcon,
  LogOut,
  MapPin,
  Navigation2,
  Phone,
  Search,
  Shield,
  Star,
  X,
  Zap,
} from "lucide-react";
import { MovviMap } from "@/components/MovviMap";
import { MovviSheet, type MovviSheetHandle } from "@/components/MovviSheet";
import { supabase } from "@/integrations/supabase/client";
import { BRAZIL_CENTER, isBrazilCoordinate, purgeForeignMapCache } from "@/lib/googleMaps";
import { computeRoute, type RouteResult } from "@/lib/routes.functions";
import { requestRide } from "@/lib/ride.functions";
import { useNearbyDrivers } from "@/hooks/useNearbyDrivers";
import {
  RIDE_CATEGORIES,
  estimateFare,
  formatBRL,
  type RideCategory,
} from "@/lib/rideCategories";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/passageiro/app")({
  head: () => ({ meta: [{ title: "MOVVI Drive — Passageiro" }] }),
  component: PassageiroApp,
});

type LatLng = { lat: number; lng: number };
type Suggestion = { placeId: string; primary: string; secondary: string };
type RideRow = Database["public"]["Tables"]["rides"]["Row"];
type DriverRow = Database["public"]["Tables"]["drivers"]["Row"];

const RECENT_KEY = "movvi.recent_destinations";

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

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  const [position, setPosition] = useState<LatLng | null>(null);
  const [gpsState, setGpsState] = useState<
    "idle" | "requesting" | "granted" | "denied" | "unavailable"
  >("idle");
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string>("");

  const [destinationText, setDestinationText] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [destination, setDestination] = useState<{
    point: LatLng;
    label: string;
  } | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [category, setCategory] = useState<RideCategory>("carros");
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

  /* ---------------------- GPS ---------------------- */
  const requestGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsState("unavailable");
      return;
    }
    setGpsState("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!isBrazilCoordinate(lat, lng)) {
          console.warn("[MOVVI] GPS fora do Brasil — ignorando", { lat, lng });
          setGpsState("denied");
          return;
        }
        setPosition({ lat, lng });
        setGpsState("granted");
        navigator.geolocation.watchPosition(
          (p) => {
            const la = p.coords.latitude;
            const ln = p.coords.longitude;
            if (isBrazilCoordinate(la, ln)) setPosition({ lat: la, lng: ln });
          },
          () => undefined,
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
        );
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGpsState("denied");
        else setGpsState("denied");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }, []);

  useEffect(() => {
    purgeForeignMapCache();
    requestGps();
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
      sheetRef.current?.snapTo(62);
      searchInputRef.current?.blur();
      await calcRoute(point);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao buscar o local.");
    }
  }

  async function calcRoute(dest: LatLng) {
    if (!position) {
      setError("Aguardando GPS para calcular a rota.");
      return;
    }
    setBusy(true);
    setError(null);
    setRoute(null);
    try {
      const result = await callComputeRoute({
        data: { origin: position, destination: dest },
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
    sheetRef.current?.snapTo(32);
    if (mapRef.current && position) {
      mapRef.current.panTo(position);
      mapRef.current.setZoom(16);
    }
  }

  async function submitRide() {
    if (!position || !destination || !route) return;
    setBusy(true);
    setError(null);
    try {
      const km = route.distanceMeters / 1000;
      const min = route.durationSeconds / 60;
      const fare = estimateFare(category, km, min);
      const { rideId: newId } = await callRequestRide({
        data: {
          origin: position,
          origin_name: "Localização atual",
          destination: destination.point,
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
    sheetRef.current?.snapTo(86);
    setTimeout(() => searchInputRef.current?.focus(), 220);
  }

  const polyPath = useMemo(
    () => (route ? decodePolyline(route.encodedPolyline) : []),
    [route],
  );

  const center = position && isBrazilCoordinate(position.lat, position.lng) ? position : BRAZIL_CENTER;
  const phase = ride?.status;

  /* ---------------------- GPS denied screen ---------------------- */
  if (gpsState === "denied" || gpsState === "unavailable") {
    return <GpsDeniedScreen onRetry={requestGps} onHome={() => navigate({ to: "/" })} />;
  }

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-background text-foreground">
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
            <Marker
              position={position}
              zIndex={9999}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: "#3b82f6",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 3,
              }}
            />
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

      {/* TOP BAR — compacto, flutuante */}
      <div className="absolute inset-x-0 top-0 z-40 px-3 pt-[calc(env(safe-area-inset-top)+10px)]">
        <div className="mx-auto flex max-w-5xl items-center gap-2 rounded-2xl bg-card/90 px-2 py-1.5 shadow-xl ring-1 ring-border/60 backdrop-blur-xl">
          <Link
            to="/"
            aria-label="Voltar"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition hover:bg-accent/40 active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex shrink-0 items-center gap-1.5 px-1">
            <LogoMark />
          </div>
          <div className="min-w-0 flex-1 px-1">
            <div className="truncate text-[13px] font-semibold leading-tight">
              {userName}
            </div>
            <div className="truncate text-[10px] uppercase tracking-widest text-primary">
              Passageiro
            </div>
          </div>
          <Link
            to="/"
            aria-label="Início"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition hover:bg-accent/40 active:scale-95"
          >
            <HomeIcon className="h-4 w-4" />
          </Link>
          <button
            onClick={handleLogout}
            aria-label="Sair"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive ring-1 ring-destructive/30 transition hover:bg-destructive/25 active:scale-95"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Floating controls */}
      <div className="pointer-events-none absolute right-3 z-30" style={{ bottom: "calc(32vh + 16px)" }}>
        <button
          onClick={recenter}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-card text-foreground shadow-2xl ring-1 ring-border transition active:scale-95"
          aria-label="Recentralizar"
        >
          <Crosshair className="h-5 w-5 text-primary" />
        </button>
      </div>

      {/* Nearby drivers pill */}
      {!ride && gpsState === "granted" && (
        <div className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+74px)] z-30 -translate-x-1/2">
          <div className="flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1 text-[11px] font-semibold shadow-lg ring-1 ring-border backdrop-blur-md">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {drivers.length} {drivers.length === 1 ? "motorista" : "motoristas"} por perto
          </div>
        </div>
      )}

      {/* BOTTOM SHEET — novo, próprio do MOVVI */}
      {!ride && (
        <MovviSheet ref={sheetRef} snaps={[32, 62, 86]} initial={32}>
          <SheetContent
            destination={destination}
            destinationText={destinationText}
            setDestinationText={setDestinationText}
            suggestions={suggestions}
            recent={recent}
            onFocusSearch={focusSearch}
            onPick={pickSuggestion}
            onClearDestination={clearDestination}
            route={route}
            busy={busy}
            error={error}
            category={category}
            setCategory={setCategory}
            driversCount={drivers.length}
            onSubmit={submitRide}
            searchInputRef={searchInputRef}
          />
        </MovviSheet>
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

function SheetContent({
  destination,
  destinationText,
  setDestinationText,
  suggestions,
  recent,
  onFocusSearch,
  onPick,
  onClearDestination,
  route,
  busy,
  error,
  category,
  setCategory,
  driversCount,
  onSubmit,
  searchInputRef,
}: {
  destination: { point: LatLng; label: string } | null;
  destinationText: string;
  setDestinationText: (s: string) => void;
  suggestions: Suggestion[];
  recent: Recent[];
  onFocusSearch: () => void;
  onPick: (s: Suggestion) => void;
  onClearDestination: () => void;
  route: RouteResult | null;
  busy: boolean;
  error: string | null;
  category: RideCategory;
  setCategory: (c: RideCategory) => void;
  driversCount: number;
  onSubmit: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const km = route ? route.distanceMeters / 1000 : 0;
  const min = route ? route.durationSeconds / 60 : 0;

  return (
    <div className="pt-1">
      {/* Search bar (sempre visível) */}
      <div className="mb-3">
        <div className="flex items-center gap-3 rounded-2xl bg-background/80 px-4 py-3 ring-1 ring-border focus-within:ring-primary/60">
          <Search className="h-5 w-5 shrink-0 text-primary" />
          <input
            ref={searchInputRef}
            value={destinationText}
            onChange={(e) => {
              if (destination) onClearDestination();
              setDestinationText(e.target.value);
            }}
            onFocus={onFocusSearch}
            placeholder="📍 Para onde você vai?"
            className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-muted-foreground/80"
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

      {/* Suggestions live */}
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
                  <span className="truncate text-sm font-semibold">
                    {s.primary}
                  </span>
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

      {/* Quando NÃO há destino e NÃO há sugestões: atalhos + recentes + categorias */}
      {!destination && suggestions.length === 0 && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <ShortcutChip
              icon={<HomeIcon className="h-4 w-4" />}
              label="Casa"
              onClick={onFocusSearch}
            />
            <ShortcutChip
              icon={<Briefcase className="h-4 w-4" />}
              label="Trabalho"
              onClick={onFocusSearch}
            />
            <ShortcutChip
              icon={<Star className="h-4 w-4" />}
              label="Favoritos"
              onClick={onFocusSearch}
            />
          </div>

          {recent.length > 0 && (
            <>
              <h3 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recentes
              </h3>
              <ul className="mb-4 space-y-1">
                {recent.map((r) => (
                  <li key={r.placeId}>
                    <button
                      type="button"
                      onClick={() => {
                        setDestinationText(r.label);
                        onFocusSearch();
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-accent/30"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground">
                        <Clock className="h-4 w-4" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          {r.label}
                        </span>
                        {r.secondary && (
                          <span className="truncate text-xs text-muted-foreground">
                            {r.secondary}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Categorias
          </h3>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {RIDE_CATEGORIES.map((c) => (
              <div
                key={c.key}
                className="flex w-[88px] shrink-0 flex-col items-center gap-1 rounded-2xl bg-background/60 px-2 py-3 ring-1 ring-border"
              >
                <span className="text-2xl">{c.emoji}</span>
                <span className="text-[11px] font-semibold">{c.label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Quando há destino: rota + categorias + botão solicitar */}
      {destination && (
        <>
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-background/60 px-3 py-2 ring-1 ring-border">
            <MapPin className="h-4 w-4 shrink-0 text-destructive" />
            <span className="line-clamp-2 flex-1 text-[13px] font-medium">
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
            <div className="mb-3 grid grid-cols-3 gap-2">
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

          <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Escolha a categoria
          </h3>
          <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {RIDE_CATEGORIES.map((c) => {
              const active = c.key === category;
              const fare = route ? estimateFare(c.key, km, min) : null;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`flex w-[108px] shrink-0 flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 transition active:scale-95 ${
                    active
                      ? "border-primary bg-primary/10 shadow-lg shadow-primary/15"
                      : "border-border bg-background/60 hover:border-primary/40"
                  }`}
                >
                  <span className="text-2xl">{c.emoji}</span>
                  <span className="text-[11px] font-semibold">{c.label}</span>
                  {fare != null && (
                    <span
                      className={`text-[13px] font-bold ${
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

          {error && (
            <p className="mb-3 rounded-xl bg-destructive/15 px-3 py-2 text-xs text-destructive-foreground ring-1 ring-destructive/40">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!route || busy}
            onClick={onSubmit}
            className="w-full rounded-2xl bg-primary py-4 text-[15px] font-bold text-primary-foreground shadow-xl shadow-primary/25 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Solicitando..." : "Solicitar MOVVI"}
          </button>
        </>
      )}
    </div>
  );
}

/* ============================================================ */
/*                         SUB COMPONENTS                       */
/* ============================================================ */

function ShortcutChip({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl bg-background/60 py-3 ring-1 ring-border transition hover:ring-primary/50 active:scale-95"
    >
      <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary">
        {icon}
      </span>
      <span className="text-[12px] font-medium">{label}</span>
    </button>
  );
}

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
  onRetry,
  onHome,
}: {
  onRetry: () => void;
  onHome: () => void;
}) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <div className="absolute left-4 top-4">
        <button
          onClick={onHome}
          className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-2 text-xs font-medium ring-1 ring-border"
        >
          <ArrowLeft className="h-4 w-4" /> Início
        </button>
      </div>
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15 text-primary">
        <MapPin className="h-9 w-9" />
      </div>
      <h1 className="font-display text-2xl font-bold">
        Não foi possível obter sua localização.
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        A MOVVI precisa do seu GPS para mostrar os motoristas próximos e calcular
        sua corrida. Ative a permissão de localização do navegador e tente novamente.
      </p>
      <button
        onClick={onRetry}
        className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-4 text-sm font-bold text-primary-foreground shadow-xl shadow-primary/30 active:scale-95"
      >
        <Crosshair className="h-4 w-4" /> ATIVAR LOCALIZAÇÃO
      </button>
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
