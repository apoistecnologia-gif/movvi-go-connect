/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
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
  UserCheck,
  Radio,
  Inbox,
  ShieldAlert,
  LifeBuoy,
  WalletCards,
  ReceiptText,
} from "lucide-react";
import { Marker } from "@react-google-maps/api";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { MovviMap } from "@/components/MovviMap";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { formatBRL, formatNumber, formatDate } from "@/lib/formatters";
import { getAdminDashboardMetrics, type AdminDashboardMetrics } from "@/lib/adminControlPlane";
import { APOIS_ADMIN_MAP } from "@/lib/adminVisual";
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
} from "@/design-system";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Admin APOIS" }] }),
  component: AdminDashboardPage,
});

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

const EMPTY_METRICS: AdminDashboardMetrics = {
  drivers: { total: 0, online: 0, pending_review: 0 },
  passengers: { total: 0 },
  rides: { active: 0, completed_today: 0, cancelled_today: 0 },
  operations: { open_sos: 0, open_support: 0 },
  finance: {
    today: {
      gmv_cents: 0,
      driver_earnings_cents: 0,
      platform_revenue_cents: 0,
      provider_fees_cents: 0,
    },
    month: {
      gmv_cents: 0,
      driver_earnings_cents: 0,
      platform_revenue_cents: 0,
      provider_fees_cents: 0,
    },
  },
};

type StatusKey =
  "searching" | "driverComing" | "arrived" | "trip" | "finished" | "cancelled" | "offline";

function mapRideStatus(status: string): { key: StatusKey; label: string } {
  if (status === "procurar_motorista") return { key: "searching", label: "Buscando" };
  if (status === "motorista_a_caminho") return { key: "driverComing", label: "A caminho" };
  if (status === "motorista_chegou") return { key: "arrived", label: "Chegou" };
  if (status === "em_viagem") return { key: "trip", label: "Em viagem" };
  if (status === "finalizada") return { key: "finished", label: "Finalizada" };
  if (status.startsWith("cancelada")) return { key: "cancelled", label: "Cancelada" };
  return { key: "offline", label: status.replace(/_/g, " ") };
}

const centsToBrl = (value: number) => formatBRL(Number(value || 0) / 100);

function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<AdminDashboardMetrics>(EMPTY_METRICS);
  const [online, setOnline] = useState<OnlineDriver[]>([]);
  const [recent, setRecent] = useState<RecentRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reload = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setTick((value) => value + 1), 400);
  };
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      setError(null);
      try {
        const db = supabase as any;
        const [nextMetrics, onlineRows, recentRows] = await Promise.all([
          getAdminDashboardMetrics(),
          db
            .from("drivers")
            .select("id,name,current_lat,current_lng")
            .eq("is_online", true)
            .not("current_lat", "is", null)
            .limit(200),
          db
            .from("rides")
            .select(
              "id,passenger_id,category,status,origin_name,destination_name,estimated_price,created_at",
            )
            .order("created_at", { ascending: false })
            .limit(15),
        ]);
        if (!alive) return;
        if (onlineRows.error) throw new Error(onlineRows.error.message);
        if (recentRows.error) throw new Error(recentRows.error.message);
        setMetrics(nextMetrics);
        setOnline((onlineRows.data ?? []) as OnlineDriver[]);
        setRecent((recentRows.data ?? []) as RecentRide[]);
      } catch (caught) {
        if (!alive) return;
        setError(
          caught instanceof Error ? caught.message : "Não foi possível carregar o Dashboard.",
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tick]);

  useRealtimeTable("rides", reload);
  useRealtimeTable("drivers", reload);
  useRealtimeTable("ride_settlements", reload);
  useRealtimeTable("sos_alerts", reload);
  useRealtimeTable("passenger_support_tickets", reload);

  const mapCenter = useMemo(() => {
    const withCoord = online.find((driver) => driver.current_lat && driver.current_lng);
    return withCoord ? { lat: withCoord.current_lat!, lng: withCoord.current_lng! } : null;
  }, [online]);

  return (
    <AdminLayout
      title="Dashboard"
      description="Visão operacional e financeira canônica do APOIS Corridas"
    >
      {error && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Kpi
          icon={Radio}
          label="Motoristas online"
          value={formatNumber(metrics.drivers.online)}
          tone="primary"
          loading={loading}
        />
        <Kpi
          icon={Car}
          label="Motoristas total"
          value={formatNumber(metrics.drivers.total)}
          loading={loading}
        />
        <Kpi
          icon={Clock}
          label="KYC pendente"
          value={formatNumber(metrics.drivers.pending_review)}
          tone="warn"
          loading={loading}
          to="/admin/motoristas"
        />
        <Kpi
          icon={Users}
          label="Passageiros"
          value={formatNumber(metrics.passengers.total)}
          loading={loading}
        />
        <Kpi
          icon={Activity}
          label="Corridas ativas"
          value={formatNumber(metrics.rides.active)}
          tone="primary"
          loading={loading}
        />
        <Kpi
          icon={CheckCircle2}
          label="Concluídas hoje"
          value={formatNumber(metrics.rides.completed_today)}
          loading={loading}
        />
        <Kpi
          icon={XCircle}
          label="Canceladas hoje"
          value={formatNumber(metrics.rides.cancelled_today)}
          loading={loading}
        />
        <Kpi
          icon={ShieldAlert}
          label="SOS em aberto"
          value={formatNumber(metrics.operations.open_sos)}
          tone="warn"
          loading={loading}
          to="/admin/seguranca"
        />
        <Kpi
          icon={LifeBuoy}
          label="Suporte em aberto"
          value={formatNumber(metrics.operations.open_support)}
          loading={loading}
          to="/admin/suporte"
        />
        <Kpi
          icon={ReceiptText}
          label="GMV liquidado hoje"
          value={centsToBrl(metrics.finance.today.gmv_cents)}
          loading={loading}
        />
        <Kpi
          icon={WalletCards}
          label="Ganhos motoristas hoje"
          value={centsToBrl(metrics.finance.today.driver_earnings_cents)}
          loading={loading}
        />
        <Kpi
          icon={DollarSign}
          label="Receita APOIS hoje"
          value={centsToBrl(metrics.finance.today.platform_revenue_cents)}
          tone="primary"
          loading={loading}
        />
        <Kpi
          icon={DollarSign}
          label="Receita APOIS mês"
          value={centsToBrl(metrics.finance.month.platform_revenue_cents)}
          loading={loading}
        />
        <Kpi
          icon={ReceiptText}
          label="GMV liquidado mês"
          value={centsToBrl(metrics.finance.month.gmv_cents)}
          loading={loading}
        />
        <Kpi
          icon={UserCheck}
          label="Ganhos motoristas mês"
          value={centsToBrl(metrics.finance.month.driver_earnings_cents)}
          loading={loading}
        />
        <Kpi
          icon={DollarSign}
          label="Taxas do provedor hoje"
          value={centsToBrl(metrics.finance.today.provider_fees_cents)}
          loading={loading}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <DSCard className="lg:col-span-2 overflow-hidden">
          <DSCardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <DSCardTitle className="min-w-0 truncate text-base">
              Motoristas online no mapa
            </DSCardTitle>
            <StatusPill
              status="online"
              label={`${online.length} online`}
              pulse={online.length > 0}
            />
          </DSCardHeader>
          <DSCardContent className="p-0">
            <div className="w-full h-[320px] md:h-[380px] lg:h-[420px]">
              <MovviMap center={mapCenter}>
                {online.map((driver) => {
                  if (!driver.current_lat || !driver.current_lng) return null;
                  const googleApi =
                    typeof window !== "undefined"
                      ? (window as unknown as { google?: typeof google }).google
                      : undefined;
                  if (!googleApi?.maps) return null;
                  return (
                    <Marker
                      key={driver.id}
                      position={{ lat: driver.current_lat, lng: driver.current_lng }}
                      icon={{
                        path: googleApi.maps.SymbolPath.CIRCLE,
                        scale: 7,
                        fillColor: APOIS_ADMIN_MAP.gold,
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
            {recent.map((ride) => {
              const status = mapRideStatus(ride.status);
              return (
                <div key={ride.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Typography variant="caption" className="capitalize truncate">
                      {ride.category}
                    </Typography>
                    <Caption className="shrink-0">{formatDate(ride.created_at)}</Caption>
                  </div>
                  <BodySmall className="mt-2 truncate font-medium text-foreground">
                    {ride.origin_name ?? "—"}
                  </BodySmall>
                  <BodySmall className="truncate text-muted-foreground">
                    → {ride.destination_name ?? "—"}
                  </BodySmall>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StatusPill status={status.key} label={status.label} pulse={false} />
                    <BodySmall className="font-semibold shrink-0">
                      Estimado {formatBRL(Number(ride.estimated_price) || 0)}
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
    <DSCard className={`h-full min-h-[96px] transition hover:border-primary/50 ${accent}`}>
      <DSCardContent className="flex h-full items-center gap-3 p-4">
        <div className="shrink-0 rounded-lg bg-background p-2">
          <Icon as={IconCmp} size="md" className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <Label className="block truncate">{label}</Label>
          <Metric className="block truncate leading-tight">{loading ? "…" : value}</Metric>
        </div>
      </DSCardContent>
    </DSCard>
  );

  return to ? (
    <Link
      to={to}
      className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[inherit]"
    >
      {card}
    </Link>
  ) : (
    card
  );
}
