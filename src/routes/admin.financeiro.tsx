import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Download,
  TrendingUp,
  Wallet,
  CreditCard,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Info,
  Clock,
  FileText,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { DSButton as Button, DSCard as Card, DSCardContent as CardContent, DSCardHeader as CardHeader, DSCardTitle as CardTitle, DSInput, EmptyState, Loading, StatusPill } from "@/design-system";
// Badge legacy substituído por StatusPill do design system.
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatBRL } from "@/lib/formatters";
import { downloadCsv } from "@/lib/csvExport";
import { toast } from "sonner";
import { adminRefreshAsaasPayment } from "@/lib/payments/adminReconcile.functions";
import { APOIS_MONTHLY_FEE_BRL } from "@/lib/payments/types";

export const Route = createFileRoute("/admin/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Admin APOIS" }] }),
  component: AdminFinanceiroPage,
});

type SubRow = {
  id: string;
  driver_id: string;
  status: string;
  amount: number | null;
  period_start: string | null;
  period_end: string | null;
  payment_method: string | null;
  provider_reference: string | null;
  asaas_payment_id: string | null;
  invoice_url: string | null;
  paid_at: string | null;
  created_at: string;
};

type DriverMini = {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  photo_url: string | null;
  selfie_url: string | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
};

type RideRow = {
  final_price: number | null;
  status: string;
  completed_at: string | null;
  created_at: string;
};

type Preset = "hoje" | "ontem" | "7d" | "30d" | "mes" | "mes_passado" | "custom";

function rangeFor(preset: Preset, fromCustom?: string, toCustom?: string) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (preset === "hoje") return { from: start, to: end };
  if (preset === "ontem") {
    const s = new Date(start);
    s.setDate(s.getDate() - 1);
    const e = new Date(end);
    e.setDate(e.getDate() - 1);
    return { from: s, to: e };
  }
  if (preset === "7d") {
    const s = new Date(start);
    s.setDate(s.getDate() - 6);
    return { from: s, to: end };
  }
  if (preset === "30d") {
    const s = new Date(start);
    s.setDate(s.getDate() - 29);
    return { from: s, to: end };
  }
  if (preset === "mes") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: s, to: end };
  }
  if (preset === "mes_passado") {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from: s, to: e };
  }
  const s = fromCustom ? new Date(fromCustom) : start;
  const e = toCustom ? new Date(toCustom + "T23:59:59") : end;
  return { from: s, to: e };
}

function StatusBadge({ status }: { status: string }) {
  type PillStatus = "online" | "searching" | "cancelled" | "offline" | "finished";
  const map: Record<string, { label: string; status: PillStatus }> = {
    ativa: { label: "Ativa", status: "online" },
    active: { label: "Ativa", status: "online" },
    pending: { label: "Pendente", status: "searching" },
    pendente: { label: "Pendente", status: "searching" },
    vencida: { label: "Vencida", status: "cancelled" },
    overdue: { label: "Vencida", status: "cancelled" },
    expirada: { label: "Expirada", status: "cancelled" },
    cancelada: { label: "Cancelada", status: "offline" },
    suspensa: { label: "Suspensa", status: "cancelled" },
    bloqueada: { label: "Bloqueada", status: "cancelled" },
  };
  const it = map[status] ?? { label: status, status: "offline" as PillStatus };
  return <StatusPill status={it.status} label={it.label} pulse={false} />;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return "—";
  }
}
function daysOverdue(nextDue: string | null | undefined) {
  if (!nextDue) return 0;
  const diff = Date.now() - new Date(nextDue).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function AdminFinanceiroPage() {
  const [rides, setRides] = useState<RideRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [drivers, setDrivers] = useState<DriverMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<Preset>("mes");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const refreshAsaas = useServerFn(adminRefreshAsaasPayment);

  const range = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const load = async () => {
    setLoading(true);
    const yearAgo = new Date();
    yearAgo.setDate(yearAgo.getDate() - 365);
    const [r, s, d] = await Promise.all([
      supabase
        .from("rides")
        .select("final_price,status,completed_at,created_at")
        .gte("created_at", yearAgo.toISOString())
        .limit(5000),
      supabase
        .from("subscriptions")
        .select(
          "id,driver_id,status,amount,period_start,period_end,payment_method,provider_reference,asaas_payment_id,invoice_url,paid_at,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("drivers")
        .select(
          "id,user_id,name,phone,photo_url,selfie_url,subscription_status,subscription_expires_at",
        )
        .limit(2000),
    ]);
    setRides((r.data ?? []) as RideRow[]);
    setSubs((s.data ?? []) as SubRow[]);
    setDrivers((d.data ?? []) as DriverMini[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const driverById = useMemo(() => {
    const m = new Map<string, DriverMini>();
    for (const dr of drivers) m.set(dr.id, dr);
    return m;
  }, [drivers]);

  const kpis = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const paidSubs = subs.filter((x) => x.status === "ativa" && x.paid_at);
    const revenueToday = paidSubs
      .filter((x) => new Date(x.paid_at ?? x.created_at) >= startToday)
      .reduce((a, b) => a + (b.amount ?? 0), 0);
    const revenueMonth = paidSubs
      .filter((x) => new Date(x.paid_at ?? x.created_at) >= startMonth)
      .reduce((a, b) => a + (b.amount ?? 0), 0);

    const activeSubs = subs.filter((x) => x.status === "ativa").length;
    const overdueSubs = subs.filter((x) => x.status === "vencida" || x.status === "expirada").length;
    const pendingSubs = subs.filter((x) => x.status === "pending" || x.status === "pendente").length;

    // Forecast = active subs that renew this month × monthly fee (approx)
    const revenueForecastMonth =
      subs.filter(
        (x) =>
          x.status === "ativa" &&
          x.period_end &&
          new Date(x.period_end) >= startMonth &&
          new Date(x.period_end) <= endMonth,
      ).length * APOIS_MONTHLY_FEE_BRL + revenueMonth;

    const delinquentDrivers = drivers.filter(
      (d) =>
        d.subscription_status === "vencida" ||
        d.subscription_status === "expired" ||
        d.subscription_status === "overdue" ||
        d.subscription_status === "expirada",
    ).length;

    // Informational — ride totals (belong to drivers, NOT APOIS revenue)
    const finalized = rides.filter((r) => r.status === "finalizada" && r.final_price);
    const rideToday = finalized
      .filter((r) => new Date(r.completed_at ?? r.created_at) >= startToday)
      .reduce((a, b) => a + (b.final_price ?? 0), 0);
    const rideMonth = finalized
      .filter((r) => new Date(r.completed_at ?? r.created_at) >= startMonth)
      .reduce((a, b) => a + (b.final_price ?? 0), 0);
    const rideAvgTicket = finalized.length
      ? finalized.reduce((a, b) => a + (b.final_price ?? 0), 0) / finalized.length
      : 0;

    return {
      revenueToday,
      revenueMonth,
      revenueForecastMonth,
      activeSubs,
      overdueSubs,
      pendingSubs,
      delinquentDrivers,
      rideToday,
      rideMonth,
      rideAvgTicket,
    };
  }, [subs, drivers, rides]);

  const subsInRange = useMemo(
    () =>
      subs.filter((x) => {
        const t = new Date(x.paid_at ?? x.created_at).getTime();
        return t >= range.from.getTime() && t <= range.to.getTime();
      }),
    [subs, range],
  );

  const delinquents = useMemo(() => {
    return drivers
      .filter((d) =>
        ["vencida", "expired", "overdue", "expirada"].includes(d.subscription_status ?? ""),
      )
      .map((d) => {
        const lastPaid = subs
          .filter((s) => s.driver_id === d.id && s.paid_at)
          .sort((a, b) => (a.paid_at! < b.paid_at! ? 1 : -1))[0];
        return {
          driver: d,
          lastPaidAt: lastPaid?.paid_at ?? null,
          overdueDays: daysOverdue(d.subscription_expires_at),
        };
      })
      .sort((a, b) => b.overdueDays - a.overdueDays);
  }, [drivers, subs]);

  async function handleRefresh(subscriptionId: string) {
    setRefreshingId(subscriptionId);
    try {
      const res = await refreshAsaas({ data: { subscriptionId } });
      if (!res.ok) {
        toast.warning(res.message);
      } else {
        toast.success(
          `Status Asaas: ${res.providerStatus ?? "—"}${res.localStatus ? ` → ${res.localStatus}` : ""}`,
        );
        await load();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao consultar Asaas.";
      toast.error(msg);
    } finally {
      setRefreshingId(null);
    }
  }

  function exportSubsCsv() {
    downloadCsv(
      `financeiro-assinaturas-${new Date().toISOString().slice(0, 10)}`,
      subsInRange.map((s) => {
        const dr = driverById.get(s.driver_id);
        return {
          data: fmtDateTime(s.paid_at ?? s.created_at),
          motorista: dr?.name ?? "—",
          telefone: dr?.phone ?? "",
          valor: (s.amount ?? 0).toFixed(2),
          status: s.status,
          metodo: s.payment_method ?? "",
          provedor: "asaas",
          provider_payment_id: s.asaas_payment_id ?? s.provider_reference ?? "",
          invoice_url: s.invoice_url ?? "",
          periodo_inicio: fmtDate(s.period_start),
          periodo_fim: fmtDate(s.period_end),
          paid_at: fmtDateTime(s.paid_at),
        };
      }),
    );
  }

  if (loading) {
    return (
      <AdminLayout title="Financeiro">
        <Loading label="Carregando dados financeiros..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Financeiro"
      description="Receita APOIS (assinaturas) e visibilidade financeira operacional"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportSubsCsv} className="gap-1">
            <Download className="h-4 w-4" /> CSV
          </Button>
        </>
      }
    >
      {/* Filters */}
      <Card className="mb-4 border-border bg-card/60">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          {(
            [
              ["hoje", "Hoje"],
              ["ontem", "Ontem"],
              ["7d", "7 dias"],
              ["30d", "30 dias"],
              ["mes", "Este mês"],
              ["mes_passado", "Mês passado"],
              ["custom", "Personalizado"],
            ] as [Preset, string][]
          ).map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant={preset === id ? "default" : "outline"}
              onClick={() => setPreset(id)}
            >
              {label}
            </Button>
          ))}
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <DSInput
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 w-[140px]"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <DSInput
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 w-[140px]"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* APOIS revenue KPIs */}
      <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        Receita real APOIS (assinaturas)
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Hoje" value={formatBRL(kpis.revenueToday)} accent />
        <Kpi icon={<Wallet className="h-4 w-4" />} label="Este mês" value={formatBRL(kpis.revenueMonth)} accent />
        <Kpi icon={<Clock className="h-4 w-4" />} label="Previsto do mês" value={formatBRL(kpis.revenueForecastMonth)} />
        <Kpi icon={<CreditCard className="h-4 w-4" />} label="Assinaturas ativas" value={String(kpis.activeSubs)} />
        <Kpi icon={<AlertCircle className="h-4 w-4" />} label="Assin. vencidas" value={String(kpis.overdueSubs)} />
        <Kpi icon={<AlertCircle className="h-4 w-4" />} label="Assin. pendentes" value={String(kpis.pendingSubs)} />
        <Kpi icon={<AlertCircle className="h-4 w-4" />} label="Motoristas inadimplentes" value={String(kpis.delinquentDrivers)} />
      </div>

      {/* Informational — ride values (NOT APOIS revenue) */}
      <div className="mt-6 rounded-xl border border-dashed border-border bg-card/30 p-3">
        <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Info className="h-3.5 w-3.5" /> Informativo — Valores das corridas (pagos direto ao motorista)
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Corridas hoje" value={formatBRL(kpis.rideToday)} muted />
          <Kpi icon={<Wallet className="h-4 w-4" />} label="Corridas no mês" value={formatBRL(kpis.rideMonth)} muted />
          <Kpi icon={<Wallet className="h-4 w-4" />} label="Ticket médio" value={formatBRL(kpis.rideAvgTicket)} muted />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          APOIS não recebe pagamentos de corridas. Estes valores são exibidos apenas para
          acompanhamento operacional.
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="assinaturas" className="mt-6">
        <TabsList>
          <TabsTrigger value="assinaturas">Assinaturas</TabsTrigger>
          <TabsTrigger value="inadimplentes">Inadimplentes ({delinquents.length})</TabsTrigger>
          <TabsTrigger value="reconciliacao">Reconciliação Asaas</TabsTrigger>
          <TabsTrigger value="historico">Histórico de pagamentos</TabsTrigger>
        </TabsList>

        {/* Assinaturas */}
        <TabsContent value="assinaturas" className="mt-3">
          <Card className="border-border bg-card/60">
            <CardHeader>
              <CardTitle className="text-base">Assinaturas no período</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Motorista</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Valor</th>
                    <th className="px-3 py-2">Método</th>
                    <th className="px-3 py-2">Último pgto</th>
                    <th className="px-3 py-2">Próx. venc.</th>
                    <th className="px-3 py-2">Asaas ID</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {subsInRange.map((s) => {
                    const dr = driverById.get(s.driver_id);
                    return (
                      <tr key={s.id} className="border-t border-border/60">
                        <td className="px-3 py-2">{dr?.name ?? "—"}</td>
                        <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                        <td className="px-3 py-2">{formatBRL(s.amount ?? 0)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.payment_method ?? "—"}</td>
                        <td className="px-3 py-2">{fmtDateTime(s.paid_at)}</td>
                        <td className="px-3 py-2">{fmtDate(s.period_end)}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                          {s.asaas_payment_id ?? s.provider_reference ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {s.invoice_url && (
                            <a
                              href={s.invoice_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" /> Fatura
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {subsInRange.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                        Nenhuma assinatura no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inadimplentes */}
        <TabsContent value="inadimplentes" className="mt-3">
          <Card className="border-border bg-card/60">
            <CardHeader>
              <CardTitle className="text-base">Motoristas inadimplentes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3">
              {delinquents.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum motorista inadimplente. 🎉
                </p>
              )}
              {delinquents.map(({ driver, lastPaidAt, overdueDays }) => (
                <div
                  key={driver.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/40 p-3"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={driver.photo_url ?? driver.selfie_url ?? undefined} />
                    <AvatarFallback>{(driver.name ?? "?").slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{driver.name ?? "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {driver.phone ?? "sem telefone"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end text-right text-xs">
                    <StatusBadge status={driver.subscription_status ?? "vencida"} />
                    <span className="mt-1 text-red-400">{overdueDays} dias em atraso</span>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>Últ. pgto: {fmtDate(lastPaidAt)}</div>
                    <div>Próx. venc.: {fmtDate(driver.subscription_expires_at)}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/admin/assinaturas" search={{ u: driver.user_id } as never}>
                        Assinatura
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/admin/motoristas" search={{ u: driver.user_id } as never}>
                        Perfil
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reconciliação */}
        <TabsContent value="reconciliacao" className="mt-3">
          <Card className="border-border bg-card/60">
            <CardHeader>
              <CardTitle className="text-base">Reconciliação com Asaas</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Motorista</th>
                    <th className="px-3 py-2">Status local</th>
                    <th className="px-3 py-2">Asaas ID</th>
                    <th className="px-3 py-2">Valor</th>
                    <th className="px-3 py-2">Pago em</th>
                    <th className="px-3 py-2">Fatura</th>
                    <th className="px-3 py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {subs
                    .filter((s) => s.asaas_payment_id || s.provider_reference)
                    .slice(0, 200)
                    .map((s) => {
                      const dr = driverById.get(s.driver_id);
                      return (
                        <tr key={s.id} className="border-t border-border/60">
                          <td className="px-3 py-2">{dr?.name ?? "—"}</td>
                          <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                          <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                            {s.asaas_payment_id ?? s.provider_reference}
                          </td>
                          <td className="px-3 py-2">{formatBRL(s.amount ?? 0)}</td>
                          <td className="px-3 py-2">{fmtDateTime(s.paid_at)}</td>
                          <td className="px-3 py-2">
                            {s.invoice_url ? (
                              <a
                                href={s.invoice_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <ExternalLink className="h-3.5 w-3.5" /> Abrir
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={refreshingId === s.id}
                              onClick={() => void handleRefresh(s.id)}
                              className="gap-1"
                            >
                              {refreshingId === s.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                              Verificar status
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Histórico */}
        <TabsContent value="historico" className="mt-3">
          <Card className="border-border bg-card/60">
            <CardHeader>
              <CardTitle className="text-base">Histórico de pagamentos (assinaturas)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Motorista</th>
                    <th className="px-3 py-2">Valor</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Método</th>
                    <th className="px-3 py-2">Provedor</th>
                    <th className="px-3 py-2">Provider ID</th>
                    <th className="px-3 py-2">Fatura</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.slice(0, 500).map((s) => {
                    const dr = driverById.get(s.driver_id);
                    return (
                      <tr key={s.id} className="border-t border-border/60">
                        <td className="px-3 py-2">{fmtDateTime(s.paid_at ?? s.created_at)}</td>
                        <td className="px-3 py-2">{dr?.name ?? "—"}</td>
                        <td className="px-3 py-2">{formatBRL(s.amount ?? 0)}</td>
                        <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                        <td className="px-3 py-2 text-muted-foreground">{s.payment_method ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">asaas</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                          {s.asaas_payment_id ?? s.provider_reference ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {s.invoice_url ? (
                            <a
                              href={s.invoice_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" /> Abrir
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}

function Kpi({
  icon,
  label,
  value,
  accent,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <Card
      className={`border-border ${accent ? "bg-primary/10" : muted ? "bg-card/30" : "bg-card/60"}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          {icon} {label}
        </div>
        <p className={`mt-2 text-xl font-bold ${muted ? "text-muted-foreground" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
