import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { MovviMap } from "@/components/MovviMap";
import { Marker, Polyline } from "@react-google-maps/api";
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

const ACCEPTED_STATUSES = new Set(["motorista_a_caminho", "motorista_chegou"]);

function AdminMapaPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [showOnline, setShowOnline] = useState(true);
  const [showOffline, setShowOffline] = useState(false);
  const [showSearching, setShowSearching] = useState(true);
  const [showAccepted, setShowAccepted] = useState(true);
  const [showInTrip, setShowInTrip] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const mapRef = useRef<google.maps.Map | null>(null);
  const heatmapRef = useRef<google.maps.visualization.HeatmapLayer | null>(null);

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

  // Heatmap rendering — depends on map + driver positions + toggle
  useEffect(() => {
    const map = mapRef.current;
    const g = (typeof window !== "undefined" ? (window as { google?: typeof google }).google : undefined);
    if (!map || !g?.maps?.visualization) return;

    // Tear down previous layer
    if (heatmapRef.current) {
      heatmapRef.current.setMap(null);
      heatmapRef.current = null;
    }
    if (!showHeatmap) return;

    const points = drivers
      .filter((d) => d.is_online && d.current_lat != null && d.current_lng != null)
      .map((d) => new g.maps.LatLng(Number(d.current_lat), Number(d.current_lng)));

    if (points.length === 0) return;

    heatmapRef.current = new g.maps.visualization.HeatmapLayer({
      data: points,
      map,
      radius: 40,
      opacity: 0.7,
      gradient: [
        "rgba(141,217,43,0)",
        "rgba(141,217,43,0.5)",
        "rgba(141,217,43,0.85)",
        "rgba(95,175,26,1)",
        "rgba(251,191,36,1)",
        "rgba(239,68,68,1)",
      ],
    });
  }, [drivers, showHeatmap]);

  useEffect(() => {
    return () => {
      if (heatmapRef.current) heatmapRef.current.setMap(null);
    };
  }, []);

  const ready = typeof window !== "undefined" && !!(window as { google?: unknown }).google;
  const symbol = (color: string, scale = 8, stroke = 2) =>
    ready
      ? {
          path: (window as unknown as { google: { maps: { SymbolPath: { CIRCLE: number } } } }).google.maps.SymbolPath
            .CIRCLE,
          scale,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#05070D",
          strokeWeight: stroke,
        }
      : undefined;

  const visibleDrivers = useMemo(
    () => drivers.filter((d) => (d.is_online ? showOnline : showOffline)),
    [drivers, showOnline, showOffline],
  );

  const stats = useMemo(() => {
    const online = drivers.filter((d) => d.is_online).length;
    const offline = drivers.length - online;
    const searching = rides.filter((r) => r.status === "procurar_motorista").length;
    const accepted = rides.filter((r) => ACCEPTED_STATUSES.has(r.status)).length;
    const inTrip = rides.filter((r) => r.status === "em_viagem").length;
    return { online, offline, searching, accepted, inTrip };
  }, [drivers, rides]);

  return (
    <AdminLayout
      title="Mapa Operacional ao Vivo"
      description={`${stats.online} online · ${stats.offline} offline · ${stats.searching} solicitações · ${stats.accepted} aceitas · ${stats.inTrip} em viagem`}
    >
      <Card className="mb-3 border-border bg-card/60">
        <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 p-3 text-xs">
          <Toggle label={`Online (${stats.online})`} checked={showOnline} onChange={setShowOnline} color="#8DD92B" />
          <Toggle label={`Offline (${stats.offline})`} checked={showOffline} onChange={setShowOffline} color="#6b7280" />
          <span className="mx-1 h-4 w-px bg-border" />
          <Toggle label={`Solicitações (${stats.searching})`} checked={showSearching} onChange={setShowSearching} color="#fbbf24" />
          <Toggle label={`Aceitas (${stats.accepted})`} checked={showAccepted} onChange={setShowAccepted} color="#3b82f6" />
          <Toggle label={`Em viagem (${stats.inTrip})`} checked={showInTrip} onChange={setShowInTrip} color="#a855f7" />
          <span className="mx-1 h-4 w-px bg-border" />
          <Toggle label="Heatmap de densidade" checked={showHeatmap} onChange={setShowHeatmap} color="#ef4444" />
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border border-border" style={{ height: "calc(100vh - 220px)" }}>
        <MovviMap onLoad={(m) => { mapRef.current = m; }}>
          {visibleDrivers.map((d) =>
            d.current_lat && d.current_lng ? (
              <Marker
                key={d.id}
                position={{ lat: Number(d.current_lat), lng: Number(d.current_lng) }}
                icon={d.is_online ? symbol("#8DD92B", 8, 2) : symbol("#6b7280", 6, 1)}
                title={`${d.name ?? "Motorista"} (${d.is_online ? "online" : "offline"})`}
              />
            ) : null,
          )}

          {rides.map((r) => {
            const searching = r.status === "procurar_motorista";
            const accepted = ACCEPTED_STATUSES.has(r.status);
            const inTrip = r.status === "em_viagem";
            const visible =
              (searching && showSearching) || (accepted && showAccepted) || (inTrip && showInTrip);
            if (!visible || r.origin_lat == null || r.origin_lng == null) return null;

            const color = searching ? "#fbbf24" : accepted ? "#3b82f6" : "#a855f7";
            const origin = { lat: Number(r.origin_lat), lng: Number(r.origin_lng) };
            const dest =
              r.destination_lat != null && r.destination_lng != null
                ? { lat: Number(r.destination_lat), lng: Number(r.destination_lng) }
                : null;
            const driverPos =
              r.driver_lat != null && r.driver_lng != null
                ? { lat: Number(r.driver_lat), lng: Number(r.driver_lng) }
                : null;

            return (
              <Fragment key={r.id}>
                <Marker
                  position={origin}
                  icon={symbol(color, 11, 2)}
                  title={`Corrida ${r.id.slice(0, 6)} · ${r.status}`}
                />
                {dest && (accepted || inTrip) && (
                  <Marker
                    position={dest}
                    icon={symbol("#05070D", 7, 2)}
                    title={`Destino · ${r.id.slice(0, 6)}`}
                  />
                )}
                {driverPos && (accepted || inTrip) && (
                  <Polyline
                    path={[driverPos, origin, ...(dest ? [dest] : [])]}
                    options={{
                      strokeColor: color,
                      strokeOpacity: 0.7,
                      strokeWeight: 3,
                      geodesic: true,
                    }}
                  />
                )}
              </Fragment>
            );
          })}
        </MovviMap>
      </div>
    </AdminLayout>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  color,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
  color: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
