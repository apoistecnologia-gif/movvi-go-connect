import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, TrendingUp } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { downloadCsv } from "@/lib/csvExport";
import { DSBadge, DSButton, DSCard, DSCardContent, DSSelect, DSSelectContent, DSSelectItem, DSSelectTrigger, DSSelectValue } from "@/design-system";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics & BI — Admin MOVVI" }] }),
  component: AnalyticsPage,
});

type Preset = "today" | "yesterday" | "7d" | "30d" | "this_month" | "last_month" | "custom";

function rangeForPreset(p: Preset, custom?: { from: string; to: string }): { from: Date; to: Date; bucket: "hour"|"day"|"week"|"month" } {
  const now = new Date();
  const start = new Date(now); start.setHours(0,0,0,0);
  switch (p) {
    case "today": return { from: start, to: now, bucket: "hour" };
    case "yesterday": {
      const y = new Date(start); y.setDate(y.getDate()-1);
      return { from: y, to: start, bucket: "hour" };
    }
    case "7d": {
      const f = new Date(start); f.setDate(f.getDate()-6);
      return { from: f, to: now, bucket: "day" };
    }
    case "30d": {
      const f = new Date(start); f.setDate(f.getDate()-29);
      return { from: f, to: now, bucket: "day" };
    }
    case "this_month": {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: f, to: now, bucket: "day" };
    }
    case "last_month": {
      const f = new Date(now.getFullYear(), now.getMonth()-1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: f, to: t, bucket: "day" };
    }
    case "custom": {
      const f = custom?.from ? new Date(custom.from) : start;
      const t = custom?.to ? new Date(custom.to) : now;
      const days = (t.getTime() - f.getTime()) / 86400000;
      const bucket: "hour"|"day"|"week"|"month" = days <= 2 ? "hour" : days <= 60 ? "day" : days <= 365 ? "week" : "month";
      return { from: f, to: t, bucket };
    }
  }
}

type Overview = {
  drivers_registered: number; drivers_active: number; drivers_online: number;
  passengers_registered: number; passengers_active: number;
  rides_today: number; rides_week: number; rides_month: number;
  rides_completed: number; rides_cancelled: number; cancellation_rate: number;
  avg_eta_seconds: number; avg_ride_duration_min: number; avg_ride_distance_km: number;
  avg_passenger_rating: number; avg_driver_rating: number;
};
type Financial = {
  monthly_fee: number; subs_active: number; subs_overdue: number; subs_pending: number;
  revenue_today: number; revenue_this_month: number; mrr: number;
  expected_monthly_revenue: number; collection_rate: number;
};
type SeriesPoint = { bucket: string; total?: number; completed?: number; cancelled?: number; new_passengers?: number; new_drivers?: number; paid_count?: number; revenue?: number };
type NamedCount<T = number> = { name: string; value: T };
type TopDriverRow = { driver_id: string; name: string | null; city: string | null; value: number; rides_total: number; rating: number | null };
type TopPaxRow = { user_id: string; name: string | null; city: string | null; value: number; rides_total: number; rating: number | null };

const fmtBRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));
const fmtInt = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(Number(n || 0)));
const fmtDec = (n: number, d = 1) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n || 0));

function AnalyticsPage() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [financial, setFinancial] = useState<Financial | null>(null);
  const [ridesSeries, setRidesSeries] = useState<SeriesPoint[]>([]);
  const [usersSeries, setUsersSeries] = useState<SeriesPoint[]>([]);
  const [subsSeries, setSubsSeries] = useState<SeriesPoint[]>([]);
  const [topCities, setTopCities] = useState<NamedCount[]>([]);
  const [topOrigins, setTopOrigins] = useState<NamedCount[]>([]);
  const [topDestinations, setTopDestinations] = useState<NamedCount[]>([]);
  const [topDriversRides, setTopDriversRides] = useState<TopDriverRow[]>([]);
  const [topDriversRating, setTopDriversRating] = useState<TopDriverRow[]>([]);
  const [topDriversCancels, setTopDriversCancels] = useState<TopDriverRow[]>([]);
  const [expiredDrivers, setExpiredDrivers] = useState<TopDriverRow[]>([]);
  const [topPaxRides, setTopPaxRides] = useState<TopPaxRow[]>([]);
  const [topPaxRating, setTopPaxRating] = useState<TopPaxRow[]>([]);
  const [topPaxCancels, setTopPaxCancels] = useState<TopPaxRow[]>([]);
  const [newPax, setNewPax] = useState<TopPaxRow[]>([]);

  const range = useMemo(
    () => rangeForPreset(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const fromIso = range.from.toISOString();
      const toIso = range.to.toISOString();

      const [ov, fi, rs, us, ss, tc, to_, td, dr1, dr2, dr3, dr4, px1, px2, px3, px4] = await Promise.all([
        supabase.rpc("admin_analytics_overview" as never),
        supabase.rpc("admin_analytics_financial" as never),
        supabase.rpc("admin_analytics_rides_timeseries" as never, { _from: fromIso, _to: toIso, _bucket: range.bucket } as never),
        supabase.rpc("admin_analytics_new_users_timeseries" as never, { _from: fromIso, _to: toIso, _bucket: range.bucket } as never),
        supabase.rpc("admin_analytics_subscription_growth" as never, { _from: fromIso, _to: toIso, _bucket: range.bucket } as never),
        supabase.rpc("admin_analytics_top_cities" as never, { _limit: 10 } as never),
        supabase.rpc("admin_analytics_top_places" as never, { _kind: "origin", _limit: 10 } as never),
        supabase.rpc("admin_analytics_top_places" as never, { _kind: "destination", _limit: 10 } as never),
        supabase.rpc("admin_analytics_top_drivers" as never, { _kind: "rides", _limit: 15 } as never),
        supabase.rpc("admin_analytics_top_drivers" as never, { _kind: "rating", _limit: 15 } as never),
        supabase.rpc("admin_analytics_top_drivers" as never, { _kind: "cancellations", _limit: 15 } as never),
        supabase.rpc("admin_analytics_top_drivers" as never, { _kind: "expired", _limit: 15 } as never),
        supabase.rpc("admin_analytics_top_passengers" as never, { _kind: "rides", _limit: 15 } as never),
        supabase.rpc("admin_analytics_top_passengers" as never, { _kind: "rating", _limit: 15 } as never),
        supabase.rpc("admin_analytics_top_passengers" as never, { _kind: "cancellations", _limit: 15 } as never),
        supabase.rpc("admin_analytics_top_passengers" as never, { _kind: "new", _limit: 15 } as never),
      ]);
      if (cancelled) return;
      setOverview((ov.data as unknown as Overview) ?? null);
      setFinancial((fi.data as unknown as Financial) ?? null);
      setRidesSeries(((rs.data ?? []) as SeriesPoint[]));
      setUsersSeries(((us.data ?? []) as SeriesPoint[]));
      setSubsSeries(((ss.data ?? []) as SeriesPoint[]));
      setTopCities(((tc.data ?? []) as { city: string; rides: number }[]).map(r => ({ name: r.city, value: Number(r.rides) })));
      setTopOrigins(((to_.data ?? []) as { place: string; rides: number }[]).map(r => ({ name: r.place, value: Number(r.rides) })));
      setTopDestinations(((td.data ?? []) as { place: string; rides: number }[]).map(r => ({ name: r.place, value: Number(r.rides) })));
      setTopDriversRides(((dr1.data ?? []) as TopDriverRow[]));
      setTopDriversRating(((dr2.data ?? []) as TopDriverRow[]));
      setTopDriversCancels(((dr3.data ?? []) as TopDriverRow[]));
      setExpiredDrivers(((dr4.data ?? []) as TopDriverRow[]));
      setTopPaxRides(((px1.data ?? []) as TopPaxRow[]));
      setTopPaxRating(((px2.data ?? []) as TopPaxRow[]));
      setTopPaxCancels(((px3.data ?? []) as TopPaxRow[]));
      setNewPax(((px4.data ?? []) as TopPaxRow[]));
    }
    load();
    return () => { cancelled = true; };
  }, [range]);

  const ridesChart = useMemo(
    () => ridesSeries.map(s => ({
      label: formatBucket(s.bucket, range.bucket),
      total: Number(s.total ?? 0),
      completed: Number(s.completed ?? 0),
      cancelled: Number(s.cancelled ?? 0),
    })),
    [ridesSeries, range.bucket],
  );
  const usersChart = useMemo(
    () => usersSeries.map(s => ({
      label: formatBucket(s.bucket, range.bucket),
      passageiros: Number(s.new_passengers ?? 0),
      motoristas: Number(s.new_drivers ?? 0),
    })),
    [usersSeries, range.bucket],
  );
  const subsChart = useMemo(
    () => subsSeries.map(s => ({
      label: formatBucket(s.bucket, range.bucket),
      pagos: Number(s.paid_count ?? 0),
      receita: Number(s.revenue ?? 0),
    })),
    [subsSeries, range.bucket],
  );

  function exportOverviewCsv() {
    if (!overview) return;
    downloadCsv("movvi-kpis", [overview]);
  }
  function exportRidesCsv() {
    downloadCsv("movvi-rides-timeseries", ridesChart as unknown as Record<string, unknown>[]);
  }
  function exportFinancialCsv() {
    if (!financial) return;
    downloadCsv("movvi-financeiro", [financial]);
  }
  function exportTopDrivers(kind: "rides" | "rating" | "cancels") {
    const rows = kind === "rides" ? topDriversRides : kind === "rating" ? topDriversRating : topDriversCancels;
    downloadCsv(`movvi-motoristas-${kind}`, rows as unknown as Record<string, unknown>[]);
  }

  return (
    <AdminLayout
      title="Analytics & BI"
      description="Painel executivo e relatórios agregados"
      actions={
        <div className="flex items-center gap-2">
          <DSSelect value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <DSSelectTrigger className="h-9 w-40 text-xs"><DSSelectValue /></DSSelectTrigger>
            <DSSelectContent>
              <DSSelectItem value="today">Hoje</DSSelectItem>
              <DSSelectItem value="yesterday">Ontem</DSSelectItem>
              <DSSelectItem value="7d">Últimos 7 dias</DSSelectItem>
              <DSSelectItem value="30d">Últimos 30 dias</DSSelectItem>
              <DSSelectItem value="this_month">Este mês</DSSelectItem>
              <DSSelectItem value="last_month">Mês passado</DSSelectItem>
              <DSSelectItem value="custom">Personalizado</DSSelectItem>
            </DSSelectContent>
          </DSSelect>
          {preset === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2 text-xs" />
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2 text-xs" />
            </>
          )}
        </div>
      }
    >
      <Tabs defaultValue="executive" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
          <TabsTrigger value="executive">Executivo</TabsTrigger>
          <TabsTrigger value="financial">Financeiro</TabsTrigger>
          <TabsTrigger value="geo">Geografia</TabsTrigger>
          <TabsTrigger value="drivers">Motoristas</TabsTrigger>
          <TabsTrigger value="passengers">Passageiros</TabsTrigger>
        </TabsList>

        {/* Executive */}
        <TabsContent value="executive" className="space-y-4 mt-4">
          {overview && (
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
              <Kpi label="Motoristas cadastrados" value={fmtInt(overview.drivers_registered)} />
              <Kpi label="Motoristas ativos" value={fmtInt(overview.drivers_active)} tone="green" />
              <Kpi label="Motoristas online" value={fmtInt(overview.drivers_online)} tone="green" />
              <Kpi label="Passageiros cadastrados" value={fmtInt(overview.passengers_registered)} />
              <Kpi label="Passageiros ativos (30d)" value={fmtInt(overview.passengers_active)} tone="blue" />
              <Kpi label="Corridas hoje" value={fmtInt(overview.rides_today)} />
              <Kpi label="Corridas semana" value={fmtInt(overview.rides_week)} />
              <Kpi label="Corridas mês" value={fmtInt(overview.rides_month)} />
              <Kpi label="Corridas finalizadas" value={fmtInt(overview.rides_completed)} tone="green" />
              <Kpi label="Corridas canceladas" value={fmtInt(overview.rides_cancelled)} tone="red" />
              <Kpi label="Taxa cancelamento" value={`${fmtDec(overview.cancellation_rate, 2)}%`} tone="amber" />
              <Kpi label="ETA médio" value={`${fmtInt(overview.avg_eta_seconds)}s`} />
              <Kpi label="Duração média" value={`${fmtDec(overview.avg_ride_duration_min, 1)} min`} />
              <Kpi label="Distância média" value={`${fmtDec(overview.avg_ride_distance_km, 2)} km`} />
              <Kpi label="Avaliação passageiro" value={`★ ${fmtDec(overview.avg_passenger_rating, 2)}`} />
              <Kpi label="Avaliação motorista" value={`★ ${fmtDec(overview.avg_driver_rating, 2)}`} />
            </div>
          )}
          <div className="flex justify-end">
            <DSButton size="sm" variant="outline" onClick={exportOverviewCsv}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar KPIs
            </DSButton>
          </div>

          <ChartCard title="Corridas no período" onExport={exportRidesCsv}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ridesChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="completed" name="Finalizadas" fill="#22c55e" />
                <Bar dataKey="cancelled" name="Canceladas" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Novos usuários">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={usersChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Area type="monotone" dataKey="passageiros" stroke="#3b82f6" fill="#3b82f680" />
                <Area type="monotone" dataKey="motoristas" stroke="#8DD92B" fill="#8DD92B80" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </TabsContent>

        {/* Financial */}
        <TabsContent value="financial" className="space-y-4 mt-4">
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
            <TrendingUp className="inline h-4 w-4 text-primary mr-1" />
            <strong className="text-foreground">Receita MOVVI</strong> = apenas assinaturas de motoristas.
            Valores de corridas não fazem parte da receita da empresa.
          </div>

          {financial && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Kpi label="Mensalidade" value={fmtBRL(financial.monthly_fee)} />
              <Kpi label="MRR" value={fmtBRL(financial.mrr)} tone="green" />
              <Kpi label="Receita hoje" value={fmtBRL(financial.revenue_today)} tone="green" />
              <Kpi label="Receita este mês" value={fmtBRL(financial.revenue_this_month)} tone="green" />
              <Kpi label="Receita esperada" value={fmtBRL(financial.expected_monthly_revenue)} tone="blue" />
              <Kpi label="Assinaturas ativas" value={fmtInt(financial.subs_active)} />
              <Kpi label="Assinaturas vencidas" value={fmtInt(financial.subs_overdue)} tone="red" />
              <Kpi label="Taxa de cobrança" value={`${fmtDec(financial.collection_rate, 2)}%`} tone="amber" />
            </div>
          )}
          <div className="flex justify-end">
            <DSButton size="sm" variant="outline" onClick={exportFinancialCsv}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar financeiro
            </DSButton>
          </div>

          <ChartCard title="Crescimento de assinaturas (pagamentos)">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={subsChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="pagos" stroke="#8DD92B" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="receita" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </TabsContent>

        {/* Geo */}
        <TabsContent value="geo" className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <RankingCard title="Top cidades" rows={topCities} />
          <RankingCard title="Origens mais pedidas" rows={topOrigins} />
          <RankingCard title="Destinos mais pedidos" rows={topDestinations} />
        </TabsContent>

        {/* Drivers */}
        <TabsContent value="drivers" className="mt-4 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <DriverTable title="Mais corridas" rows={topDriversRides} valueLabel="Corridas" onExport={() => exportTopDrivers("rides")} />
            <DriverTable title="Melhor avaliação" rows={topDriversRating} valueLabel="Nota" onExport={() => exportTopDrivers("rating")} formatValue={(v) => `★ ${fmtDec(v, 2)}`} />
            <DriverTable title="Mais cancelamentos" rows={topDriversCancels} valueLabel="Cancel." onExport={() => exportTopDrivers("cancels")} />
            <DriverTable title="Assinatura vencida/bloqueada" rows={expiredDrivers} valueLabel="Dias vencidos" formatValue={(v) => `${Math.round(v)} d`} />
          </div>
        </TabsContent>

        {/* Passengers */}
        <TabsContent value="passengers" className="mt-4 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <PaxTable title="Mais ativos" rows={topPaxRides} valueLabel="Corridas" />
            <PaxTable title="Melhor avaliação" rows={topPaxRating} valueLabel="Nota" formatValue={(v) => `★ ${fmtDec(v, 2)}`} />
            <PaxTable title="Mais cancelamentos" rows={topPaxCancels} valueLabel="Cancel." />
            <PaxTable title="Novos passageiros" rows={newPax} valueLabel="Cadastrado há" formatValue={(v) => `${Math.round(v)} d`} />
          </div>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}

/* ─── Sub-components ─── */
const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

function Kpi({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "green" | "blue" | "amber" | "red" }) {
  const toneMap: Record<string, string> = {
    neutral: "text-foreground", green: "text-emerald-500",
    blue: "text-blue-500", amber: "text-amber-500", red: "text-destructive",
  };
  return (
    <DSCard className="border-border bg-card/60">
      <DSCardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
        <p className={`mt-1 text-lg font-bold truncate ${toneMap[tone]}`}>{value}</p>
      </DSCardContent>
    </DSCard>
  );
}

function ChartCard({ title, children, onExport }: { title: string; children: React.ReactNode; onExport?: () => void }) {
  return (
    <DSCard className="border-border bg-card/60">
      <DSCardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          {onExport && (
            <DSButton size="sm" variant="ghost" onClick={onExport} className="h-7 text-xs">
              <Download className="h-3 w-3 mr-1" /> CSV
            </DSButton>
          )}
        </div>
        {children}
      </DSCardContent>
    </DSCard>
  );
}

function RankingCard({ title, rows }: { title: string; rows: NamedCount[] }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <DSCard className="border-border bg-card/60">
      <DSCardContent className="p-4">
        <h3 className="text-sm font-semibold mb-3">{title}</h3>
        {rows.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className="text-xs">
              <div className="flex justify-between mb-1">
                <span className="truncate mr-2">{i + 1}. {r.name}</span>
                <span className="text-muted-foreground shrink-0">{fmtInt(r.value)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </DSCardContent>
    </DSCard>
  );
}

function DriverTable({ title, rows, valueLabel, onExport, formatValue }: {
  title: string; rows: TopDriverRow[]; valueLabel: string;
  onExport?: () => void; formatValue?: (v: number) => string;
}) {
  return (
    <DSCard className="border-border bg-card/60">
      <DSCardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {onExport && (
            <DSButton size="sm" variant="ghost" onClick={onExport} className="h-7 text-xs">
              <Download className="h-3 w-3 mr-1" /> CSV
            </DSButton>
          )}
        </div>
        {rows.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li key={r.driver_id} className="py-2 flex items-center justify-between text-xs gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate">{i + 1}. {r.name ?? "—"}</p>
                <p className="text-muted-foreground truncate">
                  {r.city ?? "—"} · {fmtInt(r.rides_total)} corridas · ★ {fmtDec(Number(r.rating ?? 0), 2)}
                </p>
              </div>
              <DSBadge className="shrink-0 font-mono text-[10px]">
                {formatValue ? formatValue(Number(r.value)) : fmtInt(Number(r.value))} {!formatValue && valueLabel}
              </DSBadge>
            </li>
          ))}
        </ul>
      </DSCardContent>
    </DSCard>
  );
}

function PaxTable({ title, rows, valueLabel, formatValue }: {
  title: string; rows: TopPaxRow[]; valueLabel: string; formatValue?: (v: number) => string;
}) {
  return (
    <DSCard className="border-border bg-card/60">
      <DSCardContent className="p-4">
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        {rows.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li key={r.user_id} className="py-2 flex items-center justify-between text-xs gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate">{i + 1}. {r.name ?? "—"}</p>
                <p className="text-muted-foreground truncate">
                  {r.city ?? "—"} · {fmtInt(r.rides_total)} corridas · ★ {fmtDec(Number(r.rating ?? 0), 2)}
                </p>
              </div>
              <DSBadge className="shrink-0 font-mono text-[10px]">
                {formatValue ? formatValue(Number(r.value)) : fmtInt(Number(r.value))} {!formatValue && valueLabel}
              </DSBadge>
            </li>
          ))}
        </ul>
      </DSCardContent>
    </DSCard>
  );
}

function formatBucket(iso: string, bucket: "hour"|"day"|"week"|"month") {
  const d = new Date(iso);
  if (bucket === "hour") return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (bucket === "month") return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
