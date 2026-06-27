import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { MovviMap } from "@/components/MovviMap";
import { Marker, Polyline } from "@react-google-maps/api";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  category: string | null;
  city: string | null;
  state: string | null;
};
type Ride = {
  id: string;
  status: string;
  category: string | null;
  origin_name: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  driver_lat: number | null;
  driver_lng: number | null;
  driver_id: string | null;
};
type RideCategory = { slug: string; name: string };

const ACCEPTED_STATUSES = new Set(["motorista_a_caminho", "motorista_chegou"]);
const ALL = "__all__";

function AdminMapaPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [categories, setCategories] = useState<RideCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [cityFilter, setCityFilter] = useState<string>(ALL);

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
        .select("id,name,is_online,current_lat,current_lng,category,city,state")
        .not("current_lat", "is", null),
      supabase
        .from("rides")
        .select(
          "id,status,category,origin_name,origin_lat,origin_lng,destination_lat,destination_lng,driver_lat,driver_lng,driver_id",
        )
        .in("status", ["procurar_motorista", "motorista_a_caminho", "motorista_chegou", "em_viagem"]),
    ]);
    setDrivers((dr.data ?? []) as Driver[]);
    setRides((ri.data ?? []) as Ride[]);
  }

  async function loadCategories() {
    const { data } = await supabase
      .from("ride_categories")
      .select("slug,name")
      .order("name");
    setCategories((data ?? []) as RideCategory[]);
  }

  useEffect(() => {
    refresh();
    loadCategories();
    const ch = supabase
      .channel("admin-live-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_categories" }, loadCategories)
      .subscribe();
    const t = setInterval(refresh, 15000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, []);

  // Lookup: driver_id → city (used to filter rides by city)
  const driverCityById = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const d of drivers) m.set(d.id, d.city);
    return m;
  }, [drivers]);

  // Cities available (from connected drivers)
  const availableCities = useMemo(() => {
    const set = new Set<string>();
    for (const d of drivers) if (d.city) set.add(d.city);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [drivers]);

  // Apply category + city filters
  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      if (categoryFilter !== ALL && d.category !== categoryFilter) return false;
      if (cityFilter !== ALL && d.city !== cityFilter) return false;
      return true;
    });
  }, [drivers, categoryFilter, cityFilter]);

  const filteredRides = useMemo(() => {
    return rides.filter((r) => {
      if (categoryFilter !== ALL && r.category !== categoryFilter) return false;
      if (cityFilter !== ALL) {
        // Match city via driver association OR origin_name substring (fallback for unassigned rides)
        const driverCity = r.driver_id ? driverCityById.get(r.driver_id) ?? null : null;
        const matchesDriver = driverCity === cityFilter;
        const matchesOrigin =
          !!r.origin_name && r.origin_name.toLowerCase().includes(cityFilter.toLowerCase());
        if (!matchesDriver && !matchesOrigin) return false;
      }
      return true;
    });
  }, [rides, categoryFilter, cityFilter, driverCityById]);

  // Heatmap rendering — depends on map + filtered drivers + toggle
  useEffect(() => {
    const map = mapRef.current;
    const g = typeof window !== "undefined" ? (window as { google?: typeof google }).google : undefined;
    if (!map || !g?.maps?.visualization) return;

    if (heatmapRef.current) {
      heatmapRef.current.setMap(null);
      heatmapRef.current = null;
    }
    if (!showHeatmap) return;

    const points = filteredDrivers
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
  }, [filteredDrivers, showHeatmap]);

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
    () => filteredDrivers.filter((d) => (d.is_online ? showOnline : showOffline)),
    [filteredDrivers, showOnline, showOffline],
  );

  const stats = useMemo(() => {
    const online = filteredDrivers.filter((d) => d.is_online).length;
    const offline = filteredDrivers.length - online;
    const searching = filteredRides.filter((r) => r.status === "procurar_motorista").length;
    const accepted = filteredRides.filter((r) => ACCEPTED_STATUSES.has(r.status)).length;
    const inTrip = filteredRides.filter((r) => r.status === "em_viagem").length;
    return { online, offline, searching, accepted, inTrip };
  }, [filteredDrivers, filteredRides]);

  return (
    <AdminLayout
      title="Mapa Operacional ao Vivo"
      description={`${stats.online} online · ${stats.offline} offline · ${stats.searching} solicitações · ${stats.accepted} aceitas · ${stats.inTrip} em viagem`}
    >
      <Card className="mb-3 border-border bg-card/60">
        <CardContent className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Categoria</span>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as categorias</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Cidade</span>
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="h-8 w-56 text-xs">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as cidades</SelectItem>
                  {availableCities.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(categoryFilter !== ALL || cityFilter !== ALL) && (
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter(ALL);
                  setCityFilter(ALL);
                }}
                className="text-primary hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <Toggle label={`Online (${stats.online})`} checked={showOnline} onChange={setShowOnline} color="#8DD92B" />
            <Toggle label={`Offline (${stats.offline})`} checked={showOffline} onChange={setShowOffline} color="#6b7280" />
            <span className="mx-1 h-4 w-px bg-border" />
            <Toggle label={`Solicitações (${stats.searching})`} checked={showSearching} onChange={setShowSearching} color="#fbbf24" />
            <Toggle label={`Aceitas (${stats.accepted})`} checked={showAccepted} onChange={setShowAccepted} color="#3b82f6" />
            <Toggle label={`Em viagem (${stats.inTrip})`} checked={showInTrip} onChange={setShowInTrip} color="#a855f7" />
            <span className="mx-1 h-4 w-px bg-border" />
            <Toggle label="Heatmap de densidade" checked={showHeatmap} onChange={setShowHeatmap} color="#ef4444" />
          </div>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border border-border" style={{ height: "calc(100vh - 280px)" }}>
        <MovviMap onLoad={(m) => { mapRef.current = m; }}>
          {visibleDrivers.map((d) =>
            d.current_lat && d.current_lng ? (
              <Marker
                key={d.id}
                position={{ lat: Number(d.current_lat), lng: Number(d.current_lng) }}
                icon={d.is_online ? symbol("#8DD92B", 8, 2) : symbol("#6b7280", 6, 1)}
                title={`${d.name ?? "Motorista"} (${d.is_online ? "online" : "offline"})${d.city ? ` · ${d.city}` : ""}${d.category ? ` · ${d.category}` : ""}`}
              />
            ) : null,
          )}

          {filteredRides.map((r) => {
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
                  title={`Corrida ${r.id.slice(0, 6)} · ${r.status}${r.category ? ` · ${r.category}` : ""}`}
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
