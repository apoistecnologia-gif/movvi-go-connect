import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Marker } from "@react-google-maps/api";
import { MapPin, Radio, RefreshCw } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { MovviMap } from "@/components/MovviMap";
import { supabase } from "@/integrations/supabase/client";
import { APOIS_ADMIN_MAP } from "@/lib/adminVisual";
import { DSBadge, DSButton, DSCard, DSCardContent, EmptyState, Loading } from "@/design-system";
import { toast } from "sonner";

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

function AdminLiveMapPage() {
  const [drivers, setDrivers] = useState<DriverPresence[]>([]);
  const [rides, setRides] = useState<ActiveRide[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
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
      if (driverResult.error) throw driverResult.error;
      if (rideResult.error) throw rideResult.error;
      setDrivers((driverResult.data ?? []) as DriverPresence[]);
      setRides((rideResult.data ?? []) as ActiveRide[]);
    } catch (error) {
      setDrivers([]);
      setRides([]);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível carregar o mapa operacional.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-live-map-canonical")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers" },
        () => void load(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const center = useMemo(() => {
    const driver = drivers.find((row) => row.current_lat != null && row.current_lng != null);
    if (driver?.current_lat != null && driver.current_lng != null)
      return { lat: driver.current_lat, lng: driver.current_lng };
    const ride = rides.find((row) => row.driver_latitude != null && row.driver_longitude != null);
    return ride?.driver_latitude != null && ride.driver_longitude != null
      ? { lat: ride.driver_latitude, lng: ride.driver_longitude }
      : null;
  }, [drivers, rides]);

  const activeByDriver = useMemo(() => {
    const map = new Map<string, ActiveRide>();
    for (const ride of rides) if (ride.driver_id) map.set(ride.driver_id, ride);
    return map;
  }, [rides]);

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
          className="gap-1"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </DSButton>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Motoristas online com GPS" value={drivers.length} />
        <Metric label="Corridas ativas" value={rides.length} />
        <Metric label="Motoristas em corrida" value={activeByDriver.size} />
      </div>

      {loading ? (
        <Loading label="Carregando posições..." />
      ) : !center ? (
        <EmptyState
          icon={MapPin}
          title="Sem posição disponível"
          description="Nenhum motorista online ou corrida ativa possui coordenadas válidas agora."
        />
      ) : (
        <DSCard className="overflow-hidden">
          <DSCardContent className="p-0">
            <div className="h-[62vh] min-h-[440px] w-full">
              <MovviMap center={center}>
                {drivers.map((driver) => {
                  if (driver.current_lat == null || driver.current_lng == null) return null;
                  const googleApi =
                    typeof window !== "undefined"
                      ? (window as unknown as { google?: typeof google }).google
                      : undefined;
                  if (!googleApi?.maps) return null;
                  const ride = activeByDriver.get(driver.id);
                  return (
                    <Marker
                      key={driver.id}
                      position={{ lat: driver.current_lat, lng: driver.current_lng }}
                      title={`${driver.name || "Motorista"}${ride ? ` — ${ride.status}` : " — disponível"}`}
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

      <div className="mt-4 space-y-2">
        {drivers.slice(0, 50).map((driver) => {
          const ride = activeByDriver.get(driver.id);
          return (
            <DSCard key={driver.id}>
              <DSCardContent className="flex flex-wrap items-center gap-2 p-3 text-xs">
                <Radio className="h-4 w-4 text-primary" />
                <strong>{driver.name || driver.id.slice(0, 8)}</strong>
                <DSBadge variant="primary">Online</DSBadge>
                <DSBadge variant={ride ? "warning" : "success"}>
                  {ride ? ride.status : "Disponível"}
                </DSBadge>
                <span className="text-muted-foreground">
                  {driver.category || "categoria não informada"}
                </span>
                {ride && (
                  <span className="ml-auto text-muted-foreground">
                    {ride.origin_name} → {ride.destination_name}
                  </span>
                )}
              </DSCardContent>
            </DSCard>
          );
        })}
      </div>
    </AdminLayout>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <DSCard>
      <DSCardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold">{value}</p>
      </DSCardContent>
    </DSCard>
  );
}
