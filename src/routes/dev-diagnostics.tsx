import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getEnvironmentDiagnostics,
  isDevelopmentEnvironment,
  type EnvironmentDiagnostics,
} from "@/lib/environment";

export const Route = createFileRoute("/dev-diagnostics")({
  head: () => ({
    meta: [{ title: "MOVVI — Diagnóstico (DEV)" }],
  }),
  component: DevDiagnosticsPage,
});

type PermState = "checking" | "granted" | "denied" | "prompt" | "unsupported";

type GpsSnapshot = {
  lat: number;
  lng: number;
  accuracy: number | null;
  source: "real-gps" | "modo-teste-manual";
  timestamp: string;
};

function DevDiagnosticsPage() {
  const navigate = useNavigate();
  const [env, setEnv] = useState<EnvironmentDiagnostics | null>(null);
  const [perm, setPerm] = useState<PermState>("checking");
  const [gps, setGps] = useState<GpsSnapshot | null>(null);
  const [error, setError] = useState<string>("");

  // Guard: tela acessível APENAS em desenvolvimento. Nunca em produção.
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

  function requestRealGps() {
    setError("");
    if (!("geolocation" in navigator)) {
      setError("Geolocation API indisponível.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          source: "real-gps",
          timestamp: new Date().toISOString(),
        });
      },
      (err) => setError(`Erro ${err.code}: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  function setTestOrigin() {
    // Origem de teste arbitrária (centro do Brasil) — apenas para validar fluxo.
    setGps({
      lat: -14.235,
      lng: -51.9253,
      accuracy: null,
      source: "modo-teste-manual",
      timestamp: new Date().toISOString(),
    });
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
          <Row k="Dentro de iframe" v={env.inIframe ? "sim" : "não"} />
          <Row k="Vite DEV build" v={env.viteDev ? "sim" : "não"} />
          <Row k="User-Agent" v={env.userAgent} mono />
        </Section>

        <Section title="Permissão de geolocalização">
          <Row k="Status" v={perm} highlight={perm === "granted" ? "ok" : perm === "denied" ? "err" : "warn"} />
        </Section>

        <Section title="GPS / origem da rota">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={requestRealGps}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Pedir GPS real
            </button>
            <button
              onClick={setTestOrigin}
              className="rounded-xl bg-amber-500/20 px-4 py-2 text-sm font-bold text-amber-300 ring-1 ring-amber-500/40"
            >
              Usar origem de teste
            </button>
            <button
              onClick={() => setGps(null)}
              className="rounded-xl bg-card px-4 py-2 text-sm font-medium ring-1 ring-border"
            >
              Limpar
            </button>
          </div>
          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
          {gps && (
            <div className="mt-4 space-y-1">
              <Row k="Origem" v={gps.source} highlight={gps.source === "real-gps" ? "ok" : "warn"} />
              <Row k="Latitude" v={gps.lat.toFixed(6)} mono />
              <Row k="Longitude" v={gps.lng.toFixed(6)} mono />
              <Row k="Accuracy" v={gps.accuracy != null ? `± ${Math.round(gps.accuracy)} m` : "—"} />
              <Row k="Timestamp" v={gps.timestamp} mono />
            </div>
          )}
        </Section>

        <p className="text-center text-[11px] text-muted-foreground">
          Em produção esta rota redireciona automaticamente para a home.
        </p>
      </div>
    </main>
  );
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
