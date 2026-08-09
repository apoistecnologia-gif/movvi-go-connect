import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, RefreshCw, WalletCards } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { getAdminDashboardMetrics, type AdminDashboardMetrics } from "@/lib/adminControlPlane";
import { getAdminFinanceSummary, type AdminFinanceSummary } from "@/lib/adminFinance";
import { loadAdminAccess, type AdminAccessContext } from "@/lib/adminAccess";
import { supabase } from "@/integrations/supabase/client";
import { DSBadge, DSButton, DSCard, DSCardContent, EmptyState, Loading } from "@/design-system";
import { toast } from "sonner";

type RideSlice = { category: string; status: string; created_at: string };
type Period = "today" | "7d" | "30d" | "month";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Admin APOIS" }] }),
  component: AdminAnalyticsPage,
});

function periodRange(period: Period) {
  const to = new Date();
  const from = new Date(to);
  if (period === "today") from.setHours(0, 0, 0, 0);
  if (period === "7d") from.setDate(from.getDate() - 6);
  if (period === "30d") from.setDate(from.getDate() - 29);
  if (period === "month") {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(cents || 0) / 100,
  );

function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [access, setAccess] = useState<AdminAccessContext | null>(null);
  const [dashboard, setDashboard] = useState<AdminDashboardMetrics | null>(null);
  const [finance, setFinance] = useState<AdminFinanceSummary | null>(null);
  const [rides, setRides] = useState<RideSlice[]>([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => periodRange(period), [period]);
  const canReadFinance = Boolean(access?.permissions.includes("finance.read"));

  async function load() {
    setLoading(true);
    try {
      const nextAccess = access ?? (await loadAdminAccess());
      setAccess(nextAccess);
      if (!nextAccess?.permissions.includes("metrics.read")) throw new Error("forbidden");

      const dashboardPromise = getAdminDashboardMetrics();
      const ridesPromise = nextAccess.permissions.includes("rides.read")
        ? supabase
            .from("rides")
            .select("category,status,created_at")
            .gte("created_at", range.from.toISOString())
            .lte("created_at", range.to.toISOString())
            .order("created_at", { ascending: false })
            .limit(5000)
        : Promise.resolve({ data: [], error: null });
      const financePromise = nextAccess.permissions.includes("finance.read")
        ? getAdminFinanceSummary(range.from, range.to)
        : Promise.resolve(null);

      const [dashboardData, financeData, rideResult] = await Promise.all([
        dashboardPromise,
        financePromise,
        ridesPromise,
      ]);
      if (rideResult.error) throw rideResult.error;
      setDashboard(dashboardData);
      setFinance(financeData);
      setRides((rideResult.data ?? []) as RideSlice[]);
    } catch (error) {
      setDashboard(null);
      setFinance(null);
      setRides([]);
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar Analytics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [period]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const ride of rides) map.set(ride.status, (map.get(ride.status) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rides]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const ride of rides) map.set(ride.category, (map.get(ride.category) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rides]);

  const completed = rides.filter((ride) => ride.status === "finalizada").length;
  const cancelled = rides.filter(
    (ride) => ride.status.startsWith("cancelada") || ride.status === "expired",
  ).length;
  const completionRate = rides.length ? (completed / rides.length) * 100 : 0;
  const cancellationRate = rides.length ? (cancelled / rides.length) * 100 : 0;

  return (
    <AdminLayout
      title="Analytics & BI"
      description="Indicadores derivados apenas de métricas, corridas e settlements canônicos"
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
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="p-4 text-sm text-muted-foreground">
          Analytics legado baseado em RPCs paralelos de MRR, assinaturas e receita foi removido.
          Métricas financeiras detalhadas só aparecem para funções com <strong>finance.read</strong>{" "}
          e usam settlements canônicos.
        </DSCardContent>
      </DSCard>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["today", "7d", "30d", "month"] as Period[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
            className={`rounded-full border px-3 py-1 text-xs ${period === value ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
          >
            {value === "today"
              ? "Hoje"
              : value === "7d"
                ? "7 dias"
                : value === "30d"
                  ? "30 dias"
                  : "Este mês"}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading label="Calculando indicadores..." />
      ) : !dashboard ? (
        <EmptyState
          icon={BarChart3}
          title="Analytics indisponível"
          description="A função administrativa atual não conseguiu consultar as métricas canônicas."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Motoristas" value={String(dashboard.drivers.total)} />
            <Metric label="Motoristas online" value={String(dashboard.drivers.online)} />
            <Metric label="Passageiros" value={String(dashboard.passengers.total)} />
            <Metric label="Corridas no período" value={String(rides.length)} />
            <Metric label="Taxa de conclusão" value={`${completionRate.toFixed(1)}%`} />
            <Metric label="Taxa de cancelamento" value={`${cancellationRate.toFixed(1)}%`} />
            {canReadFinance && finance && (
              <>
                <Metric label="GMV liquidado" value={money(finance.settlements.gmv_cents)} />
                <Metric
                  label="Receita APOIS"
                  value={money(finance.settlements.platform_revenue_cents)}
                  emphasis
                />
                <Metric
                  label="Ganhos motoristas"
                  value={money(finance.settlements.driver_earnings_cents)}
                />
                <Metric
                  label="Taxas de provedor"
                  value={money(finance.settlements.provider_fees_cents)}
                />
                <Metric label="Estornos" value={money(finance.settlements.refunds_cents)} />
                <Metric label="Saques pendentes" value={money(finance.withdrawals.pending_cents)} />
              </>
            )}
          </div>

          {!canReadFinance && (
            <p className="mt-3 text-xs text-muted-foreground">
              Indicadores financeiros detalhados foram ocultados porque sua função não possui
              finance.read.
            </p>
          )}

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Breakdown icon={Activity} title="Corridas por status" rows={byStatus} />
            <Breakdown icon={WalletCards} title="Corridas por categoria" rows={byCategory} />
          </div>
        </>
      )}
    </AdminLayout>
  );
}

function Metric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <DSCard className={emphasis ? "border-primary/30 bg-primary/5" : undefined}>
      <DSCardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold">{value}</p>
      </DSCardContent>
    </DSCard>
  );
}

function Breakdown({
  icon: Icon,
  title,
  rows,
}: {
  icon: typeof Activity;
  title: string;
  rows: Array<[string, number]>;
}) {
  return (
    <DSCard>
      <DSCardContent className="space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados no período.</p>
        ) : (
          rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
            >
              <span>{label}</span>
              <DSBadge variant="muted">{value}</DSBadge>
            </div>
          ))
        )}
      </DSCardContent>
    </DSCard>
  );
}
