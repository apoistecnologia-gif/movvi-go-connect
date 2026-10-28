import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Marker } from "@react-google-maps/api";
import { MapPin, Radio, RefreshCw } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { MovviMap } from "@/components/MovviMap";
import { supabase } from "@/integrations/supabase/client";
import { APOIS_ADMIN_MAP } from "@/lib/adminVisual";
import { DSBadge, DSButton, DSCard, DSCardContent, EmptyState, Loading } from "@/design-system";

type DriverPresence = {
  id: string;
  name: string | null;
  category: string | null;
  current_lat: number | null;
  current_lng: number | null;
  current_heading: number | null;
  last_location_at: string | null;
  is_online: boolean;
  approval_status: string;
};

type ActiveRide = {
  id: string;
  driver_id: string | null;
  status: string;
  origin_name: string;
  destination_name: string;
  driver_latitude: number | null;
  driver_longitude: number | null;
};

export const Route = createFileRoute("/admin/mapa")({
  head: () => ({ meta: [{ title: "Mapa ao vivo — Admin APOIS" }] }),
  component: AdminLiveMapPage,
});

const ACTIVE_STATUSES = [
  "procurar_motorista",
  "motorista_a_caminho",
  "motorista_chegou",
  "em_viagem",
];

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 180);
  return text || fallback;
}

function validCoordinate(lat: unknown, lng: unknown) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function validDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function rideStatusLabel(value: unknown) {
  const status = cleanText(value).toLowerCase();
  if (status === "procurar_motorista") return "Buscando motorista";
  if (status === "motorista_a_caminho") return "Motorista a caminho";
  if (status === "motorista_chegou") return "Motorista chegou";
  if (status === "em_viagem") return "Em viagem";
  return cleanText(value, "Status não informado").replace(/_/g, " ");
}

function AdminLiveMapPage() {
  const [drivers, setDrivers] = useState<DriverPresence[]>([]);
  const [rides, setRides] = useState<ActiveRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);

  async function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [driverResult, rideResult] = await Promise.all([
        supabase
          .from("drivers")
          .select(
            "id,name,category,current_lat,current_lng,current_heading,last_location_at,is_online,approval_status",
          )
          .eq("is_online", true)
          .not("current_lat", "is", null)
          .not("current_lng", "is", null)
          .limit(500),
        supabase
          .from("rides")
          .select(
            "id,driver_id,status,origin_name,destination_name,driver_latitude,driver_longitude",
          )
          .in("status", ACTIVE_STATUSES as never[])
          .limit(500),
      ]);
      if (requestId !== requestRef.current) return;
      if (driverResult.error) throw driverResult.error;
      if (rideResult.error) throw rideResult.error;

      const nextDrivers = ((driverResult.data ?? []) as DriverPresence[])
        .filter((row) => cleanText(row.id) && row.is_online === true && validCoordinate(row.current_lat, row.current_lng))
        .map((row) => ({
          ...row,
          id: cleanText(row.id),
          name: cleanText(row.name) || null,
          category: cleanText(row.category) || null,
          current_lat: Number(row.current_lat),
          current_lng: Number(row.current_lng),
          current_heading: Number.isFinite(Number(row.current_heading))
            ? ((Number(row.current_heading) % 360) + 360) % 360
            : null,
          last_location_at: validDate(row.last_location_at)?.toISOString() ?? null,
        }));

      const nextRides = ((rideResult.data ?? []) as ActiveRide[])
        .filter((row) => cleanText(row.id) && ACTIVE_STATUSES.includes(cleanText(row.status)))
        .map((row) => ({
          ...row,
          id: cleanText(row.id),
          driver_id: cleanText(row.driver_id) || null,
          status: cleanText(row.status),
          origin_name: cleanText(row.origin_name, "Origem não informada"),
          destination_name: cleanText(row.destination_name, "Destino não informado"),
          driver_latitude: validCoordinate(row.driver_latitude, row.driver_longitude) ? Number(row.driver_latitude) : null,
          driver_longitude: validCoordinate(row.driver_latitude, row.driver_longitude) ? Number(row.driver_longitude) : null,
        }));

      setDrivers(nextDrivers);
      setRides(nextRides);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setDrivers([]);
      setRides([]);
      setLoadError("Não foi possível carregar o mapa operacional agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha no mapa operacional", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const scheduleRefresh = () => {
      if (refreshTimerRef.current != null) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => void load(), 300);
    };
    const channel = supabase
      .channel("admin-live-map-canonical")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers" },
        scheduleRefresh,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, scheduleRefresh)
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      requestRef.current += 1;
      if (refreshTimerRef.current != null) window.clearTimeout(refreshTimerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, []);

  const center = useMemo(() => {
    const driver = drivers.find((row) => validCoordinate(row.current_lat, row.current_lng));
    if (driver) return { lat: Number(driver.current_lat), lng: Number(driver.current_lng) };
    const ride = rides.find((row) => validCoordinate(row.driver_latitude, row.driver_longitude));
    return ride ? { lat: Number(ride.driver_latitude), lng: Number(ride.driver_longitude) } : null;
  }, [drivers, rides]);

  const activeByDriver = useMemo(() => {
    const map = new Map<string, ActiveRide>();
    for (const ride of rides) if (ride.driver_id) map.set(ride.driver_id, ride);
    return map;
  }, [rides]);

  const visibleDrivers = drivers.slice(0, 50);

  return (
    <AdminLayout
      title="Mapa ao vivo"
      description="Presença do motorista e corridas ativas a partir das entidades canônicas"
      actions={
        <DSButton
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-busy={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          {loading ? "Atualizando…" : "Atualizar"}
        </DSButton>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Motoristas online com GPS" value={drivers.length} />
        <Metric label="Corridas ativas" value={rides.length} />
        <Metric label="Motoristas em corrida" value={activeByDriver.size} />
      </div>

      {loading ? (
        <div aria-live="polite"><Loading label="Carregando posições..." /></div>
      ) : loadError ? (
        <DSCard className="border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <DSButton variant="outline" className="min-h-11 gap-2" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
            </DSButton>
          </DSCardContent>
        </DSCard>
      ) : !center ? (
        <EmptyState
          icon={MapPin}
          title="Sem posição disponível"
          description="Nenhum motorista online ou corrida ativa possui coordenadas válidas agora."
        />
      ) : (
        <DSCard className="min-w-0 overflow-hidden">
          <DSCardContent className="p-0">
            <div className="h-[62dvh] min-h-[clamp(280px,45dvh,440px)] w-full min-w-0">
              <MovviMap center={center} missingApiKeyMessage="Google Maps não configurado neste painel. Adicione VITE_APOIS_GOOGLE_MAPS_BROWSER_KEY nas variáveis de ambiente da Vercel e gere uma nova implantação.">
                {drivers.map((driver) => {
                  if (!validCoordinate(driver.current_lat, driver.current_lng)) return null;
                  const googleApi =
                    typeof window !== "undefined"
                      ? (window as unknown as { google?: typeof google }).google
                      : undefined;
                  if (!googleApi?.maps) return null;
                  const ride = activeByDriver.get(driver.id);
                  return (
                    <Marker
                      key={driver.id}
                      position={{ lat: Number(driver.current_lat), lng: Number(driver.current_lng) }}
                      title={`${driver.name || "Motorista"}${ride ? ` — ${rideStatusLabel(ride.status)}` : " — disponível"}`}
                      icon={{
                        path: googleApi.maps.SymbolPath.CIRCLE,
                        scale: ride ? 9 : 7,
                        fillColor: ride ? APOIS_ADMIN_MAP.goldStrong : APOIS_ADMIN_MAP.gold,
                        fillOpacity: 1,
                        strokeColor: APOIS_ADMIN_MAP.black,
                        strokeWeight: 2,
                      }}
                    />
                  );
                })}
              </MovviMap>
            </div>
          </DSCardContent>
        </DSCard>
      )}

      {!loading && !loadError && drivers.length > 0 ? (
        <div className="mt-4 space-y-2">
          {drivers.length > visibleDrivers.length ? (
            <p className="text-sm text-muted-foreground" role="status">
              Exibindo os primeiros {visibleDrivers.length} de {drivers.length} motoristas online.
            </p>
          ) : null}
          {visibleDrivers.map((driver) => {
            const ride = activeByDriver.get(driver.id);
            const lastLocation = validDate(driver.last_location_at);
            return (
              <DSCard key={driver.id}>
                <DSCardContent className="flex min-w-0 flex-wrap items-center gap-2 p-3 text-sm">
                  <Radio className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <strong className="min-w-0 break-words">{driver.name || driver.id.slice(0, 8)}</strong>
                  <DSBadge variant="primary">Online</DSBadge>
                  <DSBadge variant={ride ? "warning" : "success"}>
                    {ride ? rideStatusLabel(ride.status) : "Disponível"}
                  </DSBadge>
                  <span className="break-words text-muted-foreground">
                    {driver.category || "Categoria não informada"}
                  </span>
                  {lastLocation ? (
                    <span className="text-xs text-muted-foreground" title={lastLocation.toLocaleString("pt-BR")}>
                      GPS {lastLocation.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  ) : null}
                  {ride ? (
                    <span className="min-w-0 basis-full break-words text-muted-foreground sm:ml-auto sm:basis-auto">
                      {ride.origin_name} → {ride.destination_name}
                    </span>
                  ) : null}
                </DSCardContent>
              </DSCard>
            );
          })}
        </div>
      ) : null}
    </AdminLayout>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const safeValue = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  return (
    <DSCard>
      <DSCardContent className="min-w-0 p-4">
        <p className="break-words text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-xl font-bold tabular-nums">{safeValue}</p>
      </DSCardContent>
    </DSCard>
  );
}
