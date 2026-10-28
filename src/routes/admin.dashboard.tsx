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
  RefreshCw,
} from "lucide-react";
import { Marker } from "@react-google-maps/api";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { MovviMap } from "@/components/MovviMap";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { formatBRL, formatNumber, formatDate } from "@/lib/formatters";
import { getAdminDashboardMetrics, type AdminDashboardMetrics } from "@/lib/adminControlPlane";
import {
  DSButton,
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
  | "searching"
  | "driverComing"
  | "arrived"
  | "trip"
  | "finished"
  | "cancelled"
  | "offline";

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 180);
  return text || fallback;
}

function safeCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function safeMoney(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
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
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapRideStatus(value: unknown): { key: StatusKey; label: string } {
  const status = cleanText(value).toLowerCase();
  if (status === "procurar_motorista") return { key: "searching", label: "Buscando" };
  if (status === "motorista_a_caminho") return { key: "driverComing", label: "A caminho" };
  if (status === "motorista_chegou") return { key: "arrived", label: "Chegou" };
  if (status === "em_viagem") return { key: "trip", label: "Em viagem" };
  if (status === "finalizada") return { key: "finished", label: "Finalizada" };
  if (status === "expired") return { key: "cancelled", label: "Expirada" };
  if (status.startsWith("cancelada")) return { key: "cancelled", label: "Cancelada" };
  return { key: "offline", label: cleanText(status.replace(/_/g, " "), "Status não informado") };
}

const centsToBrl = (value: unknown) => formatBRL(safeMoney(value) / 100);

function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<AdminDashboardMetrics>(EMPTY_METRICS);
  const [online, setOnline] = useState<OnlineDriver[]>([]);
  const [recent, setRecent] = useState<RecentRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);
  const reload = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setTick((value) => value + 1), 400);
  };

  useEffect(
    () => () => {
      requestRef.current += 1;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    void (async () => {
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
        if (requestId !== requestRef.current) return;
        if (onlineRows.error) throw onlineRows.error;
        if (recentRows.error) throw recentRows.error;

        const normalizedOnline = ((onlineRows.data ?? []) as OnlineDriver[])
          .filter((driver) => cleanText(driver.id) && validCoordinate(driver.current_lat, driver.current_lng))
          .map((driver) => ({
            id: cleanText(driver.id),
            name: cleanText(driver.name) || null,
            current_lat: Number(driver.current_lat),
            current_lng: Number(driver.current_lng),
          }));

        const normalizedRecent = ((recentRows.data ?? []) as RecentRide[])
          .filter((ride) => cleanText(ride.id))
          .map((ride) => ({
            id: cleanText(ride.id),
            passenger_id: cleanText(ride.passenger_id),
            category: cleanText(ride.category, "Categoria não informada"),
            status: cleanText(ride.status, "não informado"),
            origin_name: cleanText(ride.origin_name, "Origem não informada"),
            destination_name: cleanText(ride.destination_name, "Destino não informado"),
            estimated_price: safeMoney(ride.estimated_price),
            created_at: validDate(ride.created_at)?.toISOString() ?? "",
          }));

        setMetrics({
          ...nextMetrics,
          drivers: {
            total: safeCount(nextMetrics.drivers.total),
            online: safeCount(nextMetrics.drivers.online),
            pending_review: safeCount(nextMetrics.drivers.pending_review),
          },
          passengers: { total: safeCount(nextMetrics.passengers.total) },
          rides: {
            active: safeCount(nextMetrics.rides.active),
            completed_today: safeCount(nextMetrics.rides.completed_today),
            cancelled_today: safeCount(nextMetrics.rides.cancelled_today),
          },
          operations: {
            open_sos: safeCount(nextMetrics.operations.open_sos),
            open_support: safeCount(nextMetrics.operations.open_support),
          },
        });
        setOnline(normalizedOnline);
        setRecent(normalizedRecent);
      } catch (caught) {
        if (requestId !== requestRef.current) return;
        setError("Não foi possível carregar o dashboard agora. Tente novamente.");
        if (import.meta.env.DEV) console.warn("[APOIS Admin] falha no dashboard", caught);
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    })();
    return () => {
      requestRef.current += 1;
    };
  }, [tick]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useRealtimeTable("rides", reload);
  useRealtimeTable("drivers", reload);
  useRealtimeTable("ride_settlements", reload);
  useRealtimeTable("sos_alerts", reload);
  useRealtimeTable("passenger_support_tickets", reload);

  const mapCenter = useMemo(() => {
    const withCoord = online.find((driver) => validCoordinate(driver.current_lat, driver.current_lng));
    return withCoord
      ? { lat: Number(withCoord.current_lat), lng: Number(withCoord.current_lng) }
      : null;
  }, [online]);

  return (
    <AdminLayout
      title="Dashboard"
      description="Visão operacional e financeira canônica do APOIS Corridas"
      actions={
        <DSButton
          variant="outline"
          size="sm"
          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={reload}
          disabled={loading}
          aria-busy={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          {loading ? "Atualizando…" : "Atualizar"}
        </DSButton>
      }
    >
      {error ? (
        <div className="mb-4 space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          <p>{error}</p>
          <DSButton variant="outline" className="min-h-11 gap-2" onClick={reload}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
          </DSButton>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Kpi icon={Radio} label="Motoristas online" value={formatNumber(metrics.drivers.online)} tone="primary" loading={loading} />
        <Kpi icon={Car} label="Motoristas total" value={formatNumber(metrics.drivers.total)} loading={loading} />
        <Kpi icon={Clock} label="KYC pendente" value={formatNumber(metrics.drivers.pending_review)} tone="warn" loading={loading} to="/admin/motoristas" />
        <Kpi icon={Users} label="Passageiros" value={formatNumber(metrics.passengers.total)} loading={loading} />
        <Kpi icon={Activity} label="Corridas ativas" value={formatNumber(metrics.rides.active)} tone="primary" loading={loading} />
        <Kpi icon={CheckCircle2} label="Concluídas hoje" value={formatNumber(metrics.rides.completed_today)} loading={loading} />
        <Kpi icon={XCircle} label="Canceladas hoje" value={formatNumber(metrics.rides.cancelled_today)} loading={loading} />
        <Kpi icon={ShieldAlert} label="SOS em aberto" value={formatNumber(metrics.operations.open_sos)} tone="warn" loading={loading} to="/admin/seguranca" />
        <Kpi icon={LifeBuoy} label="Suporte em aberto" value={formatNumber(metrics.operations.open_support)} loading={loading} to="/admin/suporte" />
        <Kpi icon={ReceiptText} label="GMV liquidado hoje" value={centsToBrl(metrics.finance.today.gmv_cents)} loading={loading} />
        <Kpi icon={WalletCards} label="Ganhos motoristas hoje" value={centsToBrl(metrics.finance.today.driver_earnings_cents)} loading={loading} />
        <Kpi icon={DollarSign} label="Receita APOIS hoje" value={centsToBrl(metrics.finance.today.platform_revenue_cents)} tone="primary" loading={loading} />
        <Kpi icon={DollarSign} label="Receita APOIS mês" value={centsToBrl(metrics.finance.month.platform_revenue_cents)} loading={loading} />
        <Kpi icon={ReceiptText} label="GMV liquidado mês" value={centsToBrl(metrics.finance.month.gmv_cents)} loading={loading} />
        <Kpi icon={UserCheck} label="Ganhos motoristas mês" value={centsToBrl(metrics.finance.month.driver_earnings_cents)} loading={loading} />
        <Kpi icon={DollarSign} label="Taxas do provedor hoje" value={centsToBrl(metrics.finance.today.provider_fees_cents)} loading={loading} />
      </div>

      <div className="mt-6 flex min-w-0 flex-col gap-4">
        <DSCard className="min-w-0 overflow-hidden">
          <DSCardHeader className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <DSCardTitle className="min-w-0 break-words text-base">Motoristas online no mapa</DSCardTitle>
            <StatusPill status="online" label={`${online.length} online`} pulse={false} />
          </DSCardHeader>
          <DSCardContent className="p-0">
            <div className="h-[min(72dvh,720px)] min-h-[420px] w-full min-w-0 sm:min-h-[520px]">
              <MovviMap center={mapCenter} missingApiKeyMessage="Google Maps não configurado neste painel. Adicione VITE_APOIS_GOOGLE_MAPS_BROWSER_KEY nas variáveis de ambiente da Vercel e gere uma nova implantação.">
                {online.map((driver) => {
                  if (!validCoordinate(driver.current_lat, driver.current_lng)) return null;
                  const googleApi =
                    typeof window !== "undefined"
                      ? (window as unknown as { google?: typeof google }).google
                      : undefined;
                  if (!googleApi?.maps) return null;
                  return (
                    <Marker
                      key={driver.id}
                      position={{ lat: Number(driver.current_lat), lng: Number(driver.current_lng) }}
                      title={driver.name || "Motorista online"}
                      icon={{
                        url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="#C91425" stroke="#FFFFFF" stroke-width="3"/><path d="m13 26 3-10h16l3 10v9h-4v-3H17v3h-4v-9zm6-7-2 7h14l-2-7H19zm0 10a2 2 0 1 0 0 .01zm12 0a2 2 0 1 0 0 .01z" fill="#FFFFFF"/></svg>'),
                        scaledSize: new googleApi.maps.Size(44, 44),
                        anchor: new googleApi.maps.Point(22, 22),
                      }}
                    />
                  );
                })}
              </MovviMap>
            </div>
          </DSCardContent>
        </DSCard>

        <DSCard className="min-w-0">
          <DSCardHeader className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <DSCardTitle className="min-w-0 break-words text-base">Últimas solicitações</DSCardTitle>
            <Caption>tempo real</Caption>
          </DSCardHeader>
          <DSCardContent className="grid min-w-0 gap-3 p-3 md:grid-cols-2 2xl:grid-cols-3">
            {loading && recent.length === 0 ? <div aria-live="polite"><Loading label="Carregando…" /></div> : null}
            {!loading && recent.length === 0 ? (
              <EmptyState icon={Inbox} title="Sem corridas recentes" description="Novas solicitações aparecerão aqui em tempo real." />
            ) : null}
            {recent.map((ride) => {
              const status = mapRideStatus(ride.status);
              const created = validDate(ride.created_at);
              return (
                <div key={ride.id} className="min-w-0 rounded-lg border border-border/60 p-3">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <Typography variant="caption" className="min-w-0 break-words capitalize">
                      {ride.category}
                    </Typography>
                    {created ? <time className="shrink-0 text-xs text-muted-foreground" dateTime={created.toISOString()}>{formatDate(created.toISOString())}</time> : null}
                  </div>
                  <BodySmall className="mt-2 break-words font-medium text-foreground">{ride.origin_name}</BodySmall>
                  <BodySmall className="break-words text-muted-foreground">→ {ride.destination_name}</BodySmall>
                  <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <StatusPill status={status.key} label={status.label} pulse={false} />
                    <BodySmall className="break-words font-semibold">Estimado {formatBRL(safeMoney(ride.estimated_price))}</BodySmall>
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
    <DSCard className={`h-full min-h-[96px] transition motion-reduce:transition-none hover:border-primary/50 ${accent}`}>
      <DSCardContent className="flex h-full min-w-0 items-center gap-3 p-4">
        <div className="shrink-0 rounded-lg bg-background p-2" aria-hidden="true">
          <Icon as={IconCmp} size="md" className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <Label className="block whitespace-normal break-words">{label}</Label>
          <Metric className="block whitespace-normal break-words leading-tight tabular-nums">{loading ? "…" : value}</Metric>
        </div>
      </DSCardContent>
    </DSCard>
  );

  return to ? (
    <Link
      to={to}
      className="block h-full rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${label}: ${loading ? "carregando" : value}`}
    >
      {card}
    </Link>
  ) : (
    card
  );
}
