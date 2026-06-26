import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, Polyline } from "@react-google-maps/api";
import { Clock, MapPin, Navigation2, Route as RouteIcon, Search, X } from "lucide-react";
import { MovviMap } from "@/components/MovviMap";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { BRASILIA_CENTER } from "@/lib/googleMaps";
import { computeRoute, type RouteResult } from "@/lib/routes.functions";

export const Route = createFileRoute("/passageiro/app")({
  head: () => ({ meta: [{ title: "App do Passageiro — MOVVI DRIVE" }] }),
  component: PassageiroApp,
});

type LatLng = { lat: number; lng: number };
type Suggestion = { placeId: string; primary: string; secondary: string };

function formatDuration(s: number) {
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}
function formatDistance(m: number) {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;
    points.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }
  return points;
}

function PassageiroApp() {
  const navigate = useNavigate();
  const callComputeRoute = useServerFn(computeRoute);

  const [position, setPosition] = useState<LatLng | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [destinationText, setDestinationText] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [destination, setDestination] = useState<{ point: LatLng; label: string } | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapRef = useRef<google.maps.Map | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate({ to: "/passageiro/login" });
    });
  }, [navigate]);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsError("GPS indisponível neste dispositivo");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => { setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsError(null); },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Autocomplete (Places API New) via Maps JS browser key
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = destinationText.trim();
    if (q.length < 3 || destination) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const places = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new places.AutocompleteSessionToken();
        }
        const req: google.maps.places.AutocompleteRequest = {
          input: q,
          sessionToken: sessionTokenRef.current,
          language: "pt-BR",
          region: "br",
          includedRegionCodes: ["br"],
        };
        if (position) {
          req.locationBias = {
            center: new google.maps.LatLng(position.lat, position.lng),
            radius: 50000,
          } as google.maps.CircleLiteral;
        }
        const { suggestions: result } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        setSuggestions(
          result
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => !!p)
            .slice(0, 5)
            .map((p) => ({
              placeId: p.placeId,
              primary: p.mainText?.toString() ?? p.text.toString(),
              secondary: p.secondaryText?.toString() ?? "",
            })),
        );
      } catch (e) {
        console.error("autocomplete error", e);
      }
    }, 250);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [destinationText, position, destination]);

  async function pickSuggestion(s: Suggestion) {
    setError(null);
    try {
      const places = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
      const place = new places.Place({ id: s.placeId });
      await place.fetchFields({ fields: ["location", "formattedAddress", "displayName"] });
      const loc = place.location;
      if (!loc) throw new Error("Local sem coordenadas.");
      const point: LatLng = { lat: loc.lat(), lng: loc.lng() };
      const label = place.formattedAddress ?? `${s.primary} ${s.secondary}`.trim();
      setDestination({ point, label });
      setDestinationText(label);
      setSuggestions([]);
      sessionTokenRef.current = null;
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
    setLoading(true);
    setError(null);
    setRoute(null);
    try {
      const result = await callComputeRoute({ data: { origin: position, destination: dest } });
      setRoute(result);
      // fit bounds
      if (mapRef.current) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(position);
        bounds.extend(dest);
        mapRef.current.fitBounds(bounds, 80);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao calcular rota.");
    } finally {
      setLoading(false);
    }
  }

  function clearDestination() {
    setDestination(null);
    setDestinationText("");
    setRoute(null);
    setError(null);
    setSuggestions([]);
  }


  const path = useMemo(
    () => (route ? decodePolyline(route.encodedPolyline) : []),
    [route],
  );

  const center = position ?? BRASILIA_CENTER;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0">
        <MovviMap
          center={center}
          zoom={position ? 16 : 13}
          height="100%"
          onLoad={(m) => { mapRef.current = m; }}
        >
          {position && (
            <Marker
              position={position}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: "#8DD92B",
                fillOpacity: 1,
                strokeColor: "#05070D",
                strokeWeight: 3,
              }}
            />
          )}
          {destination && (
            <Marker
              position={destination.point}
              icon={{
                path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
                fillColor: "#ef4444",
                fillOpacity: 1,
                strokeColor: "#05070D",
                strokeWeight: 2,
                scale: 1.6,
                anchor: new google.maps.Point(12, 22),
              }}
            />
          )}
          {path.length > 0 && (
            <Polyline
              path={path}
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

      <MovviHeader variant="floating" logoutRedirect="/" />

      {gpsError && (
        <div className="absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-full bg-destructive/90 px-4 py-1.5 text-xs text-destructive-foreground shadow-lg backdrop-blur">
          GPS: {gpsError}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-6 pt-4">
        <div className="mx-auto max-w-xl rounded-3xl bg-card/95 p-5 shadow-2xl ring-1 ring-border backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <Navigation2 className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold tracking-tight">Para onde vamos?</h2>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-xl bg-background/60 px-3 py-3 ring-1 ring-border">
              <span className="flex h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_rgba(141,217,43,0.2)]" />
              <input
                type="text"
                disabled
                value={position ? "Localização atual" : "Detectando GPS..."}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="relative">
              <div className="flex items-center gap-3 rounded-xl bg-background/60 px-3 py-3 ring-1 ring-border focus-within:ring-primary">
                <span className="flex h-2 w-2 rounded-full bg-destructive" />
                <input
                  type="text"
                  value={destinationText}
                  onChange={(e) => { setDestinationText(e.target.value); if (destination) setDestination(null); if (route) setRoute(null); }}
                  placeholder="Insira o endereço de destino"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {destinationText ? (
                  <button onClick={clearDestination} aria-label="Limpar">
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                ) : (
                  <Search className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              {suggestions.length > 0 && (
                <ul className="absolute bottom-full left-0 right-0 mb-2 max-h-72 overflow-y-auto rounded-xl bg-popover ring-1 ring-border shadow-2xl">
                  {suggestions.map((s) => (
                    <li key={s.placeId}>
                      <button
                        type="button"
                        onClick={() => pickSuggestion(s)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-accent/40 transition"
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="flex flex-col">
                          <span className="font-medium text-foreground">{s.primary}</span>
                          {s.secondary && <span className="text-xs text-muted-foreground">{s.secondary}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-destructive/15 px-3 py-2 text-xs text-destructive-foreground ring-1 ring-destructive/40">
              {error}
            </p>
          )}

          {route && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-background/60 px-4 py-3 ring-1 ring-border">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <Clock className="h-3 w-3" /> Duração
                </div>
                <div className="mt-1 text-lg font-semibold text-primary">{formatDuration(route.durationSeconds)}</div>
              </div>
              <div className="rounded-xl bg-background/60 px-4 py-3 ring-1 ring-border">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <RouteIcon className="h-3 w-3" /> Distância
                </div>
                <div className="mt-1 text-lg font-semibold text-foreground">{formatDistance(route.distanceMeters)}</div>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={!route || loading}
            onClick={() => alert("Solicitação de corrida disponível na próxima fase.")}
            className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Calculando rota..." : route ? "Solicitar MOVVI" : "Escolha um destino"}
          </button>
        </div>
      </div>
    </div>
  );
}
