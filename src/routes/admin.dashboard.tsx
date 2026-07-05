import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Inbox,
} from "lucide-react";
import { Marker } from "@react-google-maps/api";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { MovviMap } from "@/components/MovviMap";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { formatBRL, formatNumber, formatDate } from "@/lib/formatters";
import {
  DSCard,
  DSCardContent,
  DSCardHeader,
  DSCardTitle,
  Typography,
  Label,
  Metric,
  BodySmall,
  Caption,
  Icon,
  StatusPill,
  EmptyState,
  Loading,
  ds,
} from "@/design-system";

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

type StatusKey =
  | "searching"
  | "driverComing"
  | "arrived"
  | "trip"
  | "finished"
  | "cancelled"
  | "offline";

function mapRideStatus(status: string): { key: StatusKey; label: string } {
  if (status === "procurar_motorista") return { key: "searching", label: "Buscando" };
  if (status === "motorista_a_caminho") return { key: "driverComing", label: "A caminho" };
  if (status === "motorista_chegou") return { key: "arrived", label: "Chegou" };
  if (status === "em_viagem") return { key: "trip", label: "Em viagem" };
  if (status === "finalizada") return { key: "finished", label: "Finalizada" };
  if (status.startsWith("cancelada")) return { key: "cancelled", label: "Cancelada" };
  return { key: "offline", label: status.replace(/_/g, " ") };
}

function AdminDashboardPage() {
  const [m, setM] = useState<Metrics>(EMPTY);
  const [online, setOnline] = useState<OnlineDriver[]>([]);
  const [recent, setRecent] = useState<RecentRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // Debounced reload to avoid render storms from realtime bursts.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reload = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setTick((t) => t + 1), 400);
  };
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

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
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Kpi icon={Radio} label="Motoristas online" value={formatNumber(m.driversOnline)} tone="primary" loading={loading} />
        <Kpi icon={UserX} label="Motoristas offline" value={formatNumber(m.driversOffline)} loading={loading} />
        <Kpi icon={Clock} label="Aprovações pendentes" value={formatNumber(m.driversPending)} tone="warn" loading={loading} to="/admin/motoristas" />
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
        <DSCard className="lg:col-span-2 overflow-hidden">
          <DSCardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <DSCardTitle className="min-w-0 truncate text-base">Motoristas online no mapa</DSCardTitle>
            <StatusPill status="online" label={`${online.length} online`} pulse={online.length > 0} />
          </DSCardHeader>
          <DSCardContent className="p-0">
            <div className="w-full h-[320px] md:h-[380px] lg:h-[420px]">
              <MovviMap center={mapCenter}>
                {online.map((d) => {
                  if (!d.current_lat || !d.current_lng) return null;
                  const g = typeof window !== "undefined" ? (window as unknown as { google?: typeof google }).google : undefined;
                  if (!g?.maps) return null;
                  return (
                    <Marker
                      key={d.id}
                      position={{ lat: d.current_lat, lng: d.current_lng }}
                      icon={{
                        path: g.maps.SymbolPath.CIRCLE,
                        scale: 7,
                        fillColor: ds.brand.greenPrimary,
                        fillOpacity: 1,
                        strokeColor: ds.brand.black,
                        strokeWeight: 2,
                      }}
                    />
                  );
                })}
              </MovviMap>
            </div>
          </DSCardContent>
        </DSCard>

        <DSCard>
          <DSCardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <DSCardTitle className="min-w-0 truncate text-base">Últimas solicitações</DSCardTitle>
            <Caption>tempo real</Caption>
          </DSCardHeader>
          <DSCardContent className="space-y-2 p-3">
            {loading && recent.length === 0 && <Loading label="Carregando…" />}
            {!loading && recent.length === 0 && (
              <EmptyState
                icon={Inbox}
                title="Sem corridas recentes"
                description="Novas solicitações aparecerão aqui em tempo real."
              />
            )}
            {recent.map((r) => {
              const s = mapRideStatus(r.status);
              return (
                <div key={r.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Typography variant="caption" className="capitalize truncate">
                      {r.category}
                    </Typography>
                    <Caption className="shrink-0">{formatDate(r.created_at)}</Caption>
                  </div>
                  <BodySmall className="mt-2 truncate font-medium text-foreground">
                    {r.origin_name ?? "—"}
                  </BodySmall>
                  <BodySmall className="truncate text-muted-foreground">
                    → {r.destination_name ?? "—"}
                  </BodySmall>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StatusPill status={s.key} label={s.label} pulse={false} />
                    <BodySmall className="font-semibold shrink-0">
                      {formatBRL(Number(r.estimated_price) || 0)}
                    </BodySmall>
                  </div>
                </div>
              );
            })}
          </DSCardContent>
        </DSCard>
      </div>
    </AdminLayout>
  );
}

function Kpi({
  icon: IconCmp,
  label,
  value,
  tone,
  loading,
  to,
}: {
  icon: typeof Car;
  label: string;
  value: string;
  tone?: "primary" | "warn";
  loading?: boolean;
  to?: string;
}) {
  const accent =
    tone === "primary"
      ? "border-primary/30 bg-primary/5"
      : tone === "warn"
      ? "border-warning/30 bg-warning/5"
      : "border-border bg-card";

  const card = (
    <DSCard
      className={`h-full min-h-[96px] transition hover:border-primary/50 ${accent}`}
    >
      <DSCardContent className="flex h-full items-center gap-3 p-4">
        <div className="shrink-0 rounded-lg bg-background p-2">
          <Icon as={IconCmp} size="md" className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <Label className="block truncate">{label}</Label>
          <Metric className="block truncate leading-tight">
            {loading ? "…" : value}
          </Metric>
        </div>
      </DSCardContent>
    </DSCard>
  );

  return to ? (
    <Link to={to} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[inherit]">
      {card}
    </Link>
  ) : (
    card
  );
}
