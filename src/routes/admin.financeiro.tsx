import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : start;
    const to = customTo ? new Date(`${customTo}T23:59:59`) : end;
    return { from, to };
  }
  return { from: start, to: end };
}

const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);

function AdminFinanceiroPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [summary, setSummary] = useState<AdminFinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);

  async function load() {
    setLoading(true);
    try {
      const data = await getAdminFinanceSummary(range.from, range.to);
      setSummary(data);
    } catch (error) {
      setSummary(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o financeiro.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from.getTime(), range.to.getTime()]);

  function exportSettlements() {
    if (!summary) return;
    downloadCsv(
      `apois-settlements-${new Date().toISOString().slice(0, 10)}`,
      summary.recent_settlements.map((row) => ({
        settlement_id: row.id,
        corrida: row.ride_id,
        motorista: row.driver_id,
        passageiro: row.passenger_id,
        metodo: row.payment_method,
        pagamento: row.payment_status,
        settlement: row.status,
        passenger_charge: (row.passenger_charge_cents / 100).toFixed(2),
        driver_earning: (row.driver_earning_cents / 100).toFixed(2),
        platform_revenue: (row.platform_fee_cents / 100).toFixed(2),
        provider_fee: (row.payment_provider_fee_cents / 100).toFixed(2),
        refund: (row.refunded_amount_cents / 100).toFixed(2),
        criado_em: row.created_at,
        liquidado_em: row.settled_at ?? "",
      })),
    );
  }

  return (
    <AdminLayout
      title="Financeiro"
      description="Settlement, receita APOIS, ganhos do motorista, taxas, estornos e saques — sem misturar conceitos."
      actions={
        <div className="flex gap-2">
          <DSButton variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </DSButton>
          <DSButton variant="outline" size="sm" onClick={exportSettlements} disabled={!summary} className="gap-1">
            <Download className="h-4 w-4" /> CSV
          </DSButton>
        </div>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="p-4 text-sm text-muted-foreground">
          A fonte de verdade desta tela é <strong>ride_settlements + ledgers + driver_withdrawals</strong>. O valor bruto de uma corrida não é chamado de receita APOIS. Mensalidade do motorista e provedores legados não são inferidos nesta tela.
        </DSCardContent>
      </DSCard>

      <DSCard className="mb-4">
        <DSCardContent className="flex flex-wrap items-center gap-2 p-3">
          {([
            ["today", "Hoje"],
            ["7d", "7 dias"],
            ["30d", "30 dias"],
            ["month", "Este mês"],
            ["custom", "Personalizado"],
          ] as Array<[Preset, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPreset(value)}
              className={`rounded-full border px-3 py-1 text-xs ${preset === value ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
          {preset === "custom" && (
            <>
              <DSInput type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="w-auto" />
              <DSInput type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="w-auto" />
            </>
          )}
        </DSCardContent>
      </DSCard>

      {loading ? (
        <Loading label="Carregando settlements..." />
      ) : !summary ? (
        <EmptyState icon={ReceiptText} title="Financeiro indisponível" description="A baseline financeira canônica precisa estar promovida no ambiente antes desta tela operar." />
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
            <MetricCard label="Settlements liquidados" value={String(summary.settlements.settled_count)} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <DSCard>
              <DSCardContent className="space-y-3 p-4">
                <h2 className="font-semibold">Provedores configurados</h2>
                <ProviderLine label="Pagamento eletrônico" value={summary.providers.electronic_payment_provider} />
                <ProviderLine label="Payout" value={summary.providers.payout_provider} />
                <p className="text-xs text-muted-foreground">
                  Ausência de provedor significa indisponível; o painel não inventa integração nem credencial.
                </p>
              </DSCardContent>
            </DSCard>

            <DSCard>
              <DSCardContent className="grid grid-cols-3 gap-3 p-4">
                <SmallStatus label="Pendentes" value={summary.settlements.pending_count} />
                <SmallStatus label="Falhos" value={summary.settlements.failed_count} />
                <SmallStatus label="Liquidados" value={summary.settlements.settled_count} />
              </DSCardContent>
            </DSCard>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <section>
              <h2 className="mb-2 flex items-center gap-2 font-semibold"><ReceiptText className="h-4 w-4 text-primary" /> Settlements recentes</h2>
              {summary.recent_settlements.length === 0 ? (
                <EmptyState icon={ReceiptText} title="Sem settlements no período" description="Corridas liquidadas aparecerão aqui." />
              ) : (
                <div className="space-y-2">
                  {summary.recent_settlements.map((row) => (
                    <DSCard key={row.id}>
                      <DSCardContent className="space-y-2 p-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-primary">{row.ride_id.slice(0, 8)}</span>
                          <DSBadge>{row.status}</DSBadge>
                          <DSBadge variant="secondary">{row.payment_method}</DSBadge>
                          <span className="ml-auto text-muted-foreground">{formatDate(row.settled_at ?? row.created_at)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <MoneyLine label="Passageiro" value={row.passenger_charge_cents} />
                          <MoneyLine label="Motorista" value={row.driver_earning_cents} />
                          <MoneyLine label="APOIS" value={row.platform_fee_cents} />
                          <MoneyLine label="Provedor" value={row.payment_provider_fee_cents} />
                        </div>
                      </DSCardContent>
                    </DSCard>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-2 flex items-center gap-2 font-semibold"><WalletCards className="h-4 w-4 text-primary" /> Saques recentes</h2>
              {summary.recent_withdrawals.length === 0 ? (
                <EmptyState icon={Wallet} title="Sem saques no período" description="Reservas e processamentos de payout aparecerão aqui." />
              ) : (
                <div className="space-y-2">
                  {summary.recent_withdrawals.map((row) => (
                    <DSCard key={row.id}>
                      <DSCardContent className="flex flex-wrap items-center gap-2 p-3 text-xs">
                        <span className="font-mono text-primary">{row.id.slice(0, 8)}</span>
                        <DSBadge>{row.status}</DSBadge>
                        <strong>{money(row.amount_cents)}</strong>
                        <span className="text-muted-foreground">{row.provider ?? "provedor ainda não atribuído"}</span>
                        <span className="ml-auto text-muted-foreground">{formatDate(row.requested_at)}</span>
                        {row.failure_reason && <p className="w-full text-destructive">{row.failure_reason}</p>}
                      </DSCardContent>
                    </DSCard>
                  ))}
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
      <DSCardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold">{value}</p>
      </DSCardContent>
    </DSCard>
  );
}

function ProviderLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
      <span>{label}</span>
      <DSBadge variant={value ? "success" : "secondary"}>{value || "Não configurado"}</DSBadge>
    </div>
  );
}

function SmallStatus({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function MoneyLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-semibold">{money(value)}</p>
    </div>
  );
}
