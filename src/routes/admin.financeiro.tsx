import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw, ReceiptText, Wallet, WalletCards } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  DSBadge,
  DSButton,
  DSCard,
  DSCardContent,
  DSInput,
  EmptyState,
  Loading,
} from "@/design-system";
import { downloadCsv } from "@/lib/csvExport";
import { formatDate } from "@/lib/formatters";
import { getAdminFinanceSummary, type AdminFinanceSummary } from "@/lib/adminFinance";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Admin APOIS" }] }),
  component: AdminFinanceiroPage,
});

type Preset = "today" | "7d" | "30d" | "month" | "custom";

function validDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function rangeFor(preset: Preset, customFrom: string, customTo: string) {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  if (preset === "today") start.setHours(0, 0, 0, 0);
  if (preset === "7d") start.setDate(start.getDate() - 6);
  if (preset === "30d") start.setDate(start.getDate() - 29);
  if (preset === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  if (preset === "custom") {
    const from = customFrom ? validDate(`${customFrom}T00:00:00`) : null;
    const to = customTo ? validDate(`${customTo}T23:59:59.999`) : null;
    return { from: from ?? start, to: to ?? end };
  }
  return { from: start, to: end };
}

function safeCents(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

function safeCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 180);
  return text || fallback;
}

function cleanProvider(value: unknown) {
  const text = cleanText(value).slice(0, 80);
  if (!text || ["null", "undefined", "none"].includes(text.toLowerCase())) return null;
  return text;
}

const money = (cents: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    safeCents(cents) / 100,
  );

function AdminFinanceiroPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [summary, setSummary] = useState<AdminFinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const range = useMemo(
    () => rangeFor(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );
  const invalidCustomRange =
    preset === "custom" &&
    Boolean(customFrom && customTo) &&
    range.from.getTime() > range.to.getTime();

  async function load() {
    if (invalidCustomRange) {
      setSummary(null);
      setLoading(false);
      setLoadError("A data inicial não pode ser posterior à data final.");
      return;
    }
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getAdminFinanceSummary(range.from, range.to);
      if (requestId !== requestRef.current) return;
      setSummary(data);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setSummary(null);
      setLoadError("Não foi possível carregar o financeiro agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha no resumo financeiro", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => {
      requestRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from.getTime(), range.to.getTime(), invalidCustomRange]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from.getTime(), range.to.getTime(), invalidCustomRange]);

  function exportSettlements() {
    if (!summary || loading) return;
    const rows = summary.recent_settlements;
    if (!rows.length) {
      toast.info("Não há settlements no período para exportar.");
      return;
    }
    try {
      downloadCsv(
        `apois-settlements-${new Date().toISOString().slice(0, 10)}`,
        rows.map((row) => ({
          settlement_id: cleanText(row.id),
          corrida: cleanText(row.ride_id),
          motorista: cleanText(row.driver_id),
          passageiro: cleanText(row.passenger_id),
          metodo: cleanText(row.payment_method),
          pagamento: cleanText(row.payment_status),
          settlement: cleanText(row.status),
          passenger_charge: (safeCents(row.passenger_charge_cents) / 100).toFixed(2),
          driver_earning: (safeCents(row.driver_earning_cents) / 100).toFixed(2),
          platform_revenue: (safeCents(row.platform_fee_cents) / 100).toFixed(2),
          provider_fee: (safeCents(row.payment_provider_fee_cents) / 100).toFixed(2),
          refund: (safeCents(row.refunded_amount_cents) / 100).toFixed(2),
          criado_em: validDate(row.created_at)?.toISOString() ?? "",
          liquidado_em: validDate(row.settled_at)?.toISOString() ?? "",
        })),
      );
      toast.success("CSV de settlements preparado para download.");
    } catch (error) {
      toast.error("Não foi possível gerar o CSV financeiro.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao exportar settlements", error);
    }
  }

  return (
    <AdminLayout
      title="Financeiro"
      description="Settlement, receita APOIS, ganhos do motorista, taxas, estornos e saques — sem misturar conceitos."
      actions={
        <div className="flex flex-wrap gap-2">
          <DSButton
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading || invalidCustomRange}
            className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-busy={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
            {loading ? "Atualizando…" : "Atualizar"}
          </DSButton>
          <DSButton
            variant="outline"
            size="sm"
            onClick={exportSettlements}
            disabled={!summary || loading || summary.recent_settlements.length === 0}
            className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Exportar settlements recentes em CSV"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> CSV
          </DSButton>
        </div>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="p-4 text-sm leading-6 text-muted-foreground">
          A fonte de verdade desta tela é{" "}
          <strong>ride_settlements + ledgers + driver_withdrawals</strong>. O valor bruto de uma
          corrida não é chamado de receita APOIS. Mensalidade do motorista e provedores legados não
          são inferidos nesta tela. A presença de um provedor de payout no resumo também não habilita
          saques: o gate e a homologação do backend continuam prevalecendo.
        </DSCardContent>
      </DSCard>

      <DSCard className="mb-4">
        <DSCardContent className="flex min-w-0 flex-wrap items-center gap-2 p-3">
          {(
            [
              ["today", "Hoje"],
              ["7d", "7 dias"],
              ["30d", "30 dias"],
              ["month", "Este mês"],
              ["custom", "Personalizado"],
            ] as Array<[Preset, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPreset(value)}
              disabled={loading}
              aria-pressed={preset === value}
              className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ${preset === value ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
          {preset === "custom" ? (
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              <label className="min-w-40 flex-1 text-sm font-medium">
                <span className="mb-1 block">De</span>
                <DSInput
                  type="date"
                  value={customFrom}
                  disabled={loading}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="min-h-11 w-full text-base"
                  max={customTo || undefined}
                />
              </label>
              <label className="min-w-40 flex-1 text-sm font-medium">
                <span className="mb-1 block">Até</span>
                <DSInput
                  type="date"
                  value={customTo}
                  disabled={loading}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="min-h-11 w-full text-base"
                  min={customFrom || undefined}
                />
              </label>
            </div>
          ) : null}
        </DSCardContent>
      </DSCard>

      {loading ? (
        <div aria-live="polite"><Loading label="Carregando settlements..." /></div>
      ) : loadError ? (
        <DSCard className="border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            {!invalidCustomRange ? (
              <DSButton variant="outline" className="min-h-11 gap-2" onClick={() => void load()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
              </DSButton>
            ) : null}
          </DSCardContent>
        </DSCard>
      ) : !summary ? (
        <EmptyState
          icon={ReceiptText}
          title="Financeiro indisponível"
          description="O resumo financeiro canônico não foi retornado para o período selecionado."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="GMV liquidado" value={money(summary.settlements.gmv_cents)} />
            <MetricCard label="Ganhos motoristas" value={money(summary.settlements.driver_earnings_cents)} />
            <MetricCard label="Receita APOIS" value={money(summary.settlements.platform_revenue_cents)} emphasis />
            <MetricCard label="Taxas de provedor" value={money(summary.settlements.provider_fees_cents)} />
            <MetricCard label="Estornos" value={money(summary.settlements.refunds_cents)} />
            <MetricCard label="Saques pendentes" value={money(summary.withdrawals.pending_cents)} />
            <MetricCard label="Saques pagos" value={money(summary.withdrawals.paid_cents)} />
            <MetricCard label="Settlements liquidados" value={String(safeCount(summary.settlements.settled_count))} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <DSCard>
              <DSCardContent className="min-w-0 space-y-3 p-4">
                <h2 className="font-semibold">Provedores definidos pelo backend</h2>
                <ProviderLine label="Pagamento eletrônico" value={summary.providers.electronic_payment_provider} />
                <ProviderLine label="Payout" value={summary.providers.payout_provider} />
                <p className="text-sm leading-5 text-muted-foreground">
                  Um nome de provedor não prova que uma operação esteja habilitada. Gates e
                  homologação continuam autoritativos no backend.
                </p>
              </DSCardContent>
            </DSCard>

            <DSCard>
              <DSCardContent className="grid grid-cols-1 gap-3 p-4 min-[360px]:grid-cols-3">
                <SmallStatus label="Pendentes" value={summary.settlements.pending_count} />
                <SmallStatus label="Falhos" value={summary.settlements.failed_count} />
                <SmallStatus label="Liquidados" value={summary.settlements.settled_count} />
              </DSCardContent>
            </DSCard>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <section className="min-w-0">
              <h2 className="mb-2 flex items-center gap-2 font-semibold">
                <ReceiptText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> Settlements recentes
              </h2>
              {summary.recent_settlements.length === 0 ? (
                <EmptyState icon={ReceiptText} title="Sem settlements no período" description="Corridas liquidadas aparecerão aqui." />
              ) : (
                <div className="space-y-2">
                  {summary.recent_settlements.map((row) => {
                    const rideId = cleanText(row.ride_id, "sem corrida");
                    const status = cleanText(row.status, "Status não informado");
                    const paymentMethod = cleanText(row.payment_method, "Pagamento não informado");
                    const date = validDate(row.settled_at) ?? validDate(row.created_at);
                    return (
                      <DSCard key={cleanText(row.id, rideId)}>
                        <DSCardContent className="min-w-0 space-y-2 p-3 text-sm">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="max-w-full break-all font-mono text-primary">{rideId.slice(0, 12)}</span>
                            <DSBadge>{status.replace(/_/g, " ")}</DSBadge>
                            <DSBadge variant="muted">{paymentMethod.replace(/_/g, " ")}</DSBadge>
                            {date ? <time className="ml-auto shrink-0 text-xs text-muted-foreground" dateTime={date.toISOString()}>{formatDate(date.toISOString())}</time> : null}
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <MoneyLine label="Passageiro" value={row.passenger_charge_cents} />
                            <MoneyLine label="Motorista" value={row.driver_earning_cents} />
                            <MoneyLine label="APOIS" value={row.platform_fee_cents} />
                            <MoneyLine label="Provedor" value={row.payment_provider_fee_cents} />
                          </div>
                        </DSCardContent>
                      </DSCard>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="min-w-0">
              <h2 className="mb-2 flex items-center gap-2 font-semibold">
                <WalletCards className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> Saques recentes
              </h2>
              {summary.recent_withdrawals.length === 0 ? (
                <EmptyState icon={Wallet} title="Sem saques no período" description="Reservas e processamentos de payout aparecerão aqui quando autorizados pelo backend." />
              ) : (
                <div className="space-y-2">
                  {summary.recent_withdrawals.map((row) => {
                    const id = cleanText(row.id, "saque");
                    const status = cleanText(row.status, "Status não informado").replace(/_/g, " ");
                    const provider = cleanProvider(row.provider);
                    const date = validDate(row.requested_at);
                    const reason = cleanText(row.failure_reason).slice(0, 500);
                    return (
                      <DSCard key={id}>
                        <DSCardContent className="flex min-w-0 flex-wrap items-center gap-2 p-3 text-sm">
                          <span className="max-w-full break-all font-mono text-primary">{id.slice(0, 12)}</span>
                          <DSBadge>{status}</DSBadge>
                          <strong>{money(row.amount_cents)}</strong>
                          <span className="break-words text-muted-foreground">{provider ?? "Provedor ainda não atribuído"}</span>
                          {date ? <time className="ml-auto shrink-0 text-xs text-muted-foreground" dateTime={date.toISOString()}>{formatDate(date.toISOString())}</time> : null}
                          {reason ? <p className="w-full break-words text-sm text-destructive">{reason}</p> : null}
                        </DSCardContent>
                      </DSCard>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </AdminLayout>
  );
}

function MetricCard({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <DSCard className={emphasis ? "border-primary/30 bg-primary/5" : undefined}>
      <DSCardContent className="min-w-0 p-4">
        <p className="break-words text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-xl font-bold tabular-nums">{value}</p>
      </DSCardContent>
    </DSCard>
  );
}

function ProviderLine({ label, value }: { label: string; value: string | null }) {
  const provider = cleanProvider(value);
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
      <span className="break-words">{label}</span>
      <DSBadge variant={provider ? "success" : "muted"}>{provider ? `Definido: ${provider}` : "Não configurado"}</DSBadge>
    </div>
  );
}

function SmallStatus({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg border border-border p-3 text-center">
      <p className="break-words text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{safeCount(value)}</p>
    </div>
  );
}

function MoneyLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="break-words text-xs text-muted-foreground">{label}</p>
      <p className="break-words font-semibold tabular-nums">{money(value)}</p>
    </div>
  );
}
