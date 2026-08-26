import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  if (!Number.isFinite(value)) return "Valor indisponível";
  return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function safeCount(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function safePositiveMetric(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
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

function parseLocalDate(value: string, endOfDay = false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function period(filter: Filter, customFrom: string, customTo: string): [Date, Date] | null {
  if (filter !== "custom") return [startOf(filter), endOfToday()];
  const from = parseLocalDate(customFrom);
  const to = parseLocalDate(customTo, true);
  if (!from || !to || from.getTime() > to.getTime()) return null;
  return [from, to];
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
    : "Data indisponível";
}

function paymentLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "cash") return "Dinheiro";
  if (normalized === "wallet") return "Carteira APOIS";
  if (normalized === "pix") return "Pix";
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

function normalizeMoneyInput(value: string): number | null {
  const compact = value.trim().replace(/\s/g, "");
  if (!compact || !/^\d[\d.,]*$/.test(compact)) return null;

  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  let normalized = compact;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = compact.split(thousandsSeparator).join("");
    if (decimalSeparator === ",") normalized = normalized.replace(",", ".");
  } else if (lastComma >= 0) {
    const parts = compact.split(",");
    if (parts.length !== 2 || parts[1]!.length > 2) return null;
    normalized = `${parts[0]}.${parts[1]}`;
  } else if (lastDot >= 0) {
    const parts = compact.split(".");
    if (parts.length === 2 && parts[1]!.length <= 2) normalized = compact;
    else if (parts.slice(1).every((part) => part.length === 3)) normalized = parts.join("");
    else return null;
  }

  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function payoutUnavailableMessage(dashboard: DriverFinancialDashboard): string {
  const reason = dashboard.payout.reason ?? "";
  if (reason === "pix_payout_destination_not_confirmed") {
    return "Confirme sua chave Pix na carteira antes de solicitar um saque.";
  }
  if (reason === "pix_payout_destination_cooldown") {
    const availableAt = dashboard.payout.payoutAvailableAt;
    const suffix = availableAt ? ` até ${formatDate(availableAt)}` : "";
    return `Sua chave Pix está no período de segurança${suffix}.`;
  }
  if (reason === "asaas_subaccount_not_approved") {
    return "Sua conta financeira de motorista ainda não está aprovada para receber saques.";
  }
  if (reason === "asaas_subaccount_secret_missing") {
    return "A integração de transferência ainda não está pronta para esta conta.";
  }
  return "As transferências ainda estão em homologação. Nenhum valor será reservado enquanto o saque não estiver liberado.";
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
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const range = useMemo(() => period(filter, customFrom, customTo), [filter, customFrom, customTo]);
  const customRangeInvalid = filter === "custom" && Boolean(customFrom && customTo && !range);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const load = useCallback(async () => {
    if (!range) {
      setLoading(false);
      return;
    }

    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const profile = await loadDriverProfile();
      if (sequence !== requestSequence.current) return;
      if (!profile.ok) {
        await navigate({ to: profile.reason === "no_session" ? "/motorista/login" : "/motorista/status", replace: true });
        return;
      }
      const nextDashboard = await loadDriverFinancialDashboard(range[0], range[1]);
      if (sequence === requestSequence.current) setDashboard(nextDashboard);
    } catch (caughtError: unknown) {
      console.error("[APOIS Driver Finance] load failed", caughtError);
      if (sequence === requestSequence.current) setError("Não foi possível carregar o financeiro agora.");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [navigate, range]);

  useEffect(() => { void load(); }, [load]);

  const submitWithdrawal = async (): Promise<void> => {
    if (!dashboard?.payoutEnabled || withdrawing) return;
    setWithdrawalError(null);
    const parsed = normalizeMoneyInput(withdrawalAmount);
    if (parsed === null) {
      setWithdrawalError("Informe um valor válido, com no máximo duas casas decimais.");
      return;
    }
    const amountCents = Math.round(parsed * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      setWithdrawalError("Informe um valor de saque válido.");
      return;
    }
    if (amountCents < dashboard.payout.minWithdrawalCents) {
      setWithdrawalError(`O valor mínimo para saque é ${cents(dashboard.payout.minWithdrawalCents)}.`);
      return;
    }
    const availableCents = Number.isFinite(dashboard.wallet.availableBalanceCents)
      ? Math.max(0, dashboard.wallet.availableBalanceCents)
      : 0;
    if (amountCents > availableCents) {
      setWithdrawalError("O valor informado é maior que o saldo disponível.");
      return;
    }

    setWithdrawing(true);
    try {
      await requestDriverWithdrawal(amountCents);
      setWithdrawalAmount("");
      toast.success("Saque solicitado. O valor foi reservado até o processamento.");
      await load();
    } catch (caughtError: unknown) {
      console.error("[APOIS Driver Finance] withdrawal failed", caughtError);
      setWithdrawalError(
        caughtError instanceof Error && caughtError.message
          ? caughtError.message
          : "Não foi possível solicitar o saque agora. Tente novamente.",
      );
    } finally {
      setWithdrawing(false);
    }
  };

  const settledRideCount = dashboard ? safeCount(dashboard.period.settledRides) : 0;

  return (
    <div className="min-h-[100dvh] min-w-0 bg-[#050607] text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#08090A]/95 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl min-w-0 items-center gap-3">
          <button type="button" aria-label="Voltar" onClick={() => void navigate({ to: "/motorista/app" })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-[#111315] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C]"><ArrowLeft className="h-5 w-5" aria-hidden="true" /></button>
          <div className="min-w-0 flex-1"><p className="break-words text-[11px] font-black uppercase tracking-[0.14em] text-[#F6BE1C] sm:tracking-[0.2em]">Carteira e corridas</p><h1 className="break-words text-xl font-black">Financeiro</h1></div>
          <button type="button" aria-label={loading ? "Atualizando financeiro" : "Atualizar financeiro"} aria-busy={loading} disabled={loading || withdrawing || !range} onClick={() => void load()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-[#111315] text-[#F6BE1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C] disabled:opacity-50"><RefreshCw aria-hidden="true" className={loading ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} /></button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl min-w-0 space-y-5 px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+112px)]">
        {error ? (
          <section role="alert" aria-live="assertive" className="min-w-0 rounded-2xl border border-red-500/20 bg-red-500/8 p-4">
            <p className="break-words text-xs font-bold leading-5 text-red-300">{error}</p>
            <button type="button" disabled={loading} onClick={() => void load()} className="mt-3 min-h-11 w-full rounded-xl border border-red-400/20 bg-red-400/5 px-4 text-xs font-black text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50">Tentar novamente</button>
          </section>
        ) : null}

        {loading && !dashboard ? (
          <div className="flex min-h-[55vh] items-center justify-center" role="status" aria-live="polite" aria-label="Carregando financeiro"><Loader2 className="h-8 w-8 animate-spin text-[#F6BE1C] motion-reduce:animate-none" aria-hidden="true" /></div>
        ) : dashboard ? (
          <>
            <section className="min-w-0 rounded-[28px] border border-[#F6BE1C]/20 bg-gradient-to-br from-[#2A2108] via-[#121416] to-[#090A0B] p-4 sm:p-5" aria-label="Saldo da carteira">
              <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F6BE1C] text-black"><Wallet className="h-5 w-5" aria-hidden="true" /></div><div className="min-w-0 flex-1"><p className="break-words text-[11px] font-black uppercase tracking-[0.13em] text-zinc-500">Saldo disponível</p><p className="mt-1 max-w-full break-words text-[clamp(22px,8vw,30px)] font-black tracking-tight tabular-nums">{cents(dashboard.wallet.availableBalanceCents)}</p></div></div>
              <div className="mt-5 grid grid-cols-2 gap-2 text-xs max-[359px]:grid-cols-1"><Metric label="Pendente" value={cents(dashboard.wallet.pendingBalanceCents)} /><Metric label="Pendência" value={cents(dashboard.wallet.debtBalanceCents)} danger={Number.isFinite(dashboard.wallet.debtBalanceCents) && dashboard.wallet.debtBalanceCents > 0} /></div>

              {dashboard.payoutEnabled ? (
                <div className="mt-4 min-w-0 rounded-2xl border border-white/8 bg-black/25 p-3">
                  <label className="break-words text-[11px] font-black uppercase tracking-[0.13em] text-zinc-500" htmlFor="withdrawal-amount">Solicitar saque</label>
                  <p id="withdrawal-help" className="mt-1 break-words text-[11px] leading-4 text-zinc-500">Mínimo {cents(dashboard.payout.minWithdrawalCents)}. Informe o valor em reais.</p>
                  <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row"><input id="withdrawal-amount" value={withdrawalAmount} onChange={(event) => { setWithdrawalAmount(event.target.value.slice(0, 18)); setWithdrawalError(null); }} inputMode="decimal" autoComplete="off" placeholder="0,00" aria-describedby="withdrawal-help withdrawal-error" aria-invalid={Boolean(withdrawalError)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#101214] px-4 text-base font-black outline-none focus:border-[#F6BE1C]/60 focus-visible:ring-2 focus-visible:ring-[#F6BE1C]" /><button type="button" disabled={withdrawing || !Number.isFinite(dashboard.wallet.availableBalanceCents) || dashboard.wallet.availableBalanceCents <= 0} aria-busy={withdrawing} onClick={() => void submitWithdrawal()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F6BE1C] px-4 text-xs font-black text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:bg-zinc-800 disabled:text-zinc-600">{withdrawing ? <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />}<span>{withdrawing ? "Solicitando..." : "Sacar"}</span></button></div>
                  <p id="withdrawal-error" role={withdrawalError ? "alert" : undefined} className="mt-2 min-h-4 break-words text-[11px] leading-4 text-red-300">{withdrawalError ?? ""}</p>
                </div>
              ) : (
                <div className="mt-4 flex min-w-0 gap-3 rounded-2xl border border-amber-400/15 bg-amber-400/8 p-4" role="status"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" /><div className="min-w-0"><p className="break-words text-xs font-black text-amber-100">Saques indisponíveis</p><p className="mt-1 break-words text-[11px] leading-4 text-amber-100/60">{payoutUnavailableMessage(dashboard)}</p></div></div>
              )}
            </section>

            <section className="grid grid-cols-3 gap-2 max-[359px]:grid-cols-1" aria-label="Resumo de ganhos"><Kpi icon={CalendarDays} label="Hoje" value={cents(dashboard.kpis.todayCents)} /><Kpi icon={TrendingUp} label="7 dias" value={cents(dashboard.kpis.last7DaysCents)} /><Kpi icon={CircleDollarSign} label="Mês" value={cents(dashboard.kpis.monthCents)} /></section>

            <section className="min-w-0 space-y-3">
              <div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#F6BE1C]">Período</p><h2 className="mt-1 break-words text-lg font-black">Ganhos liquidados</h2></div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro do período">{(["today", "week", "month", "custom"] as Filter[]).map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => { setFilter(item); setError(null); }} className={`min-h-11 rounded-full px-4 py-2 text-[11px] font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C] ${filter === item ? "bg-[#F6BE1C] text-black" : "border border-white/8 bg-[#111315] text-zinc-400"}`}>{item === "today" ? "Hoje" : item === "week" ? "7 dias" : item === "month" ? "Mês" : "Personalizado"}</button>)}</div>
              {filter === "custom" ? (
                <div className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1">
                  <label className="min-w-0"><span className="mb-1 block text-[11px] font-bold text-zinc-500">Data inicial</span><input id="earnings-from" type="date" max={today} value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} aria-invalid={customRangeInvalid} className="min-h-11 w-full min-w-0 rounded-xl border border-white/8 bg-[#111315] p-3 text-base [color-scheme:dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C]" /></label>
                  <label className="min-w-0"><span className="mb-1 block text-[11px] font-bold text-zinc-500">Data final</span><input id="earnings-to" type="date" min={customFrom || undefined} max={today} value={customTo} onChange={(event) => setCustomTo(event.target.value)} aria-invalid={customRangeInvalid} className="min-h-11 w-full min-w-0 rounded-xl border border-white/8 bg-[#111315] p-3 text-base [color-scheme:dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C]" /></label>
                  {customRangeInvalid ? <p className="col-span-full break-words text-[11px] leading-4 text-red-300" role="alert">A data inicial não pode ser posterior à data final.</p> : !customFrom || !customTo ? <p className="col-span-full break-words text-[11px] leading-4 text-zinc-500" role="status">Selecione as duas datas para carregar o período personalizado.</p> : null}
                </div>
              ) : null}
              <div className="flex min-w-0 flex-wrap items-end justify-between gap-2 rounded-2xl border border-white/6 bg-[#0D0F11] p-4"><div className="min-w-0"><p className="break-words text-[11px] font-black uppercase tracking-[0.13em] text-zinc-600">Total do período</p><p className="mt-1 max-w-full break-words text-[clamp(20px,7vw,24px)] font-black tabular-nums">{cents(dashboard.period.settledEarningsCents)}</p></div><p className="break-words text-xs font-bold text-zinc-500">{settledRideCount} {settledRideCount === 1 ? "corrida" : "corridas"}</p></div>
            </section>

            <section className="min-w-0 space-y-3">
              <div><p className="break-words text-[11px] font-black uppercase tracking-[0.16em] text-[#F6BE1C]">Origem financeira</p><h2 className="mt-1 break-words text-lg font-black">Liquidações de corridas</h2></div>
              {dashboard.settlements.length === 0 ? <div className="rounded-2xl border border-white/6 bg-[#0D0F11] p-6 text-center text-xs font-bold text-zinc-600" role="status">Nenhuma liquidação neste período.</div> : dashboard.settlements.map((item) => {
                const origin = item.originName?.trim() || "Origem não informada";
                const destination = item.destinationName?.trim() || "Destino não informado";
                const distance = safePositiveMetric(item.distanceKm);
                const duration = safePositiveMetric(item.durationMin);
                return <article key={item.settlementId} className="min-w-0 rounded-[22px] border border-white/6 bg-[#0D0F11] p-4" aria-label={`Corrida de ${origin} para ${destination}`}><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1 basis-[190px]"><p className="break-words text-xs font-black leading-5">{origin} → {destination}</p><p className="mt-1 break-words text-[11px] leading-4 text-zinc-600">{formatDate(item.settledAt ?? item.createdAt)} · {paymentLabel(item.paymentMethod)}</p></div><p className="max-w-full break-words text-sm font-black tabular-nums text-[#F6BE1C]">{cents(item.driverEarningCents)}</p></div><div className="mt-3 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-zinc-600"><span className="flex min-w-0 items-center gap-1"><RouteIcon className="h-3 w-3 shrink-0" aria-hidden="true" />{distance === null ? "Distância indisponível" : `${distance.toFixed(1).replace(".", ",")} km`}</span><span className="flex min-w-0 items-center gap-1"><Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />{duration === null ? "Tempo indisponível" : `${Math.max(1, Math.round(duration))} min`}</span><span className="break-words">{settlementLabel(item.settlementStatus)}</span></div></article>;
              })}
            </section>

            <section className="min-w-0 space-y-3"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#F6BE1C]">Transferências</p><h2 className="mt-1 break-words text-lg font-black">Solicitações de saque</h2></div>{dashboard.withdrawals.length === 0 ? <div className="rounded-2xl border border-white/6 bg-[#0D0F11] p-5 text-center text-xs font-bold text-zinc-600" role="status">Nenhuma solicitação de saque registrada.</div> : dashboard.withdrawals.map((item) => <article key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/6 bg-[#0D0F11] p-4"><div className="min-w-0 flex-1 basis-[150px]"><p className="break-words text-xs font-black tabular-nums">{cents(item.amountCents)}</p><p className="mt-1 break-words text-[11px] text-zinc-600">{formatDate(item.requestedAt)}</p></div><span className="max-w-full rounded-full bg-white/5 px-3 py-1.5 text-center text-[11px] font-black uppercase text-zinc-400">{withdrawalLabel(item.status)}</span></article>)}</section>
          </>
        ) : null}
      </main>
      <ApoisDriverBottomNav />
    </div>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="min-w-0 rounded-2xl border border-white/6 bg-black/20 p-3"><p className="break-words text-[11px] font-black uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className={`mt-1 max-w-full break-words text-sm font-black tabular-nums ${danger ? "text-red-400" : "text-zinc-200"}`}>{value}</p></div>;
}

function Kpi({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return <div className="min-w-0 rounded-2xl border border-white/6 bg-[#0D0F11] p-3"><Icon className="h-4 w-4 text-[#F6BE1C]" aria-hidden="true" /><p className="mt-3 break-words text-[11px] font-black uppercase tracking-[0.11em] text-zinc-600">{label}</p><p className="mt-1 max-w-full break-words text-sm font-black tabular-nums">{value}</p></div>;
}