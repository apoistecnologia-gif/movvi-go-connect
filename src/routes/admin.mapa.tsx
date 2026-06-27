import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { MovviMap } from "@/components/MovviMap";
import { Marker } from "@react-google-maps/api";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/admin/mapa")({
  head: () => ({ meta: [{ title: "Mapa ao Vivo — Admin MOVVI" }] }),
  component: AdminMapaPage,
});

type Driver = {
  id: string;
  name: string | null;
  is_online: boolean;
  current_lat: number | null;
  current_lng: number | null;
};
type Ride = {
  id: string;
  status: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  driver_lat: number | null;
  driver_lng: number | null;
};

function AdminMapaPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [showOnline, setShowOnline] = useState(true);
  const [showOffline, setShowOffline] = useState(false);
  const [showSearching, setShowSearching] = useState(true);
  const [showActive, setShowActive] = useState(true);

  async function refresh() {
    const [dr, ri] = await Promise.all([
      supabase
        .from("drivers")
        .select("id,name,is_online,current_lat,current_lng")
        .not("current_lat", "is", null),
      supabase
        .from("rides")
        .select("id,status,origin_lat,origin_lng,destination_lat,destination_lng,driver_lat,driver_lng")
        .in("status", ["procurar_motorista", "motorista_a_caminho", "motorista_chegou", "em_viagem"]),
    ]);
    setDrivers((dr.data ?? []) as Driver[]);
    setRides((ri.data ?? []) as Ride[]);
  }

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("admin-live-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, refresh)
      .subscribe();
    const t = setInterval(refresh, 15000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, []);

  const ready = typeof window !== "undefined" && (window as { google?: unknown }).google;
  const onlineDot = ready
    ? {
        path: (window as unknown as { google: { maps: { SymbolPath: { CIRCLE: number } } } }).google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#8DD92B",
        fillOpacity: 1,
        strokeColor: "#05070D",
        strokeWeight: 2,
      }
    : undefined;
  const offlineDot = ready
    ? {
        path: (window as unknown as { google: { maps: { SymbolPath: { CIRCLE: number } } } }).google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: "#6b7280",
        fillOpacity: 0.8,
        strokeColor: "#05070D",
        strokeWeight: 1,
      }
    : undefined;

  return (
    <AdminLayout
      title="Mapa Operacional ao Vivo"
      description={`${drivers.filter((d) => d.is_online).length} motoristas online · ${rides.length} corridas ativas`}
    >
      <Card className="mb-3 border-border bg-card/60">
        <CardContent className="flex flex-wrap items-center gap-4 p-3 text-xs">
          <Toggle label="Online" checked={showOnline} onChange={setShowOnline} color="#8DD92B" />
          <Toggle label="Offline" checked={showOffline} onChange={setShowOffline} color="#6b7280" />
          <Toggle label="Buscando motorista" checked={showSearching} onChange={setShowSearching} color="#fbbf24" />
          <Toggle label="Em andamento" checked={showActive} onChange={setShowActive} color="#3b82f6" />
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border border-border" style={{ height: "calc(100vh - 220px)" }}>
        <MovviMap>
          {drivers
            .filter((d) => (d.is_online ? showOnline : showOffline))
            .map((d) =>
              d.current_lat && d.current_lng ? (
                <Marker
                  key={d.id}
                  position={{ lat: Number(d.current_lat), lng: Number(d.current_lng) }}
                  icon={d.is_online ? onlineDot : offlineDot}
                  title={`${d.name ?? "Motorista"} (${d.is_online ? "online" : "offline"})`}
                />
              ) : null,
            )}
          {rides.map((r) => {
            const searching = r.status === "procurar_motorista";
            const visible = searching ? showSearching : showActive;
            if (!visible) return null;
            return (
              <Marker
                key={r.id}
                position={{ lat: Number(r.origin_lat), lng: Number(r.origin_lng) }}
                label={{
                  text: searching ? "?" : "•",
                  color: "#05070D",
                  fontWeight: "bold",
                }}
                icon={
                  ready
                    ? {
                        path: (window as unknown as { google: { maps: { SymbolPath: { CIRCLE: number } } } }).google.maps.SymbolPath.CIRCLE,
                        scale: 12,
                        fillColor: searching ? "#fbbf24" : "#3b82f6",
                        fillOpacity: 0.9,
                        strokeColor: "#05070D",
                        strokeWeight: 2,
                      }
                    : undefined
                }
                title={`Corrida ${r.id.slice(0, 6)} · ${r.status}`}
              />
            );
          })}
        </MovviMap>
      </div>
    </AdminLayout>
  );
}

function Toggle({ label, checked, onChange, color }: { label: string; checked: boolean; onChange: (b: boolean) => void; color: string }) {
  return (
    <label className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
