import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Car, Circle, Route as RouteIcon, Search, Users, X } from "lucide-react";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { MovviMap } from "@/components/MovviMap";
import { Marker, Polyline } from "@react-google-maps/api";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DSButton,
  DSCard,
  DSCardContent,
  StatusPill,
  EmptyState,
  Metric,
  Caption,
  dsStatus,
} from "@/design-system";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/admin/operacoes")({
  head: () => ({ meta: [{ title: "Central de Operações — Admin MOVVI" }] }),
  component: OpsCenterPage,
});

/* ─── Types ────────────────────────────────────────── */
type Driver = {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  photo_url: string | null;
  is_online: boolean;
  current_lat: number | null;
  current_lng: number | null;
  last_location_at: string | null;
  category: string | null;
  city: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  average_rating: number | null;
  rating: number | null;
  completed_rides: number | null;
  subscription_status: string | null;
  approval_status: string | null;
};
type Ride = {
  id: string;
  status: string;
  category: string | null;
  passenger_id: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_vehicle: string | null;
  origin_name: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_name: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  driver_lat: number | null;
  driver_lng: number | null;
  payment_method: string | null;
  created_at: string;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  estimated_price: number | null;
  duration_min: number | null;
  distance_km: number | null;
};
type Sos = {
  id: string;
  user_id: string;
  ride_id: string | null;
  lat: number | null;
  lng: number | null;
  message: string | null;
  resolved_at: string | null;
  created_at: string;
};
type PassengerLite = {
  auth_user_id: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  avatar_url: string | null;
  average_rating: number | null;
  completed_rides: number | null;
};

const ACTIVE_STATUSES = ["procurar_motorista", "motorista_a_caminho", "motorista_chegou", "em_viagem"] as const;
const ALL = "__all__";

const STATUS_LABEL: Record<string, string> = {
  procurar_motorista: "Buscando motorista",
  motorista_a_caminho: "A caminho",
  motorista_chegou: "No local",
  em_viagem: "Em viagem",
  finalizada: "Finalizada",
};

/* ─── Component ────────────────────────────────────── */
function OpsCenterPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [sos, setSos] = useState<Sos[]>([]);
  const [passengers, setPassengers] = useState<Map<string, PassengerLite>>(new Map());
  const [today, setToday] = useState<{ completed: number; cancelled: number }>({ completed: 0, cancelled: 0 });

  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>(ALL);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [showOffline, setShowOffline] = useState(false);

  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [selectedPassenger, setSelectedPassenger] = useState<PassengerLite | null>(null);

  async function loadAll() {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [dr, ri, so, tc, tx] = await Promise.all([
      supabase
        .from("drivers")
        .select(
          "id,user_id,name,phone,photo_url,is_online,current_lat,current_lng,last_location_at,category,city,vehicle_model,vehicle_plate,vehicle_color,average_rating,rating,completed_rides,subscription_status,approval_status",
        )
        .eq("approval_status", "aprovado"),
      supabase
        .from("rides")
        .select(
          "id,status,category,passenger_id,driver_id,driver_name,driver_vehicle,origin_name,origin_lat,origin_lng,destination_name,destination_lat,destination_lng,driver_lat,driver_lng,payment_method,created_at,accepted_at,started_at,completed_at,estimated_price,duration_min,distance_km",
        )
        .in("status", ACTIVE_STATUSES)
        .order("created_at", { ascending: false }),
      supabase
        .from("sos_alerts")
        .select("id,user_id,ride_id,lat,lng,message,resolved_at,created_at")
        .is("resolved_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("rides")
        .select("id", { count: "exact", head: true })
        .eq("status", "finalizada")
        .gte("completed_at", dayStart.toISOString()),
      supabase
        .from("rides")
        .select("id", { count: "exact", head: true })
        .like("status", "cancelada%")
        .gte("created_at", dayStart.toISOString()),
    ]);
    setDrivers((dr.data ?? []) as Driver[]);
    setRides((ri.data ?? []) as Ride[]);
    setSos((so.data ?? []) as Sos[]);
    setToday({ completed: tc.count ?? 0, cancelled: tx.count ?? 0 });

    // Load passengers referenced in rides
    const ids = Array.from(
      new Set((ri.data ?? []).map((r) => r.passenger_id).filter(Boolean) as string[]),
    );
    if (ids.length > 0) {
      const { data: pd } = await supabase
        .from("users")
        .select("auth_user_id,name,phone,city,avatar_url,average_rating,completed_rides")
        .in("auth_user_id", ids);
      const map = new Map<string, PassengerLite>();
      for (const p of (pd ?? []) as PassengerLite[]) map.set(p.auth_user_id, p);
      setPassengers(map);
    } else {
      setPassengers(new Map());
    }
  }

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel("admin-ops-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_alerts" }, loadAll)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  /* ─── Derived data ─── */
  const availableCities = useMemo(() => {
    const s = new Set<string>();
    for (const d of drivers) if (d.city) s.add(d.city);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [drivers]);

  const availableCategories = useMemo(() => {
    const s = new Set<string>();
    for (const d of drivers) if (d.category) s.add(d.category);
    for (const r of rides) if (r.category) s.add(r.category);
    return Array.from(s).sort();
  }, [drivers, rides]);

  const busyDriverIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of rides) if (r.driver_id) s.add(r.driver_id);
    return s;
  }, [rides]);

  const sosRideIds = useMemo(() => new Set(sos.map((s) => s.ride_id).filter(Boolean) as string[]), [sos]);

  const matchesSearch = (text: string | null | undefined) =>
    !search || (text ?? "").toLowerCase().includes(search.toLowerCase());

  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      if (cityFilter !== ALL && d.city !== cityFilter) return false;
      if (categoryFilter !== ALL && d.category !== categoryFilter) return false;
      if (!d.is_online && !showOffline) return false;
      if (search) {
        const hay = [d.name, d.phone, d.vehicle_plate].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [drivers, cityFilter, categoryFilter, showOffline, search]);

  const filteredRides = useMemo(() => {
    return rides.filter((r) => {
      if (categoryFilter !== ALL && r.category !== categoryFilter) return false;
      if (statusFilter !== ALL && r.status !== statusFilter) return false;
      if (cityFilter !== ALL) {
        const dr = drivers.find((d) => d.id === r.driver_id);
        const driverCity = dr?.city ?? null;
        const originHas = r.origin_name?.toLowerCase().includes(cityFilter.toLowerCase());
        if (driverCity !== cityFilter && !originHas) return false;
      }
      if (search) {
        const passenger = r.passenger_id ? passengers.get(r.passenger_id) : null;
        const hay = [
          r.id,
          r.driver_name,
          passenger?.name,
          passenger?.phone,
          r.origin_name,
          r.destination_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [rides, cityFilter, categoryFilter, statusFilter, search, drivers, passengers]);

  /* ─── KPIs ─── */
  const kpis = useMemo(() => {
    const online = drivers.filter((d) => d.is_online).length;
    const busy = drivers.filter((d) => d.is_online && busyDriverIds.has(d.id)).length;
    const available = online - busy;
    const waiting = rides.filter((r) => r.status === "procurar_motorista").length;
    const inProgress = rides.filter((r) => r.status !== "procurar_motorista").length;

    // ETA average (created_at → accepted_at in seconds)
    const etas = rides
      .filter((r) => r.accepted_at)
      .map((r) => (new Date(r.accepted_at!).getTime() - new Date(r.created_at).getTime()) / 1000);
    const avgEta = etas.length ? Math.round(etas.reduce((a, b) => a + b, 0) / etas.length) : 0;

    return {
      available,
      busy,
      online,
      waiting,
      inProgress,
      completedToday: today.completed,
      cancelledToday: today.cancelled,
      avgEta,
    };
  }, [drivers, rides, busyDriverIds, today]);

  const activeSos = sos;

  /* ─── Map helpers ─── */
  const ready = typeof window !== "undefined" && !!(window as { google?: unknown }).google;
  const symbol = (color: string, scale = 8, stroke = 2) =>
    ready
      ? {
          path: (window as unknown as { google: { maps: { SymbolPath: { CIRCLE: number } } } }).google.maps
            .SymbolPath.CIRCLE,
          scale,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#05070D",
          strokeWeight: stroke,
        }
      : undefined;

  const driverMarkerColor = (d: Driver): string => {
    if (!d.is_online) return "#6b7280";
    return busyDriverIds.has(d.id) ? "#3b82f6" : "#8DD92B";
  };

  return (
    <AdminLayout
      title="Central de Operações"
      description="Monitoramento em tempo real — leitura apenas"
      actions={
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1 text-primary">
            <Circle className="h-2 w-2 fill-current" /> Ao vivo
          </span>
        </div>
      }
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 mb-3">
        <Kpi label="Disponíveis" value={kpis.available} tone="green" />
        <Kpi label="Ocupados" value={kpis.busy} tone="blue" />
        <Kpi label="Aguardando" value={kpis.waiting} tone="amber" />
        <Kpi label="Em corrida" value={kpis.inProgress} tone="violet" />
        <Kpi label="Finalizadas hoje" value={kpis.completedToday} tone="green" />
        <Kpi label="Canceladas hoje" value={kpis.cancelledToday} tone="red" />
        <Kpi label="ETA médio" value={`${Math.round(kpis.avgEta)}s`} tone="neutral" />
        <Kpi label="SOS ativos" value={activeSos.length} tone={activeSos.length > 0 ? "red" : "neutral"} />
      </div>

      {/* SOS banner */}
      {activeSos.length > 0 && (
        <Card className="mb-3 border-destructive/60 bg-destructive/10">
          <CardContent className="flex items-center gap-3 p-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-destructive">
                {activeSos.length} alerta{activeSos.length > 1 ? "s" : ""} SOS ativo{activeSos.length > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                Verifique o painel SOS abaixo. Este módulo é somente leitura.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="mb-3 border-border bg-card/60">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar motorista, passageiro, ID, placa, telefone…"
              className="h-9 pl-8 text-xs"
            />
          </div>
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="Cidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as cidades</SelectItem>
              {availableCities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas categorias</SelectItem>
              {availableCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos status</SelectItem>
              {ACTIVE_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s] ?? s}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showOffline}
              onChange={(e) => setShowOffline(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Mostrar offline
          </label>
          {(search || cityFilter !== ALL || categoryFilter !== ALL || statusFilter !== ALL) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setCityFilter(ALL);
                setCategoryFilter(ALL);
                setStatusFilter(ALL);
              }}
              className="h-9 text-xs"
            >
              Limpar
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-3">
        {/* Live Map */}
        <div className="overflow-hidden rounded-xl border border-border h-[calc(100vh-360px)] min-h-[420px]">
          <MovviMap>
            {filteredDrivers.map((d) =>
              d.current_lat && d.current_lng ? (
                <Marker
                  key={d.id}
                  position={{ lat: Number(d.current_lat), lng: Number(d.current_lng) }}
                  icon={symbol(driverMarkerColor(d), 8, 2)}
                  onClick={() => setSelectedDriver(d)}
                  title={`${d.name ?? "Motorista"} · ${d.is_online ? (busyDriverIds.has(d.id) ? "ocupado" : "disponível") : "offline"}`}
                />
              ) : null,
            )}
            {filteredRides.map((r) => {
              if (r.origin_lat == null || r.origin_lng == null) return null;
              const isSos = sosRideIds.has(r.id);
              const color = isSos
                ? "#ef4444"
                : r.status === "procurar_motorista"
                  ? "#f59e0b"
                  : r.status === "em_viagem"
                    ? "#a855f7"
                    : "#3b82f6";
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
                    icon={symbol(color, isSos ? 13 : 11, 2)}
                    onClick={() => setSelectedRide(r)}
                    title={`Corrida ${r.id.slice(0, 6)} · ${STATUS_LABEL[r.status] ?? r.status}`}
                  />
                  {dest && (
                    <Marker
                      position={dest}
                      icon={symbol("#05070D", 6, 2)}
                      title={`Destino · ${r.id.slice(0, 6)}`}
                    />
                  )}
                  {driverPos && (
                    <Polyline
                      path={[driverPos, origin, ...(dest ? [dest] : [])]}
                      options={{ strokeColor: color, strokeOpacity: 0.7, strokeWeight: 3 }}
                    />
                  )}
                </Fragment>
              );
            })}
          </MovviMap>
        </div>

        {/* Side panel */}
        <Card className="border-border bg-card/60 h-[calc(100vh-360px)] min-h-[420px] flex flex-col">
          <Tabs defaultValue="rides" className="flex flex-col h-full">
            <TabsList className="mx-3 mt-3 grid grid-cols-4">
              <TabsTrigger value="rides" className="text-xs"><RouteIcon className="h-3.5 w-3.5 mr-1" />Corridas</TabsTrigger>
              <TabsTrigger value="drivers" className="text-xs"><Car className="h-3.5 w-3.5 mr-1" />Motoristas</TabsTrigger>
              <TabsTrigger value="passengers" className="text-xs"><Users className="h-3.5 w-3.5 mr-1" />Passag.</TabsTrigger>
              <TabsTrigger value="sos" className="text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5 mr-1" />SOS</TabsTrigger>
            </TabsList>

            <TabsContent value="rides" className="flex-1 overflow-hidden mt-3">
              <ScrollArea className="h-full px-3 pb-3">
                {filteredRides.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">Nenhuma corrida ativa.</p>
                )}
                <div className="space-y-2">
                  {filteredRides.map((r) => {
                    const passenger = r.passenger_id ? passengers.get(r.passenger_id) : null;
                    const isSos = sosRideIds.has(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedRide(r)}
                        className={`w-full text-left rounded-lg border ${isSos ? "border-destructive/60 bg-destructive/10" : "border-border bg-background/40"} p-2.5 hover:bg-muted/50 transition-colors`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono text-muted-foreground">#{r.id.slice(0, 6)}</span>
                          <Badge variant="outline" className="text-[10px] h-5">{STATUS_LABEL[r.status] ?? r.status}</Badge>
                        </div>
                        <p className="text-xs mt-1 truncate">
                          <span className="text-muted-foreground">Pax:</span> {passenger?.name ?? "—"}
                        </p>
                        <p className="text-xs truncate">
                          <span className="text-muted-foreground">Mot:</span> {r.driver_name ?? "—"}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                          <span>{r.category ?? "—"}</span>
                          <span>·</span>
                          <span>{r.payment_method ?? "—"}</span>
                          <span>·</span>
                          <span>{formatDistanceToNow(new Date(r.created_at), { locale: ptBR, addSuffix: false })}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="drivers" className="flex-1 overflow-hidden mt-3">
              <ScrollArea className="h-full px-3 pb-3">
                <div className="space-y-2">
                  {filteredDrivers.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDriver(d)}
                      className="w-full text-left rounded-lg border border-border bg-background/40 p-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ background: driverMarkerColor(d) }}
                        />
                        <span className="text-xs font-medium truncate flex-1">{d.name ?? "—"}</span>
                        <span className="text-[10px] text-muted-foreground">{d.vehicle_plate ?? ""}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {d.city ?? "—"} · {d.category ?? "—"} · ★ {(d.average_rating ?? d.rating ?? 0).toFixed(1)}
                      </p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="passengers" className="flex-1 overflow-hidden mt-3">
              <ScrollArea className="h-full px-3 pb-3">
                <div className="space-y-2">
                  {Array.from(passengers.values())
                    .filter((p) => matchesSearch(p.name) || matchesSearch(p.phone))
                    .map((p) => (
                      <button
                        key={p.auth_user_id}
                        onClick={() => setSelectedPassenger(p)}
                        className="w-full text-left rounded-lg border border-border bg-background/40 p-2.5 hover:bg-muted/50 transition-colors"
                      >
                        <p className="text-xs font-medium truncate">{p.name ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {p.city ?? "—"} · ★ {(p.average_rating ?? 0).toFixed(1)} · {p.completed_rides ?? 0} corridas
                        </p>
                      </button>
                    ))}
                  {passengers.size === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">Nenhum passageiro em corrida.</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="sos" className="flex-1 overflow-hidden mt-3">
              <ScrollArea className="h-full px-3 pb-3">
                {activeSos.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">Nenhum alerta ativo.</p>
                )}
                <div className="space-y-2">
                  {activeSos.map((s) => {
                    const ride = rides.find((r) => r.id === s.ride_id);
                    return (
                      <div
                        key={s.id}
                        className="rounded-lg border border-destructive/60 bg-destructive/10 p-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-destructive">SOS ATIVO</span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(s.created_at), { locale: ptBR, addSuffix: true })}
                          </span>
                        </div>
                        {ride && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Corrida #{ride.id.slice(0, 6)} · {ride.driver_name ?? "—"}
                          </p>
                        )}
                        {s.message && <p className="text-xs mt-1">{s.message}</p>}
                        {s.lat != null && s.lng != null && (
                          <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                            {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                          </p>
                        )}
                        {ride && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 text-xs"
                            onClick={() => setSelectedRide(ride)}
                          >
                            Abrir corrida
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Ride details */}
      <Sheet open={!!selectedRide} onOpenChange={(o) => !o && setSelectedRide(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selectedRide && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  Corrida <span className="font-mono text-sm text-muted-foreground">#{selectedRide.id.slice(0, 8)}</span>
                </SheetTitle>
              </SheetHeader>
              <RideDetail
                ride={selectedRide}
                passenger={selectedRide.passenger_id ? passengers.get(selectedRide.passenger_id) ?? null : null}
                driver={drivers.find((d) => d.id === selectedRide.driver_id) ?? null}
                onOpenDriver={(d) => { setSelectedRide(null); setSelectedDriver(d); }}
                onOpenPassenger={(p) => { setSelectedRide(null); setSelectedPassenger(p); }}
              />
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Driver details */}
      <Sheet open={!!selectedDriver} onOpenChange={(o) => !o && setSelectedDriver(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selectedDriver && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedDriver.name ?? "Motorista"}</SheetTitle>
              </SheetHeader>
              <DriverDetail
                driver={selectedDriver}
                currentRide={rides.find((r) => r.driver_id === selectedDriver.id) ?? null}
                onOpenRide={(r) => { setSelectedDriver(null); setSelectedRide(r); }}
              />
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Passenger details */}
      <Sheet open={!!selectedPassenger} onOpenChange={(o) => !o && setSelectedPassenger(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selectedPassenger && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedPassenger.name ?? "Passageiro"}</SheetTitle>
              </SheetHeader>
              <PassengerDetail
                passenger={selectedPassenger}
                currentRide={rides.find((r) => r.passenger_id === selectedPassenger.auth_user_id) ?? null}
                onOpenRide={(r) => { setSelectedPassenger(null); setSelectedRide(r); }}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}

/* ─── Sub-components ───────────────────────────────── */

function Kpi({ label, value, tone }: { label: string; value: number | string; tone: "green" | "blue" | "amber" | "violet" | "red" | "neutral" }) {
  const toneMap: Record<string, string> = {
    green: "text-emerald-500",
    blue: "text-blue-500",
    amber: "text-amber-500",
    violet: "text-violet-500",
    red: "text-destructive",
    neutral: "text-foreground",
  };
  return (
    <Card className="border-border bg-card/60">
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-bold ${toneMap[tone]}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm mt-0.5">{value ?? "—"}</p>
    </div>
  );
}

function RideDetail({
  ride,
  passenger,
  driver,
  onOpenDriver,
  onOpenPassenger,
}: {
  ride: Ride;
  passenger: PassengerLite | null;
  driver: Driver | null;
  onOpenDriver: (d: Driver) => void;
  onOpenPassenger: (p: PassengerLite) => void;
}) {
  const elapsed = formatDistanceToNow(new Date(ride.created_at), { locale: ptBR, addSuffix: false });
  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-2">
        <Badge>{STATUS_LABEL[ride.status] ?? ride.status}</Badge>
        <span className="text-xs text-muted-foreground">há {elapsed}</span>
      </div>

      {passenger && (
        <button
          onClick={() => onOpenPassenger(passenger)}
          className="w-full rounded-lg border border-border bg-background/40 p-3 text-left hover:bg-muted/50"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Passageiro</p>
          <p className="text-sm font-medium mt-0.5">{passenger.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">★ {(passenger.average_rating ?? 0).toFixed(1)} · {passenger.completed_rides ?? 0} corridas</p>
        </button>
      )}

      {driver && (
        <button
          onClick={() => onOpenDriver(driver)}
          className="w-full rounded-lg border border-border bg-background/40 p-3 text-left hover:bg-muted/50"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Motorista</p>
          <p className="text-sm font-medium mt-0.5">{driver.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {driver.vehicle_model ?? "—"} · {driver.vehicle_plate ?? "—"} · ★ {(driver.average_rating ?? driver.rating ?? 0).toFixed(1)}
          </p>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria" value={ride.category ?? "—"} />
        <Field label="Pagamento" value={ride.payment_method ?? "—"} />
        <Field label="Distância" value={ride.distance_km ? `${ride.distance_km.toFixed(1)} km` : "—"} />
        <Field label="Duração est." value={ride.duration_min ? `${Math.round(ride.duration_min)} min` : "—"} />
        <Field label="Preço est." value={ride.estimated_price ? `R$ ${ride.estimated_price.toFixed(2)}` : "—"} />
        <Field label="Tempo decorrido" value={elapsed} />
      </div>

      <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Rota</p>
        <div className="flex items-start gap-2">
          <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          <p className="text-xs">{ride.origin_name ?? "—"}</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-1 h-2 w-2 rounded-full bg-destructive shrink-0" />
          <p className="text-xs">{ride.destination_name ?? "—"}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background/40 p-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Timeline</p>
        <TimelineRow label="Solicitada" ts={ride.created_at} />
        <TimelineRow label="Aceita" ts={ride.accepted_at} />
        <TimelineRow label="Iniciada" ts={ride.started_at} />
        <TimelineRow label="Concluída" ts={ride.completed_at} />
      </div>
    </div>
  );
}

function TimelineRow({ label, ts }: { label: string; ts: string | null }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={ts ? "" : "text-muted-foreground/50"}>
        {ts ? new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
      </span>
    </div>
  );
}

function DriverDetail({
  driver,
  currentRide,
  onOpenRide,
}: {
  driver: Driver;
  currentRide: Ride | null;
  onOpenRide: (r: Ride) => void;
}) {
  const lastGps = driver.last_location_at
    ? formatDistanceToNow(new Date(driver.last_location_at), { locale: ptBR, addSuffix: true })
    : "—";
  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant={driver.is_online ? "default" : "secondary"}>
          {driver.is_online ? "Online" : "Offline"}
        </Badge>
        <Badge variant="outline">{driver.subscription_status ?? "—"}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Telefone" value={driver.phone ?? "—"} />
        <Field label="Cidade" value={driver.city ?? "—"} />
        <Field label="Categoria" value={driver.category ?? "—"} />
        <Field label="Avaliação" value={`★ ${(driver.average_rating ?? driver.rating ?? 0).toFixed(1)}`} />
        <Field label="Corridas" value={driver.completed_rides ?? 0} />
        <Field label="GPS atualizado" value={lastGps} />
        <Field label="Veículo" value={`${driver.vehicle_model ?? "—"} ${driver.vehicle_color ?? ""}`.trim()} />
        <Field label="Placa" value={driver.vehicle_plate ?? "—"} />
      </div>

      {driver.current_lat && driver.current_lng && (
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Localização atual</p>
          <p className="text-xs font-mono mt-1">
            {driver.current_lat.toFixed(5)}, {driver.current_lng.toFixed(5)}
          </p>
        </div>
      )}

      {currentRide && (
        <button
          onClick={() => onOpenRide(currentRide)}
          className="w-full rounded-lg border border-border bg-background/40 p-3 text-left hover:bg-muted/50"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Corrida atual</p>
          <p className="text-sm font-medium mt-0.5">#{currentRide.id.slice(0, 8)}</p>
          <p className="text-xs text-muted-foreground">{STATUS_LABEL[currentRide.status] ?? currentRide.status}</p>
        </button>
      )}
    </div>
  );
}

function PassengerDetail({
  passenger,
  currentRide,
  onOpenRide,
}: {
  passenger: PassengerLite;
  currentRide: Ride | null;
  onOpenRide: (r: Ride) => void;
}) {
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Telefone" value={passenger.phone ?? "—"} />
        <Field label="Cidade" value={passenger.city ?? "—"} />
        <Field label="Avaliação" value={`★ ${(passenger.average_rating ?? 0).toFixed(1)}`} />
        <Field label="Corridas" value={passenger.completed_rides ?? 0} />
      </div>

      {currentRide && (
        <button
          onClick={() => onOpenRide(currentRide)}
          className="w-full rounded-lg border border-border bg-background/40 p-3 text-left hover:bg-muted/50"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Corrida atual</p>
          <p className="text-sm font-medium mt-0.5">#{currentRide.id.slice(0, 8)}</p>
          <p className="text-xs text-muted-foreground truncate">{currentRide.origin_name ?? "—"}</p>
          <p className="text-xs text-muted-foreground truncate">→ {currentRide.destination_name ?? "—"}</p>
        </button>
      )}
    </div>
  );
}

// suppress unused import warning
void X;
