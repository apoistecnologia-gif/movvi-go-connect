import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, BarChart3, RefreshCw, WalletCards } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { getAdminDashboardMetrics, type AdminDashboardMetrics } from "@/lib/adminControlPlane";
import { getAdminFinanceSummary, type AdminFinanceSummary } from "@/lib/adminFinance";
import { loadAdminAccess, type AdminAccessContext } from "@/lib/adminAccess";
import { supabase } from "@/integrations/supabase/client";
import { DSBadge, DSButton, DSCard, DSCardContent, EmptyState, Loading } from "@/design-system";

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

function safeCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

function safeCents(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

const money = (cents: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    safeCents(cents) / 100,
  );

function normalizeLabel(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function humanizeStatus(status: string) {
  const labels: Record<string, string> = {
    finalizada: "Finalizada",
    motorista_a_caminho: "Motorista a caminho",
    motorista_chegou: "Motorista chegou",
    em_viagem: "Em viagem",
    procurando_motorista: "Procurando motorista",
    solicitada: "Solicitada",
    cancelada_passageiro: "Cancelada pelo passageiro",
    cancelada_motorista: "Cancelada pelo motorista",
    cancelada_admin: "Cancelada pelo admin",
    expired: "Expirada",
  };
  return labels[status] ?? status.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
}

function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [access, setAccess] = useState<AdminAccessContext | null>(null);
  const [dashboard, setDashboard] = useState<AdminDashboardMetrics | null>(null);
  const [finance, setFinance] = useState<AdminFinanceSummary | null>(null);
  const [rides, setRides] = useState<RideSlice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const range = useMemo(() => periodRange(period), [period]);
  const canReadFinance = Boolean(access?.permissions.includes("finance.read"));

  async function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const nextAccess = access ?? (await loadAdminAccess());
      if (requestId !== requestRef.current) return;
      setAccess(nextAccess);
      if (!nextAccess?.permissions.includes("metrics.read")) {
        throw new Error("metrics_forbidden");
      }

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
      if (requestId !== requestRef.current) return;
      if (rideResult.error) throw rideResult.error;

      const safeRides = (rideResult.data ?? [])
        .map((ride) => ({
          category: normalizeLabel(ride.category, "Sem categoria"),
          status: normalizeLabel(ride.status, "desconhecido"),
          created_at: normalizeLabel(ride.created_at, ""),
        }))
        .filter((ride) => ride.created_at.length > 0);

      setDashboard(dashboardData);
      setFinance(financeData);
      setRides(safeRides);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setDashboard(null);
      setFinance(null);
      setRides([]);
      const forbidden = error instanceof Error && error.message === "metrics_forbidden";
      setLoadError(
        forbidden
          ? "Sua função administrativa não possui permissão para consultar Analytics."
          : "Não foi possível carregar os indicadores agora. Tente novamente.",
      );
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar Analytics", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => {
      requestRef.current += 1;
    };
    // `range` is derived from `period`; `access` is intentionally reused without retriggering the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const completionRate = rides.length ? Math.min(100, Math.max(0, (completed / rides.length) * 100)) : 0;
  const cancellationRate = rides.length ? Math.min(100, Math.max(0, (cancelled / rides.length) * 100)) : 0;

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
          className="min-h-11 gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-busy={loading}
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
            aria-hidden="true"
          />
          Atualizar
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="p-4 text-sm leading-6 text-muted-foreground">
          Analytics legado baseado em RPCs paralelos de MRR, assinaturas e receita foi removido.
          Métricas financeiras detalhadas só aparecem para funções autorizadas e usam settlements
          canônicos.
        </DSCardContent>
      </DSCard>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Período dos indicadores">
        {(["today", "7d", "30d", "month"] as Period[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
            aria-pressed={period === value}
            className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${period === value ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
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
        <div aria-live="polite">
          <Loading label="Calculando indicadores..." />
        </div>
      ) : loadError || !dashboard ? (
        <div className="space-y-3" role="alert">
          <EmptyState
            icon={BarChart3}
            title="Analytics indisponível"
            description={loadError ?? "Não foi possível consultar as métricas canônicas."}
          />
          <div className="flex justify-center">
            <DSButton variant="outline" onClick={() => void load()} className="min-h-11">
              Tentar novamente
            </DSButton>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Motoristas" value={String(safeCount(dashboard.drivers.total))} />
            <Metric label="Motoristas online" value={String(safeCount(dashboard.drivers.online))} />
            <Metric label="Passageiros" value={String(safeCount(dashboard.passengers.total))} />
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
            <p className="mt-3 text-sm leading-5 text-muted-foreground">
              Indicadores financeiros detalhados foram ocultados porque sua função não possui essa
              permissão.
            </p>
          )}

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Breakdown icon={Activity} title="Corridas por status" rows={byStatus} kind="status" />
            <Breakdown icon={WalletCards} title="Corridas por categoria" rows={byCategory} kind="category" />
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
      <DSCardContent className="min-w-0 p-4">
        <p className="break-words text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-xl font-bold tabular-nums">{value}</p>
      </DSCardContent>
    </DSCard>
  );
}

function Breakdown({
  icon: Icon,
  title,
  rows,
  kind,
}: {
  icon: typeof Activity;
  title: string;
  rows: Array<[string, number]>;
  kind: "status" | "category";
}) {
  return (
    <DSCard>
      <DSCardContent className="space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 break-words">{title}</span>
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados no período.</p>
        ) : (
          rows.map(([label, value]) => (
            <div
              key={label}
              className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
            >
              <span className="min-w-0 break-words">
                {kind === "status" ? humanizeStatus(label) : normalizeLabel(label, "Sem categoria")}
              </span>
              <DSBadge variant="muted">{safeCount(value)}</DSBadge>
            </div>
          ))
        )}
      </DSCardContent>
    </DSCard>
  );
}
