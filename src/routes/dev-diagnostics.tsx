import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import {
  getEnvironmentDiagnostics,
  isDevelopmentEnvironment,
  type EnvironmentDiagnostics,
} from "@/lib/environment";
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  isBrazilCoordinate,
} from "@/lib/googleMaps";
import { reverseGeocode } from "@/lib/geocode.functions";
import { computeRoute } from "@/lib/routes.functions";

export const Route = createFileRoute("/dev-diagnostics")({
  head: () => ({
    meta: [{ title: "MOVVI — Diagnóstico (DEV)" }],
  }),
  component: DevDiagnosticsPage,
});

type PermState = "checking" | "granted" | "denied" | "prompt" | "unsupported";
type ProbeState = "idle" | "checking" | "ok" | "fail";

type GpsSnapshot = {
  lat: number;
  lng: number;
  accuracy: number | null;
  source: "real-gps" | "manual-places";
  inBrazil: boolean;
  label?: string;
  timestamp: string;
};

function DevDiagnosticsPage() {
  const navigate = useNavigate();
  const [env, setEnv] = useState<EnvironmentDiagnostics | null>(null);
  const [perm, setPerm] = useState<PermState>("checking");
  const [gps, setGps] = useState<GpsSnapshot | null>(null);
  const [error, setError] = useState<string>("");

  // Probes
  const [mapsProbe, setMapsProbe] = useState<ProbeState>("idle");
  const [placesProbe, setPlacesProbe] = useState<ProbeState>("idle");
  const [geocodingProbe, setGeocodingProbe] = useState<ProbeState>("idle");
  const [routesProbe, setRoutesProbe] = useState<ProbeState>("idle");
  const [probeMsg, setProbeMsg] = useState<string>("");

  // Manual Places search
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<{ placeId: string; primary: string; secondary: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const { isLoaded: mapsReady, loadError: mapsLoadError } = useJsApiLoader({
    id: "movvi-google-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: "pt-BR",
    region: "BR",
  });

  useEffect(() => {
    if (!isDevelopmentEnvironment()) {
      void navigate({ to: "/" });
      return;
    }
    setEnv(getEnvironmentDiagnostics());
  }, [navigate]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const perms = (navigator as Navigator).permissions;
    if (!perms || typeof perms.query !== "function") {
      setPerm("unsupported");
      return;
    }
    let st: PermissionStatus | null = null;
    perms
      .query({ name: "geolocation" as PermissionName })
      .then((s) => {
        st = s;
        setPerm(s.state as PermState);
        s.onchange = () => setPerm(s.state as PermState);
      })
      .catch(() => setPerm("unsupported"));
    return () => {
      if (st) st.onchange = null;
    };
  }, []);

  // Atualiza probe do Maps com base no loader
  useEffect(() => {
    if (mapsLoadError) setMapsProbe("fail");
    else if (mapsReady) setMapsProbe("ok");
    else setMapsProbe("checking");
  }, [mapsReady, mapsLoadError]);

  // Autocomplete Places
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2 || !mapsReady) {
      setItems([]);
      return;
    }
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
        console.error("Places autocomplete falhou:", e);
      } finally {
        setSearching(false);
      }
    }, 250);
  }, [query, mapsReady]);

  async function pickManual(placeId: string, label: string) {
    setError("");
    try {
      const { Place } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
      const place = new Place({ id: placeId });
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      const loc = place.location;
      if (!loc) throw new Error("Local sem coordenadas");
      const lat = loc.lat();
      const lng = loc.lng();
      setGps({
        lat,
        lng,
        accuracy: null,
        source: "manual-places",
        inBrazil: isBrazilCoordinate(lat, lng),
        label: place.formattedAddress ?? label,
        timestamp: new Date().toISOString(),
      });
      setItems([]);
      setQuery("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao obter coordenadas.");
    }
  }

  function requestRealGps() {
    setError("");
    if (!("geolocation" in navigator)) {
      setError("Geolocation API indisponível.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGps({
          lat,
          lng,
          accuracy: pos.coords.accuracy ?? null,
          source: "real-gps",
          inBrazil: isBrazilCoordinate(lat, lng),
          timestamp: new Date().toISOString(),
        });
      },
      (err) => setError(`Erro ${err.code}: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  async function runApiProbes() {
    setProbeMsg("");
    // Places
    setPlacesProbe("checking");
    try {
      const places = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
      const sessionToken = new places.AutocompleteSessionToken();
      const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: "rua",
        sessionToken,
        includedRegionCodes: ["br"],
        language: "pt-BR",
        region: "BR",
      });
      setPlacesProbe(suggestions.length >= 0 ? "ok" : "fail");
    } catch (e) {
      console.error("Probe Places:", e);
      setPlacesProbe("fail");
    }

    // Geocoding e Routes precisam de coordenada — usar a do GPS se disponível
    if (!gps) {
      setProbeMsg("Para testar Geocoding/Routes capture um GPS ou selecione um endereço acima.");
      setGeocodingProbe("idle");
      setRoutesProbe("idle");
      return;
    }
    setGeocodingProbe("checking");
    try {
      const r = await reverseGeocode({ data: { lat: gps.lat, lng: gps.lng } });
      setGeocodingProbe(r ? "ok" : "fail");
    } catch (e) {
      console.error("Probe Geocoding:", e);
      setGeocodingProbe("fail");
    }

    setRoutesProbe("checking");
    try {
      // Destino: ponto a ~500m a leste, sempre dentro do Brasil se origem estiver
      const dest = { lat: gps.lat, lng: gps.lng + 0.005 };
      if (!isBrazilCoordinate(dest.lat, dest.lng)) {
        setRoutesProbe("fail");
        return;
      }
      const r = await computeRoute({
        data: { origin: { lat: gps.lat, lng: gps.lng }, destination: dest },
      });
      setRoutesProbe(r ? "ok" : "fail");
    } catch (e) {
      console.error("Probe Routes:", e);
      setRoutesProbe("fail");
    }
  }

  if (!env) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background text-muted-foreground">
        Carregando diagnóstico...
      </div>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-400 ring-1 ring-amber-500/40">
              🧪 Modo Desenvolvedor
            </span>
            <h1 className="mt-2 font-display text-2xl font-bold">Diagnóstico MOVVI</h1>
            <p className="text-sm text-muted-foreground">
              Acessível somente em desenvolvimento/preview. Não substitui o GPS real em produção.
            </p>
          </div>
          <Link
            to="/"
            className="rounded-full bg-card px-3 py-2 text-xs font-medium ring-1 ring-border"
          >
            ← Início
          </Link>
        </header>

        <Section title="Ambiente">
          <Row k="Modo" v={env.mode} highlight={env.mode === "development" ? "warn" : "ok"} />
          <Row k="Host" v={env.hostname} mono />
          <Row k="URL" v={env.href} mono />
          <Row k="Protocolo" v={env.protocol} />
          <Row k="HTTPS / secureContext" v={env.isSecureContext ? "sim" : "não"} highlight={env.isSecureContext ? "ok" : "warn"} />
          <Row k="Dentro de iframe" v={env.inIframe ? "sim" : "não"} highlight={env.inIframe ? "warn" : "ok"} />
          <Row k="Vite DEV build" v={env.viteDev ? "sim" : "não"} />
          <Row k="User-Agent" v={env.userAgent} mono />
        </Section>

        <Section title="Permissão de geolocalização">
          <Row k="navigator.geolocation" v={typeof navigator !== "undefined" && "geolocation" in navigator ? "disponível" : "indisponível"} highlight={typeof navigator !== "undefined" && "geolocation" in navigator ? "ok" : "err"} />
          <Row k="Permissions API" v={perm} highlight={perm === "granted" ? "ok" : perm === "denied" ? "err" : "warn"} />
        </Section>

        <Section title="Origem (GPS real ou Google Places)">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={requestRealGps}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Pedir GPS real
            </button>
            <button
              onClick={() => setGps(null)}
              className="rounded-xl bg-card px-4 py-2 text-sm font-medium ring-1 ring-border"
            >
              Limpar
            </button>
          </div>

          <div className="mt-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar endereço no Brasil (Google Places)…"
              className="w-full rounded-xl bg-background/60 px-3 py-2 text-sm ring-1 ring-border outline-none focus:ring-primary"
            />
            {searching && <p className="mt-1 text-[11px] text-muted-foreground">Buscando…</p>}
            {items.length > 0 && (
              <ul className="mt-2 space-y-1">
                {items.map((it) => (
                  <li key={it.placeId}>
                    <button
                      onClick={() => pickManual(it.placeId, `${it.primary} ${it.secondary}`)}
                      className="w-full rounded-lg bg-background/60 px-3 py-2 text-left text-xs ring-1 ring-border hover:ring-primary"
                    >
                      <div className="font-medium">{it.primary}</div>
                      <div className="text-muted-foreground">{it.secondary}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
          {gps && (
            <div className="mt-4 space-y-1">
              <Row k="Origem" v={gps.source === "real-gps" ? "GPS real" : "Manual (Places)"} highlight={gps.source === "real-gps" ? "ok" : "warn"} />
              {gps.label && <Row k="Endereço" v={gps.label} />}
              <Row k="Latitude" v={gps.lat.toFixed(6)} mono />
              <Row k="Longitude" v={gps.lng.toFixed(6)} mono />
              <Row k="Accuracy" v={gps.accuracy != null ? `± ${Math.round(gps.accuracy)} m` : "—"} />
              <Row k="Dentro do Brasil" v={gps.inBrazil ? "sim" : "NÃO — rejeitado"} highlight={gps.inBrazil ? "ok" : "err"} />
              <Row k="Timestamp" v={gps.timestamp} mono />
            </div>
          )}
        </Section>

        <Section title="Status das APIs do Google">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              onClick={runApiProbes}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Testar APIs
            </button>
          </div>
          <Row k="Maps JavaScript API" v={probeLabel(mapsProbe)} highlight={probeHighlight(mapsProbe)} />
          <Row k="Places API (New)" v={probeLabel(placesProbe)} highlight={probeHighlight(placesProbe)} />
          <Row k="Geocoding API (gateway)" v={probeLabel(geocodingProbe)} highlight={probeHighlight(geocodingProbe)} />
          <Row k="Routes API (gateway)" v={probeLabel(routesProbe)} highlight={probeHighlight(routesProbe)} />
          {probeMsg && <p className="mt-2 text-[11px] text-amber-300">{probeMsg}</p>}
        </Section>

        <p className="text-center text-[11px] text-muted-foreground">
          Em produção esta rota redireciona automaticamente para a home.
        </p>
      </div>
    </main>
  );
}

function probeLabel(s: ProbeState): string {
  return s === "ok" ? "OK" : s === "fail" ? "FALHA" : s === "checking" ? "verificando…" : "—";
}
function probeHighlight(s: ProbeState): "ok" | "warn" | "err" | undefined {
  return s === "ok" ? "ok" : s === "fail" ? "err" : s === "checking" ? "warn" : undefined;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
      <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({
  k,
  v,
  mono,
  highlight,
}: {
  k: string;
  v: string;
  mono?: boolean;
  highlight?: "ok" | "warn" | "err";
}) {
  const color =
    highlight === "ok"
      ? "text-primary"
      : highlight === "warn"
        ? "text-amber-400"
        : highlight === "err"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-background/60 px-3 py-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className={`max-w-[60%] break-words text-right text-[12px] ${mono ? "font-mono" : ""} ${color}`}>
        {v}
      </span>
    </div>
  );
}
