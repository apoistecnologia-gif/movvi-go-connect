/**
 * APOIS — Live public ride tracking page.
 * Anyone with the link can watch the driver moving toward the destination.
 * NO login required, NO PII exposed (only first name, vehicle, masked plate).
 * Fetched via SECURITY DEFINER RPC `get_ride_by_share_token`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Marker, Polyline } from "@react-google-maps/api";
import { CheckCircle2, MapPin, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MovviMap } from "@/components/MovviMap";
import { Avatar } from "@/components/Avatar";
import { MovviLogo } from "@/components/MovviLogo";
import { safeSymbol } from "@/lib/googleMaps";

export const Route = createFileRoute("/t/$token")({
  head: ({ params }) => ({
    meta: [
      { title: "Acompanhar viagem — APOIS" },
      { name: "description", content: "Acompanhe uma viagem APOIS em tempo real." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TrackingPage,
});

type Track = {
  status: string | null;
  driver_first_name: string | null;
  driver_photo_url: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  vehicle_plate_masked: string | null;
  category: string | null;
  origin_name: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_name: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  driver_lat: number | null;
  driver_lng: number | null;
  updated_at: string | null;
  is_live: boolean;
};

function statusLabel(s: string | null | undefined): string {
  switch (s) {
    case "aceita":
    case "motorista_a_caminho": return "Motorista a caminho";
    case "motorista_chegou":    return "Motorista chegou ao embarque";
    case "em_viagem":           return "Em viagem";
    case "finalizada":          return "Viagem finalizada";
    default:
      if (s?.startsWith("cancelada")) return "Viagem cancelada";
      return "Aguardando motorista";
  }
}

function TrackingPage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<Track | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: number | null = null;

    async function tick() {
      const { data: rows, error } = await (supabase.rpc as unknown as (
        fn: string, args: Record<string, unknown>,
      ) => Promise<{ data: Track[] | null; error: { message: string } | null }>)(
        "get_ride_by_share_token",
        { _token: token },
      );
      if (!alive) return;
      setLoaded(true);
      if (error) {
        if (import.meta.env.DEV) console.warn("[APOIS TRACK]", error.message);
        return;
      }
      const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!first) {
        setNotFound(true);
        return;
      }
      setData(first);
    }

    tick();
    // Poll every 4s while ride is live; slow down once finalized/cancelled
    const interval = () => (data?.is_live === false ? 30_000 : 4_000);
    function schedule() {
      timer = window.setTimeout(async () => {
        await tick();
        if (alive) schedule();
      }, interval());
    }
    schedule();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const center = useMemo(() => {
    if (data?.driver_lat != null && data?.driver_lng != null) {
      return { lat: Number(data.driver_lat), lng: Number(data.driver_lng) };
    }
    if (data?.destination_lat != null && data?.destination_lng != null) {
      return { lat: Number(data.destination_lat), lng: Number(data.destination_lng) };
    }
    if (data?.origin_lat != null && data?.origin_lng != null) {
      return { lat: Number(data.origin_lat), lng: Number(data.origin_lng) };
    }
    return null;
  }, [data]);

  if (!loaded) return <FullScreenState message="Carregando viagem…" />;
  if (notFound) return <FullScreenState message="Link inválido ou expirado." />;
  if (!data) return <FullScreenState message="Sem dados disponíveis." />;

  const finished = !data.is_live;
  const destination = data.destination_lat != null && data.destination_lng != null
    ? { lat: Number(data.destination_lat), lng: Number(data.destination_lng) }
    : null;
  const driver = data.driver_lat != null && data.driver_lng != null
    ? { lat: Number(data.driver_lat), lng: Number(data.driver_lng) }
    : null;

  return (
    <div className="relative flex h-dvh w-full flex-col bg-background">
      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-4 text-white">
        <div className="flex items-center gap-2">
          <MovviLogo className="h-6" />
          <span className="text-[13px] font-semibold uppercase tracking-[0.18em] opacity-90">
            Ao vivo
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
          <ShieldCheck className="h-3.5 w-3.5" />
          Compartilhado com segurança
        </span>
      </header>

      {/* Map */}
      <div className="absolute inset-0">
        <MovviMap center={center} zoom={14} height="100%">
          {destination && (
            <Marker
              position={destination}
              zIndex={9990}
              icon={{
                path: safeSymbol("CIRCLE"),
                scale: 8,
                fillColor: "#DC2626",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              }}
            />
          )}
          {driver && (
            <>
              <Marker
                position={driver}
                zIndex={9995}
                icon={{
                  path: safeSymbol("CIRCLE"),
                  scale: 18,
                  fillColor: "#8DD92B",
                  fillOpacity: 0.15,
                  strokeColor: "#8DD92B",
                  strokeOpacity: 0.4,
                  strokeWeight: 1,
                }}
              />
              <Marker
                position={driver}
                zIndex={9996}
                icon={{
                  path: safeSymbol("CIRCLE"),
                  scale: 8,
                  fillColor: "#76C139",
                  fillOpacity: 1,
                  strokeColor: "#ffffff",
                  strokeWeight: 2,
                }}
              />
            </>
          )}
          {driver && destination && (
            <Polyline
              path={[driver, destination]}
              options={{
                strokeColor: "#76C139",
                strokeOpacity: 0.55,
                strokeWeight: 3,
                geodesic: true,
              }}
            />
          )}
        </MovviMap>
      </div>

      {/* Bottom info card */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
        <div className="pointer-events-auto mx-auto max-w-md rounded-[24px] bg-white shadow-[0_18px_45px_-18px_rgba(15,23,42,0.35)] ring-1 ring-black/5">
          <div className="flex items-center gap-3 border-b border-[#F1F5F1] p-4">
            <div className="relative">
              <Avatar
                src={data.driver_photo_url}
                name={data.driver_first_name ?? "Motorista"}
                size={52}
              />
              {data.is_live && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
                  <span className="relative h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {finished ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                )}
                <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#5A9A2A]">
                  {statusLabel(data.status)}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[15px] font-bold text-[#111418]">
                {data.driver_first_name ?? "Motorista APOIS"}
              </div>
              {(data.vehicle_model || data.vehicle_color || data.vehicle_plate_masked) && (
                <div className="mt-0.5 truncate text-[12.5px] text-[#707070]">
                  {[data.vehicle_color, data.vehicle_model].filter(Boolean).join(" ")}
                  {data.vehicle_plate_masked ? ` · ${data.vehicle_plate_masked}` : ""}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 divide-y divide-[#F1F5F1] p-4">
            {data.origin_name && (
              <Row icon={<span className="h-2.5 w-2.5 rounded-full bg-[#76C139]" />} label="Origem" value={data.origin_name} />
            )}
            {data.destination_name && (
              <Row icon={<MapPin className="h-3.5 w-3.5 text-[#DC2626]" />} label="Destino" value={data.destination_name} />
            )}
          </div>

          <div className="rounded-b-[24px] bg-[#F7F9F7] px-4 py-2.5 text-center text-[11px] text-[#707070]">
            {data.is_live
              ? "Atualizando a cada segundos • APOIS protege sua privacidade"
              : "A viagem foi finalizada. Este link não mostra mais localização."}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#707070]">{label}</div>
        <div className="truncate text-[13.5px] font-medium text-[#111418]">{value}</div>
      </div>
    </div>
  );
}

function FullScreenState({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <MovviLogo className="h-8" />
      <p className="text-[14px] text-muted-foreground">{message}</p>
    </div>
  );
}
