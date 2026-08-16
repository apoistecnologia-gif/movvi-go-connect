import { createFileRoute, Link } from "@tanstack/react-router";
import { Marker } from "@react-google-maps/api";
import { MovviMap } from "@/components/MovviMap";
import { BRAZIL_CENTER, GOOGLE_MAPS_API_KEY } from "@/lib/googleMaps";
import { DevOrAdminGuard } from "@/components/DevOrAdminGuard";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/map-test")({
  head: () => ({
    meta: [
      { title: "Diagnóstico do mapa — APOIS" },
      { name: "description", content: "Página de teste do Google Maps na plataforma APOIS." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <DevOrAdminGuard>
      <MapTest />
    </DevOrAdminGuard>
  ),
});

function MapTest() {
  const hasKey = Boolean(String(GOOGLE_MAPS_API_KEY ?? "").trim());

  return (
    <main className="min-h-dvh min-w-0 overflow-x-hidden bg-background px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="mx-auto min-w-0 max-w-5xl">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar
        </Link>

        <header className="mt-4 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="break-words font-display text-2xl font-bold sm:text-3xl">
              Diagnóstico do mapa
            </h1>
            <p className="mt-1 max-w-3xl break-words text-sm leading-6 text-muted-foreground">
              Mapa centralizado em Brasília. Sem GPS, sem Supabase e sem usuários — apenas validação do Google Maps.
            </p>
          </div>
          <span
            className={`flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full px-3 py-2 text-sm font-medium sm:self-auto ${
              hasKey ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
            }`}
            role="status"
            aria-live="polite"
          >
            {hasKey ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <XCircle className="h-4 w-4" aria-hidden="true" />
            )}
            {hasKey ? "API key configurada" : "API key ausente"}
          </span>
        </header>

        <section
          className="mt-6 min-w-0 overflow-hidden rounded-2xl border border-border"
          aria-label="Mapa de diagnóstico centralizado em Brasília"
        >
          <MovviMap center={BRAZIL_CENTER} zoom={12} height={600}>
            <Marker position={BRAZIL_CENTER} title="Brasília — DF" />
          </MovviMap>
        </section>

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 md:grid-cols-4">
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
    <div className="min-w-0 rounded-xl bg-card p-3 ring-1 ring-border">
      <dt className="break-words text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-all font-mono text-sm">{value}</dd>
    </div>
  );
}
