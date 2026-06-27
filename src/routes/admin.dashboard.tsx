import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Car,
  Users,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  CreditCard,
  UserCheck,
  UserX,
  Radio,
} from "lucide-react";
import { Marker } from "@react-google-maps/api";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { MovviMap } from "@/components/MovviMap";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { formatBRL, formatNumber, formatDate } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Admin MOVVI" }] }),
  component: AdminDashboardPage,
});

interface Metrics {
  driversOnline: number;
  driversOffline: number;
  driversPending: number;
  driversTotal: number;
  passengersTotal: number;
  ridesActive: number;
  ridesCompletedToday: number;
  ridesCancelledToday: number;
  subsActive: number;
  revenueToday: number;
  revenueMonth: number;
}

interface OnlineDriver {
  id: string;
  name: string | null;
  current_lat: number | null;
  current_lng: number | null;
}

interface RecentRide {
  id: string;
  passenger_id: string;
  category: string;
  status: string;
  origin_name: string | null;
  destination_name: string | null;
  estimated_price: number | null;
  created_at: string;
}

const EMPTY: Metrics = {
  driversOnline: 0, driversOffline: 0, driversPending: 0, driversTotal: 0,
  passengersTotal: 0, ridesActive: 0, ridesCompletedToday: 0, ridesCancelledToday: 0,
  subsActive: 0, revenueToday: 0, revenueMonth: 0,
};

const ACTIVE_STATUSES = ["procurar_motorista", "motorista_a_caminho", "motorista_chegou", "em_viagem"] as const;

function AdminDashboardPage() {
  const [m, setM] = useState<Metrics>(EMPTY);
  const [online, setOnline] = useState<OnlineDriver[]>([]);
  const [recent, setRecent] = useState<RecentRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;
    (async () => {
      const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthIso = monthStart.toISOString();

      const [
        driversAll,
        driversPending,
        passengers,
        ridesActive,
        ridesDoneToday,
        ridesCancToday,
        subsActive,
        revenueTodayRows,
        revenueMonthRows,
        onlineRows,
        recentRows,
      ] = await Promise.all([
        supabase.from("drivers").select("id,is_online,approval_status", { count: "exact" }),
        supabase.from("drivers").select("id", { count: "exact", head: true }).eq("approval_status", "em_analise"),
        supabase.from("users").select("id", { count: "exact", head: true }),
        supabase.from("rides").select("id", { count: "exact", head: true }).in("status", ACTIVE_STATUSES),
        supabase.from("rides").select("id", { count: "exact", head: true }).eq("status", "finalizada").gte("completed_at", todayIso),
        supabase.from("rides").select("id", { count: "exact", head: true }).like("status", "cancelada_%").gte("cancelled_at", todayIso),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("rides").select("final_price,estimated_price").eq("status", "finalizada").gte("completed_at", todayIso),
        supabase.from("rides").select("final_price,estimated_price").eq("status", "finalizada").gte("completed_at", monthIso),
        supabase.from("drivers").select("id,name,current_lat,current_lng").eq("is_online", true).not("current_lat", "is", null).limit(200),
        supabase.from("rides").select("id,passenger_id,category,status,origin_name,destination_name,estimated_price,created_at").order("created_at", { ascending: false }).limit(15),
      ]);

      if (!alive) return;

      const driversList = driversAll.data ?? [];
      const driversOnline = driversList.filter((d) => d.is_online).length;
      const approved = driversList.filter((d) => d.approval_status === "aprovado");
      const driversOffline = approved.length - driversOnline;

      const sumFare = (rows: { final_price: number | null; estimated_price: number | null }[] | null) =>
        (rows ?? []).reduce((acc, r) => acc + (Number(r.final_price ?? r.estimated_price) || 0), 0);

      setM({
        driversOnline,
        driversOffline: Math.max(0, driversOffline),
        driversPending: driversPending.count ?? 0,
        driversTotal: driversAll.count ?? driversList.length,
        passengersTotal: passengers.count ?? 0,
        ridesActive: ridesActive.count ?? 0,
        ridesCompletedToday: ridesDoneToday.count ?? 0,
        ridesCancelledToday: ridesCancToday.count ?? 0,
        subsActive: subsActive.count ?? 0,
        revenueToday: sumFare(revenueTodayRows.data),
        revenueMonth: sumFare(revenueMonthRows.data),
      });
      setOnline((onlineRows.data ?? []) as OnlineDriver[]);
      setRecent((recentRows.data ?? []) as RecentRide[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [tick]);

  useRealtimeTable("rides", reload);
  useRealtimeTable("drivers", reload);
  useRealtimeTable("subscriptions", reload);

  const mapCenter = useMemo(() => {
    const withCoord = online.find((d) => d.current_lat && d.current_lng);
    return withCoord ? { lat: withCoord.current_lat!, lng: withCoord.current_lng! } : null;
  }, [online]);

  return (
    <AdminLayout title="Dashboard" description="Visão geral da operação MOVVI DRIVE em tempo real">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Radio} label="Motoristas online" value={formatNumber(m.driversOnline)} tone="primary" loading={loading} />
        <Kpi icon={UserX} label="Motoristas offline" value={formatNumber(m.driversOffline)} loading={loading} />
        <Kpi icon={Clock} label="Aprovações pendentes" value={formatNumber(m.driversPending)} tone="warn" loading={loading} link="/admin/motoristas" />
        <Kpi icon={Activity} label="Corridas ativas" value={formatNumber(m.ridesActive)} tone="primary" loading={loading} />
        <Kpi icon={CheckCircle2} label="Concluídas hoje" value={formatNumber(m.ridesCompletedToday)} loading={loading} />
        <Kpi icon={XCircle} label="Canceladas hoje" value={formatNumber(m.ridesCancelledToday)} loading={loading} />
        <Kpi icon={Users} label="Passageiros" value={formatNumber(m.passengersTotal)} loading={loading} />
        <Kpi icon={Car} label="Motoristas (total)" value={formatNumber(m.driversTotal)} loading={loading} />
        <Kpi icon={CreditCard} label="Assinaturas ativas" value={formatNumber(m.subsActive)} loading={loading} />
        <Kpi icon={DollarSign} label="Receita hoje" value={formatBRL(m.revenueToday)} tone="primary" loading={loading} />
        <Kpi icon={DollarSign} label="Receita do mês" value={formatBRL(m.revenueMonth)} loading={loading} />
        <Kpi icon={UserCheck} label="Aprovados" value={formatNumber(m.driversOnline + m.driversOffline)} loading={loading} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Motoristas online no mapa</CardTitle>
            <Badge variant="outline" className="border-primary/30 text-primary">
              {online.length} online
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[420px] w-full">
              <MovviMap center={mapCenter}>
                {online.map((d) =>
                  d.current_lat && d.current_lng ? (
                    <Marker
                      key={d.id}
                      position={{ lat: d.current_lat, lng: d.current_lng }}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 7,
                        fillColor: "#8DD92B",
                        fillOpacity: 1,
                        strokeColor: "#05070D",
                        strokeWeight: 2,
                      }}
                    />
                  ) : null,
                )}
              </MovviMap>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Últimas solicitações</CardTitle>
            <span className="text-xs text-muted-foreground">tempo real</span>
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {recent.length === 0 && !loading && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Sem corridas recentes.</p>
            )}
            {recent.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/60 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">{r.category}</Badge>
                  <span className="text-[10px] text-muted-foreground">{formatDate(r.created_at)}</span>
                </div>
                <p className="mt-2 truncate font-medium text-foreground">{r.origin_name ?? "—"}</p>
                <p className="truncate text-muted-foreground">→ {r.destination_name ?? "—"}</p>
                <div className="mt-2 flex items-center justify-between">
                  <Badge className="bg-primary/15 text-primary border border-primary/30 text-[10px]">
                    {r.status.replace(/_/g, " ")}
                  </Badge>
                  <span className="font-semibold">{formatBRL(Number(r.estimated_price) || 0)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
  loading,
  link,
}: {
  icon: typeof Car;
  label: string;
  value: string;
  tone?: "primary" | "warn";
  loading?: boolean;
  link?: string;
}) {
  const accent =
    tone === "primary"
      ? "border-primary/30 bg-primary/5"
      : tone === "warn"
      ? "border-yellow-500/30 bg-yellow-500/5"
      : "border-border bg-card";
  const inner = (
    <Card className={`transition hover:border-primary/50 ${accent}`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-background p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="font-display text-xl font-bold leading-tight truncate">
            {loading ? "…" : value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
  return link ? <Link to={link}>{inner}</Link> : inner;
}
