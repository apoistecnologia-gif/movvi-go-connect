import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, Polyline, OverlayView } from "@react-google-maps/api";
import {
  Clock, MapPin, Navigation2, Phone, Route as RouteIcon, Search, Shield, Star, X,
} from "lucide-react";
import { MovviMap } from "@/components/MovviMap";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { BottomSheet } from "@/components/BottomSheet";
import { supabase } from "@/integrations/supabase/client";
import { BRASILIA_CENTER } from "@/lib/googleMaps";
import { computeRoute, type RouteResult } from "@/lib/routes.functions";
import { requestRide } from "@/lib/ride.functions";
import { useNearbyDrivers } from "@/hooks/useNearbyDrivers";
import {
  RIDE_CATEGORIES, estimateFare, formatBRL, type RideCategory,
} from "@/lib/rideCategories";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/passageiro/app")({
  head: () => ({ meta: [{ title: "App do Passageiro — MOVVI DRIVE" }] }),
  component: PassageiroApp,
});

type LatLng = { lat: number; lng: number };
type Suggestion = { placeId: string; primary: string; secondary: string };
type RideRow = Database["public"]["Tables"]["rides"]["Row"];
type DriverRow = Database["public"]["Tables"]["drivers"]["Row"];

const fmtMin = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;
const fmtKm  = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

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

function PassageiroApp() {
  const navigate = useNavigate();
  const callComputeRoute = useServerFn(computeRoute);
  const callRequestRide  = useServerFn(requestRide);

  const [userId, setUserId] = useState<string | null>(null);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number>(40);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [destinationText, setDestinationText] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [destination, setDestination] = useState<{ point: LatLng; label: string } | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [category, setCategory] = useState<RideCategory>("carros");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ride lifecycle
  const [rideId, setRideId] = useState<string | null>(null);
  const [ride, setRide] = useState<RideRow | null>(null);
  const [driverInfo, setDriverInfo] = useState<DriverRow | null>(null);

  const mapRef = useRef<google.maps.Map | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);

  // motoristas em tempo real (mesma categoria selecionada)
  const drivers = useNearbyDrivers({ category });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate({ to: "/passageiro/login" });
      else setUserId(data.user.id);
    });
  }, [navigate]);

  // GPS contínuo
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsError("GPS indisponível neste dispositivo"); return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy || 40);
        setGpsError(null);
      },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Autocomplete (Places API New)
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = destinationText.trim();
    if (q.length < 3 || destination) { setSuggestions([]); return; }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const places = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        if (!sessionTokenRef.current) sessionTokenRef.current = new places.AutocompleteSessionToken();
        const req: google.maps.places.AutocompleteRequest = {
          input: q, sessionToken: sessionTokenRef.current,
          language: "pt-BR", region: "br", includedRegionCodes: ["br"],
        };
        if (position) req.locationBias = {
          center: new google.maps.LatLng(position.lat, position.lng), radius: 50000,
        } as google.maps.CircleLiteral;
        const { suggestions: result } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        setSuggestions(result
          .map((s) => s.placePrediction)
          .filter((p): p is google.maps.places.PlacePrediction => !!p)
          .slice(0, 6)
          .map((p) => ({
            placeId: p.placeId,
            primary: p.mainText?.toString() ?? p.text.toString(),
            secondary: p.secondaryText?.toString() ?? "",
          })));
      } catch (e) { console.error("autocomplete error", e); }
    }, 250);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [destinationText, position, destination]);

  async function pickSuggestion(s: Suggestion) {
    setError(null);
    try {
      const places = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
      const place = new places.Place({ id: s.placeId });
      await place.fetchFields({ fields: ["location", "formattedAddress", "displayName"] });
      const loc = place.location; if (!loc) throw new Error("Local sem coordenadas.");
      const point: LatLng = { lat: loc.lat(), lng: loc.lng() };
      const label = place.formattedAddress ?? `${s.primary} ${s.secondary}`.trim();
      setDestination({ point, label });
      setDestinationText(label);
      setSuggestions([]);
      sessionTokenRef.current = null;
      setSearchOpen(false);
      await calcRoute(point);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao buscar o local.");
    }
  }

  async function calcRoute(dest: LatLng) {
    if (!position) { setError("Aguardando GPS para calcular a rota."); return; }
    setBusy(true); setError(null); setRoute(null);
    try {
      const result = await callComputeRoute({ data: { origin: position, destination: dest } });
      setRoute(result);
      if (mapRef.current) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(position); bounds.extend(dest);
        mapRef.current.fitBounds(bounds, 80);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao calcular rota.");
    } finally { setBusy(false); }
  }

  function clearDestination() {
    setDestination(null); setDestinationText(""); setRoute(null);
    setError(null); setSuggestions([]);
  }

  async function submitRide() {
    if (!position || !destination || !route) return;
    setBusy(true); setError(null);
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
    } finally { setBusy(false); }
  }

  // Realtime da corrida ativa
  useEffect(() => {
    if (!rideId) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("rides").select("*").eq("id", rideId).maybeSingle();
      if (active && data) setRide(data);
    };
    load();
    const ch = supabase
      .channel(`ride-${rideId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` },
        (p) => setRide(p.new as RideRow))
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [rideId]);

  // Carrega dados do motorista quando atribuído
  useEffect(() => {
    if (!ride?.driver_id) { setDriverInfo(null); return; }
    supabase.from("drivers").select("*").eq("user_id", ride.driver_id).maybeSingle()
      .then(({ data }) => setDriverInfo(data));
  }, [ride?.driver_id]);

  function resetRide() {
    setRideId(null); setRide(null); setDriverInfo(null);
    clearDestination();
  }

  const polyPath = useMemo(
    () => (route ? decodePolyline(route.encodedPolyline) : []),
    [route],
  );

  const center = position ?? BRASILIA_CENTER;
  const phase = ride?.status;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0">
        <MovviMap
          center={center} zoom={position ? 16 : 13} height="100%"
          onLoad={(m) => { mapRef.current = m; }}
        >
          {/* círculo de precisão */}
          {position && window.google?.maps?.Circle && (
            <OverlayView position={position} mapPaneName="overlayLayer">
              <span />
            </OverlayView>
          )}

          {/* marcador do passageiro */}
          {position && (
            <Marker
              position={position}
              zIndex={9999}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 9, fillColor: "#3b82f6", fillOpacity: 1,
                strokeColor: "#ffffff", strokeWeight: 3,
              }}
            />
          )}

          {/* motoristas online */}
          {!ride && drivers.map((d) => (
            <Marker
              key={d.user_id}
              position={{ lat: d.current_lat, lng: d.current_lng }}
              icon={{
                path: "M5 11l1.5-4.5h11L19 11M6 14h12M7.5 17a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm12 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM5 11h14v4H5z",
                fillColor: "#8DD92B", fillOpacity: 1,
                strokeColor: "#05070D", strokeWeight: 1.4,
                scale: 1.2, anchor: new google.maps.Point(12, 14),
              }}
            />
          ))}

          {/* destino */}
          {destination && (
            <Marker
              position={destination.point}
              icon={{
                path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
                fillColor: "#ef4444", fillOpacity: 1,
                strokeColor: "#05070D", strokeWeight: 2, scale: 1.6,
                anchor: new google.maps.Point(12, 22),
              }}
            />
          )}

          {polyPath.length > 0 && (
            <Polyline path={polyPath} options={{
              strokeColor: "#8DD92B", strokeOpacity: 0.95, strokeWeight: 6, geodesic: true,
            }} />
          )}
        </MovviMap>
      </div>

      <MovviHeader variant="floating" logoutRedirect="/" />

      {/* Badge motoristas próximos */}
      {!ride && (
        <div className="pointer-events-none absolute left-1/2 top-[68px] z-20 -translate-x-1/2 animate-fade-in">
          <div className="rounded-full bg-card/90 px-3 py-1 text-[11px] font-semibold text-foreground shadow-lg ring-1 ring-border backdrop-blur-md">
            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary align-middle" />
            {drivers.length} {drivers.length === 1 ? "motorista" : "motoristas"} próximos
          </div>
        </div>
      )}

      {gpsError && (
        <div className="absolute left-1/2 top-[100px] z-10 -translate-x-1/2 rounded-full bg-destructive/90 px-4 py-1.5 text-xs text-destructive-foreground shadow-lg backdrop-blur">
          GPS: {gpsError}
        </div>
      )}

      {/* ===== Bottom Sheet ===== */}
      {!ride && (
        <BottomSheet initial={destination ? "mid" : "peek"}>
          {!destination ? (
            <DestinationStart
              drivers={drivers.length}
              onOpenSearch={() => setSearchOpen(true)}
            />
          ) : (
            <CategoryAndConfirm
              destinationLabel={destination.label}
              route={route}
              busy={busy}
              error={error}
              category={category}
              setCategory={setCategory}
              drivers={drivers}
              onClear={clearDestination}
              onSubmit={submitRide}
            />
          )}
        </BottomSheet>
      )}

      {/* ===== Procurando motorista ===== */}
      {ride && (phase === "searching_driver" || phase === "offered_to_driver") && (
        <BottomSheet snap="mid">
          <SearchingPanel
            category={category}
            onCancel={async () => {
              await supabase.from("rides")
                .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: userId })
                .eq("id", ride.id);
              resetRide();
            }}
          />
        </BottomSheet>
      )}

      {/* ===== Motorista a caminho / em viagem ===== */}
      {ride && driverInfo && (phase === "driver_assigned" || phase === "driver_arrived" || phase === "in_progress") && (
        <BottomSheet snap="mid">
          <DriverEnRoute
            ride={ride}
            driver={driverInfo}
            onCancel={async () => {
              await supabase.from("rides")
                .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: userId })
                .eq("id", ride.id);
              resetRide();
            }}
          />
        </BottomSheet>
      )}

      {/* ===== Finalizada ===== */}
      {ride && phase === "completed" && (
        <BottomSheet snap="mid">
          <div className="text-center">
            <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary text-2xl">✓</div>
            <h2 className="text-xl font-bold">Viagem concluída</h2>
            {ride.final_price && (
              <p className="mt-2 text-lg text-primary font-semibold">{formatBRL(Number(ride.final_price))}</p>
            )}
            <button onClick={resetRide}
              className="mt-6 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground">
              Pedir outra corrida
            </button>
          </div>
        </BottomSheet>
      )}

      {/* ===== Tela cheia de busca ===== */}
      {searchOpen && (
        <SearchOverlay
          value={destinationText}
          setValue={setDestinationText}
          suggestions={suggestions}
          onPick={pickSuggestion}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <BottomNav items={PASSENGER_NAV} floating />
    </div>
  );
}

/* ----------------------------- Sub-componentes ----------------------------- */

function DestinationStart({ drivers, onOpenSearch }: { drivers: number; onOpenSearch: () => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Navigation2 className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold tracking-tight">Para onde vamos?</h2>
        <span className="ml-auto text-[11px] font-medium text-primary">
          {drivers} {drivers === 1 ? "motorista" : "motoristas"} por perto
        </span>
      </div>
      <button
        type="button" onClick={onOpenSearch}
        className="flex w-full items-center gap-3 rounded-2xl bg-background/60 px-4 py-4 text-left ring-1 ring-border transition hover:ring-primary/40"
      >
        <Search className="h-5 w-5 text-primary" />
        <span className="flex-1 text-sm text-muted-foreground">Insira o endereço de destino</span>
      </button>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        {[
          { label: "Casa",  emoji: "🏠" },
          { label: "Trabalho", emoji: "💼" },
          { label: "Favoritos", emoji: "⭐" },
        ].map((s) => (
          <button key={s.label}
            onClick={onOpenSearch}
            className="flex flex-col items-center gap-1 rounded-xl bg-background/60 px-2 py-3 ring-1 ring-border hover:ring-primary/40">
            <span className="text-lg">{s.emoji}</span>
            <span className="text-muted-foreground">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CategoryAndConfirm({
  destinationLabel, route, busy, error, category, setCategory, drivers, onClear, onSubmit,
}: {
  destinationLabel: string;
  route: RouteResult | null;
  busy: boolean;
  error: string | null;
  category: RideCategory;
  setCategory: (c: RideCategory) => void;
  drivers: { user_id: string }[];
  onClear: () => void;
  onSubmit: () => void;
}) {
  const km = route ? route.distanceMeters / 1000 : 0;
  const min = route ? route.durationSeconds / 60 : 0;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-destructive" />
        <span className="line-clamp-1 flex-1 text-sm font-medium">{destinationLabel}</span>
        <button onClick={onClear} className="rounded-full p-1 hover:bg-accent/40">
          <X className="h-4 w-4" />
        </button>
      </div>
      {route && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-background/60 px-3 py-2 ring-1 ring-border">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3 w-3" /> Duração
            </div>
            <div className="text-base font-semibold text-primary">{fmtMin(route.durationSeconds)}</div>
          </div>
          <div className="rounded-xl bg-background/60 px-3 py-2 ring-1 ring-border">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <RouteIcon className="h-3 w-3" /> Distância
            </div>
            <div className="text-base font-semibold">{fmtKm(route.distanceMeters)}</div>
          </div>
        </div>
      )}

      <h3 className="mt-2 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Escolha a categoria
      </h3>
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
        {RIDE_CATEGORIES.map((c) => {
          const active = c.key === category;
          const fare = route ? estimateFare(c.key, km, min) : null;
          return (
            <button key={c.key} type="button" onClick={() => setCategory(c.key)}
              className={`flex w-28 shrink-0 flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 transition ${
                active ? "border-primary bg-primary/10" : "border-border bg-background/60 hover:border-primary/40"
              }`}>
              <span className="text-2xl">{c.emoji}</span>
              <span className="text-[11px] font-semibold">{c.label}</span>
              <span className="text-[10px] text-muted-foreground">{drivers.length} por perto</span>
              {fare != null && (
                <span className={`text-xs font-bold ${active ? "text-primary" : "text-foreground"}`}>
                  {formatBRL(fare)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-destructive/15 px-3 py-2 text-xs text-destructive-foreground ring-1 ring-destructive/40">
          {error}
        </p>
      )}

      <button type="button" disabled={!route || busy} onClick={onSubmit}
        className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? "Solicitando..." : "Solicitar MOVVI"}
      </button>
    </div>
  );
}

function SearchingPanel({ category, onCancel }: { category: RideCategory; onCancel: () => void }) {
  const cat = RIDE_CATEGORIES.find((c) => c.key === category)!;
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
        <span className="relative flex h-12 w-12 items-center justify-center text-3xl">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
          <span className="relative">{cat.emoji}</span>
        </span>
      </div>
      <h2 className="text-lg font-semibold">Procurando motoristas próximos...</h2>
      <p className="mt-1 text-xs text-muted-foreground">Avisaremos quando alguém aceitar.</p>
      <button onClick={onCancel}
        className="mt-5 w-full rounded-xl border border-destructive/40 bg-destructive/10 py-3 text-sm font-semibold text-destructive-foreground hover:bg-destructive/20">
        Cancelar solicitação
      </button>
    </div>
  );
}

function DriverEnRoute({
  ride, driver, onCancel,
}: { ride: RideRow; driver: DriverRow; onCancel: () => void }) {
  const phaseLabel =
    ride.status === "driver_arrived" ? "Seu motorista chegou" :
    ride.status === "in_progress" ? "Em viagem para o destino" :
    "Motorista a caminho";
  return (
    <div>
      <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-widest text-primary">
        {phaseLabel}
      </div>
      <div className="flex items-center gap-3 rounded-2xl bg-background/60 p-3 ring-1 ring-border">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-2xl">
          {driver.selfie_url ? (
            <img src={driver.selfie_url} alt={driver.name}
              className="h-14 w-14 rounded-full object-cover" />
          ) : "👤"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{driver.name}</span>
            <span className="inline-flex items-center gap-0.5 text-xs text-yellow-400">
              <Star className="h-3 w-3 fill-current" /> {driver.rating?.toFixed(1) ?? "5.0"}
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
        <ActionBtn icon={<Phone className="h-4 w-4" />} label="Ligar" />
        <ActionBtn icon={<Navigation2 className="h-4 w-4" />} label="Compartilhar" />
        <ActionBtn icon={<Shield className="h-4 w-4" />} label="SOS" tone="destructive" />
        <button onClick={onCancel}
          className="flex flex-col items-center gap-1 rounded-xl bg-background/60 py-3 ring-1 ring-border hover:ring-destructive/50">
          <X className="h-4 w-4" />
          <span className="text-[11px]">Cancelar</span>
        </button>
      </div>

      <div className="mt-3 rounded-xl bg-background/60 px-3 py-2 text-xs ring-1 ring-border">
        <div className="truncate"><span className="text-muted-foreground">Destino:</span> {ride.destination_name}</div>
        {ride.estimated_price && (
          <div className="mt-1 text-muted-foreground">
            Estimativa: <span className="font-semibold text-foreground">{formatBRL(Number(ride.estimated_price))}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, tone }: { icon: React.ReactNode; label: string; tone?: "destructive" }) {
  return (
    <button className={`flex flex-col items-center gap-1 rounded-xl py-3 ring-1 ring-border ${
      tone === "destructive" ? "bg-destructive/10 text-destructive-foreground hover:bg-destructive/20" : "bg-background/60 hover:ring-primary/40"
    }`}>
      {icon}
      <span className="text-[11px]">{label}</span>
    </button>
  );
}

function SearchOverlay({
  value, setValue, suggestions, onPick, onClose,
}: {
  value: string;
  setValue: (s: string) => void;
  suggestions: Suggestion[];
  onPick: (s: Suggestion) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button onClick={onClose} aria-label="Fechar"
          className="rounded-full p-2 hover:bg-accent/40">
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-card px-3 py-2 ring-1 ring-border focus-within:ring-primary">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Para onde você vai?"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          {value && (
            <button onClick={() => setValue("")} aria-label="Limpar">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {suggestions.length === 0 && value.trim().length < 3 && (
          <li className="px-4 pt-6">
            <h3 className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">Atalhos</h3>
            {[
              { label: "Casa", icon: "🏠" }, { label: "Trabalho", icon: "💼" }, { label: "Adicionar favorito", icon: "⭐" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3 border-b border-border/60 py-3 text-sm">
                <span className="text-lg">{s.icon}</span>
                <span className="flex-1">{s.label}</span>
                <span className="text-xs text-muted-foreground">configurar</span>
              </div>
            ))}
          </li>
        )}
        {suggestions.map((s) => (
          <li key={s.placeId}>
            <button type="button" onClick={() => onPick(s)}
              className="flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left text-sm hover:bg-accent/30">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="flex flex-col">
                <span className="font-medium">{s.primary}</span>
                {s.secondary && <span className="text-xs text-muted-foreground">{s.secondary}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
