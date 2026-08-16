import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Loader2,
  RefreshCw,
  Route as RouteIcon,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { ApoisDriverBottomNav } from "@/components/ApoisDriverBottomNav";
import {
  loadDriverFinancialDashboard,
  requestDriverWithdrawal,
  type DriverFinancialDashboard,
} from "@/lib/driverFinance.mobile";
import { loadDriverProfile } from "@/lib/driverProfile";

export const Route = createFileRoute("/motorista/ganhos")({
  head: () => ({ meta: [{ title: "Financeiro — APOIS Motorista" }] }),
  component: DriverEarningsPage,
});

type Filter = "today" | "week" | "month" | "custom";

function cents(value: number): string {
  return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function startOf(filter: Exclude<Filter, "custom">): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (filter === "week") date.setDate(date.getDate() - 6);
  if (filter === "month") date.setDate(1);
  return date;
}

function endOfToday(): Date {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function period(filter: Filter, customFrom: string, customTo: string): [Date, Date] {
  if (filter !== "custom") return [startOf(filter), endOfToday()];
  const from = customFrom ? new Date(`${customFrom}T00:00:00`) : startOf("today");
  const to = customTo ? new Date(`${customTo}T23:59:59`) : endOfToday();
  return [from, to];
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
    : "—";
}

function paymentLabel(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "cash") return "Dinheiro";
  if (normalized === "wallet") return "Carteira APOIS";
  if (normalized === "pix") return "PIX";
  if (normalized.includes("credit")) return "Crédito";
  if (normalized.includes("debit")) return "Débito";
  return "Pagamento registrado";
}

function settlementLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (["settled", "paid", "confirmed", "completed"].includes(normalized)) return "Liquidado";
  if (["pending", "processing", "created"].includes(normalized)) return "Em processamento";
  if (["refunded", "reversed"].includes(normalized)) return "Estornado";
  if (["failed", "cancelled", "canceled"].includes(normalized)) return "Não concluído";
  return "Registrado";
}

function withdrawalLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "paid") return "Pago";
  if (normalized === "processing") return "Processando";
  if (normalized === "pending") return "Pendente";
  if (normalized === "failed") return "Falhou / estornado";
  if (["cancelled", "canceled"].includes(normalized)) return "Cancelado";
  return "Registrado";
}

function DriverEarningsPage() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DriverFinancialDashboard | null>(null);
  const [filter, setFilter] = useState<Filter>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => period(filter, customFrom, customTo), [filter, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await loadDriverProfile();
      if (!profile.ok) {
        await navigate({ to: profile.reason === "no_session" ? "/motorista/login" : "/motorista/status", replace: true });
        return;
      }
      setDashboard(await loadDriverFinancialDashboard(range[0], range[1]));
    } catch (caughtError: unknown) {
      console.error("[APOIS Driver Finance] load failed", caughtError);
      setError("Não foi possível carregar o financeiro agora.");
    } finally {
      setLoading(false);
    }
  }, [navigate, range]);

  useEffect(() => { void load(); }, [load]);

  const submitWithdrawal = async (): Promise<void> => {
    if (!dashboard?.payoutEnabled || withdrawing) return;
    const parsed = Number(withdrawalAmount.replace(",", "."));
    const amountCents = Math.round(parsed * 100);
    if (!Number.isFinite(parsed) || amountCents <= 0) {
      toast.error("Informe um valor de saque válido.");
      return;
    }
    if (amountCents > dashboard.wallet.availableBalanceCents) {
      toast.error("Saldo disponível insuficiente.");
      return;
    }

    setWithdrawing(true);
    try {
      await requestDriverWithdrawal(amountCents);
      setWithdrawalAmount("");
      toast.success("Saque solicitado. O valor foi reservado até o processamento.");
      await load();
    } catch (caughtError: unknown) {
      toast.error(caughtError instanceof Error ? caughtError.message : "Não foi possível solicitar o saque.");
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="min-h-[100dvh] min-w-0 bg-[#050607] text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#08090A]/95 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl min-w-0 items-center gap-3">
          <button type="button" aria-label="Voltar" onClick={() => void navigate({ to: "/motorista/app" })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-[#111315]"><ArrowLeft className="h-5 w-5" aria-hidden="true" /></button>
          <div className="min-w-0 flex-1"><p className="break-words text-[10px] font-black uppercase tracking-[0.16em] text-[#F6BE1C] sm:tracking-[0.2em]">Carteira e corridas</p><h1 className="break-words text-xl font-black">Financeiro</h1></div>
          <button type="button" aria-label={loading ? "Atualizando financeiro" : "Atualizar financeiro"} aria-busy={loading} disabled={loading} onClick={() => void load()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-[#111315] text-[#F6BE1C] disabled:opacity-50"><RefreshCw aria-hidden="true" className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl min-w-0 space-y-5 px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+112px)]">
        {error ? <section role="alert" aria-live="assertive" className="break-words rounded-2xl border border-red-500/20 bg-red-500/8 p-4 text-xs font-bold leading-5 text-red-300">{error}</section> : null}

        {loading && !dashboard ? (
          <div className="flex min-h-[55vh] items-center justify-center" role="status" aria-label="Carregando financeiro"><Loader2 className="h-8 w-8 animate-spin text-[#F6BE1C]" aria-hidden="true" /></div>
        ) : dashboard ? (
          <>
            <section className="min-w-0 rounded-[28px] border border-[#F6BE1C]/20 bg-gradient-to-br from-[#2A2108] via-[#121416] to-[#090A0B] p-4 sm:p-5">
              <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F6BE1C] text-black"><Wallet className="h-5 w-5" aria-hidden="true" /></div><div className="min-w-0 flex-1"><p className="break-words text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500">Saldo disponível</p><p className="mt-1 max-w-full break-words text-[clamp(22px,8vw,30px)] font-black tracking-tight tabular-nums">{cents(dashboard.wallet.availableBalanceCents)}</p></div></div>
              <div className="mt-5 grid grid-cols-2 gap-2 text-xs max-[339px]:grid-cols-1"><Metric label="Pendente" value={cents(dashboard.wallet.pendingBalanceCents)} /><Metric label="Pendência" value={cents(dashboard.wallet.debtBalanceCents)} danger={dashboard.wallet.debtBalanceCents > 0} /></div>

              {dashboard.payoutEnabled ? (
                <div className="mt-4 min-w-0 rounded-2xl border border-white/8 bg-black/25 p-3">
                  <label className="break-words text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500" htmlFor="withdrawal-amount">Solicitar saque</label>
                  <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row"><input id="withdrawal-amount" value={withdrawalAmount} onChange={(event) => setWithdrawalAmount(event.target.value)} inputMode="decimal" placeholder="0,00" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#101214] px-4 text-base font-black outline-none focus:border-[#F6BE1C]/60" /><button type="button" disabled={withdrawing || dashboard.wallet.availableBalanceCents <= 0} aria-busy={withdrawing} onClick={() => void submitWithdrawal()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F6BE1C] px-4 text-xs font-black text-black disabled:bg-zinc-800 disabled:text-zinc-600">{withdrawing ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />}Sacar</button></div>
                </div>
              ) : (
                <div className="mt-4 flex min-w-0 gap-3 rounded-2xl border border-amber-400/15 bg-amber-400/8 p-4" role="status"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" /><div className="min-w-0"><p className="break-words text-xs font-black text-amber-100">Saques ainda não liberados</p><p className="mt-1 break-words text-[10px] leading-4 text-amber-100/60">As transferências ainda estão em homologação. Nenhum valor será reservado enquanto o saque não estiver liberado.</p></div></div>
              )}
            </section>

            <section className="grid grid-cols-3 gap-2 max-[339px]:grid-cols-1" aria-label="Resumo de ganhos"><Kpi icon={CalendarDays} label="Hoje" value={cents(dashboard.kpis.todayCents)} /><Kpi icon={TrendingUp} label="7 dias" value={cents(dashboard.kpis.last7DaysCents)} /><Kpi icon={CircleDollarSign} label="Mês" value={cents(dashboard.kpis.monthCents)} /></section>

            <section className="min-w-0 space-y-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Período</p><h2 className="mt-1 break-words text-lg font-black">Ganhos liquidados</h2></div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro do período">{(["today", "week", "month", "custom"] as Filter[]).map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)} className={`min-h-11 rounded-full px-4 py-2 text-[10px] font-black ${filter === item ? "bg-[#F6BE1C] text-black" : "border border-white/8 bg-[#111315] text-zinc-400"}`}>{item === "today" ? "Hoje" : item === "week" ? "7 dias" : item === "month" ? "Mês" : "Personalizado"}</button>)}</div>
              {filter === "custom" ? <div className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1"><label className="sr-only" htmlFor="earnings-from">Data inicial</label><input id="earnings-from" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="min-h-11 min-w-0 rounded-xl border border-white/8 bg-[#111315] p-3 text-base [color-scheme:dark]" /><label className="sr-only" htmlFor="earnings-to">Data final</label><input id="earnings-to" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="min-h-11 min-w-0 rounded-xl border border-white/8 bg-[#111315] p-3 text-base [color-scheme:dark]" /></div> : null}
              <div className="flex min-w-0 flex-wrap items-end justify-between gap-2 rounded-2xl border border-white/6 bg-[#0D0F11] p-4"><div className="min-w-0"><p className="break-words text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600">Total do período</p><p className="mt-1 max-w-full break-words text-[clamp(20px,7vw,24px)] font-black tabular-nums">{cents(dashboard.period.settledEarningsCents)}</p></div><p className="break-words text-xs font-bold text-zinc-500">{dashboard.period.settledRides} corridas</p></div>
            </section>

            <section className="min-w-0 space-y-3">
              <div><p className="break-words text-[10px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Origem financeira</p><h2 className="mt-1 break-words text-lg font-black">Liquidações de corridas</h2></div>
              {dashboard.settlements.length === 0 ? <div className="rounded-2xl border border-white/6 bg-[#0D0F11] p-6 text-center text-xs font-bold text-zinc-600">Nenhuma liquidação neste período.</div> : dashboard.settlements.map((item) => <article key={item.settlementId} className="min-w-0 rounded-[22px] border border-white/6 bg-[#0D0F11] p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-[160px] flex-1"><p className="break-words text-xs font-black leading-5">{item.originName} → {item.destinationName}</p><p className="mt-1 break-words text-[10px] leading-4 text-zinc-600">{formatDate(item.settledAt ?? item.createdAt)} · {paymentLabel(item.paymentMethod)}</p></div><p className="max-w-full break-words text-sm font-black tabular-nums text-[#F6BE1C]">{cents(item.driverEarningCents)}</p></div><div className="mt-3 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-zinc-600"><span className="flex items-center gap-1"><RouteIcon className="h-3 w-3 shrink-0" aria-hidden="true" />{item.distanceKm === null ? "—" : `${item.distanceKm.toFixed(1)} km`}</span><span className="flex items-center gap-1"><Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />{item.durationMin === null ? "—" : `${Math.round(item.durationMin)} min`}</span><span className="break-words">{settlementLabel(item.settlementStatus)}</span></div></article>)}
            </section>

            {dashboard.withdrawals.length > 0 ? <section className="min-w-0 space-y-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Transferências</p><h2 className="mt-1 break-words text-lg font-black">Solicitações de saque</h2></div>{dashboard.withdrawals.map((item) => <article key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/6 bg-[#0D0F11] p-4"><div className="min-w-0"><p className="break-words text-xs font-black tabular-nums">{cents(item.amountCents)}</p><p className="mt-1 break-words text-[10px] text-zinc-600">{formatDate(item.requestedAt)}</p></div><span className="max-w-full rounded-full bg-white/5 px-3 py-1.5 text-center text-[10px] font-black uppercase text-zinc-400">{withdrawalLabel(item.status)}</span></article>)}</section> : null}
          </>
        ) : null}
      </main>
      <ApoisDriverBottomNav />
    </div>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="min-w-0 rounded-2xl border border-white/6 bg-black/20 p-3"><p className="break-words text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">{label}</p><p className={`mt-1 max-w-full break-words font-black tabular-nums ${danger ? "text-red-400" : "text-zinc-200"}`}>{value}</p></div>;
}

function Kpi({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return <div className="min-w-0 rounded-2xl border border-white/6 bg-[#0D0F11] p-3"><Icon className="h-4 w-4 text-[#F6BE1C]" aria-hidden="true" /><p className="mt-3 break-words text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className="mt-1 max-w-full break-words text-xs font-black tabular-nums">{value}</p></div>;
}