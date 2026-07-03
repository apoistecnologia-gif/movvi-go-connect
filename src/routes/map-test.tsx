import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Marker } from "@react-google-maps/api";
import { MovviMap } from "@/components/MovviMap";
import { BRAZIL_CENTER, GOOGLE_MAPS_API_KEY } from "@/lib/googleMaps";
import { isDevelopmentEnvironment } from "@/lib/environment";
import { DevOrAdminGuard } from "@/components/DevOrAdminGuard";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/map-test")({
  head: () => ({
    meta: [
      { title: "Diagnóstico do mapa — MOVVI DRIVE" },
      { name: "description", content: "Página de teste do Google Maps na plataforma MOVVI DRIVE." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <DevOrAdminGuard>
      <MapTest />
    </DevOrAdminGuard>
  ),
});

function MapTest() {
  // In production the DevOrAdminGuard already restricts access to admins.
  // Keep useNavigate reference to avoid unused-import warnings for existing code.
  useNavigate();
  useEffect(() => {}, []);
  void isDevelopmentEnvironment;
  const hasKey = Boolean(GOOGLE_MAPS_API_KEY);

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <header className="mt-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Diagnóstico do mapa</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Mapa centralizado em Brasília. Sem GPS, sem Supabase, sem usuários — apenas validação do Google Maps.
            </p>
          </div>
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
              hasKey
                ? "bg-primary/15 text-primary"
                : "bg-destructive/20 text-destructive-foreground"
            }`}
          >
            {hasKey ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {hasKey ? "API key carregada" : "API key ausente"}
          </span>
        </header>

        <section className="mt-6 overflow-hidden rounded-2xl border border-border">
          <MovviMap center={BRAZIL_CENTER} zoom={12} height={600}>
            <Marker position={BRAZIL_CENTER} title="Brasília — DF" />
          </MovviMap>
        </section>

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Info label="Latitude" value={BRAZIL_CENTER.lat.toString()} />
          <Info label="Longitude" value={BRAZIL_CENTER.lng.toString()} />
          <Info label="Zoom" value="12" />
          <Info label="Altura" value="600 px" />
        </dl>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card rounded-xl p-3">
      <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-sm">{value}</dd>
    </div>
  );
}
