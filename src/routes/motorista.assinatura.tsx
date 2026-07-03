import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CheckCircle2, Clock, ShieldAlert, Copy, ExternalLink, Crown } from "lucide-react";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  createDriverMonthlyCharge,
  getDriverSubscriptionInfo,
} from "@/lib/payments/subscription.functions";
import {
  MOVVI_MONTHLY_FEE_BRL,
  SUBSCRIPTION_STATUS_UI_LABELS,
  toUiStatus,
  type SubscriptionPaymentMethod,
} from "@/lib/payments/types";
import { formatCurrency } from "@/lib/finance/financeSettings";

export const Route = createFileRoute("/motorista/assinatura")({
  head: () => ({ meta: [{ title: "Mensalidade — Motorista MOVVI" }] }),
  component: DriverSubscriptionPage,
});

type Info = Awaited<ReturnType<typeof getDriverSubscriptionInfo>>;

function DriverSubscriptionPage() {
  const navigate = useNavigate();
  const load = useServerFn(getDriverSubscriptionInfo);
  const createCharge = useServerFn(createDriverMonthlyCharge);
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<SubscriptionPaymentMethod | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await load({});
      setInfo(r);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível carregar a assinatura.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function pay(method: SubscriptionPaymentMethod) {
    setBusy(method);
    try {
      const res = await createCharge({ data: { method } });
      if (!res.providerConfigured) {
        toast.message("Modo desenvolvimento: cobrança simulada gerada.", {
          description: "Configure ASAAS_API_KEY para cobranças reais.",
        });
      } else {
        toast.success("Cobrança gerada!");
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar cobrança.");
    } finally {
      setBusy(null);
    }
  }

  const ui = toUiStatus(info?.subscriptionStatus);
  const badgeTone =
    ui === "active"
      ? "bg-primary/15 text-primary border-primary/30"
      : ui === "pending_payment"
        ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
        : "bg-destructive/15 text-destructive border-destructive/30";
  const Icon = ui === "active" ? CheckCircle2 : ui === "pending_payment" ? Clock : ShieldAlert;

  return (
    <SettingsPageShell>
      <SettingsHero
        icon={Crown}
        title="Mensalidade"
        subtitle="Plano Motorista MOVVI Premium"
      />



        <Card>
          <CardHeader>
            <CardTitle>Plano Motorista MOVVI</CardTitle>
            <CardDescription>Acesso completo à plataforma MOVVI DRIVE.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-extrabold text-foreground">
                  {formatCurrency(MOVVI_MONTHLY_FEE_BRL)}
                </p>
                <p className="text-xs text-muted-foreground">por mês</p>
              </div>
              <Badge className={`gap-1 border ${badgeTone}`}>
                <Icon className="h-3.5 w-3.5" />
                {SUBSCRIPTION_STATUS_UI_LABELS[ui]}
              </Badge>
            </div>
            {info?.nextDueAt && (
              <p className="text-sm text-muted-foreground">
                Próximo vencimento:{" "}
                <span className="font-semibold text-foreground">
                  {new Date(info.nextDueAt).toLocaleDateString("pt-BR")}
                </span>
              </p>
            )}
          </CardContent>
        </Card>

        {ui !== "active" && (
          <Card>
            <CardHeader>
              <CardTitle>Pagar mensalidade</CardTitle>
              <CardDescription>Escolha a forma de pagamento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="w-full"
                disabled={busy !== null}
                onClick={() => pay("pix")}
              >
                {busy === "pix" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Pagar com PIX
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                disabled={busy !== null}
                onClick={() => pay("credit_card")}
              >
                {busy === "credit_card" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Pagar com cartão de crédito
              </Button>
            </CardContent>
          </Card>
        )}

        {info?.latest && (
          <Card>
            <CardHeader>
              <CardTitle>Última cobrança</CardTitle>
              <CardDescription>
                {new Date(info.latest.created_at).toLocaleString("pt-BR")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Valor</span>
                <span className="font-semibold">{formatCurrency(Number(info.latest.amount ?? 0))}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Método</span>
                <span className="font-semibold">
                  {info.latest.payment_method === "credit_card" ? "Cartão" : "PIX"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className="font-semibold">{info.latest.status}</span>
              </div>

              {info.latest.pix_copy_paste && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    void navigator.clipboard.writeText(info.latest!.pix_copy_paste!);
                    toast.success("Código PIX copiado.");
                  }}
                >
                  <Copy className="h-4 w-4" /> Copiar código PIX
                </Button>
              )}
              {info.latest.invoice_url && (
                <a
                  href={info.latest.invoice_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  <ExternalLink className="h-4 w-4" /> Abrir fatura
                </a>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Histórico de pagamentos</CardTitle>
            <CardDescription>Em breve.</CardDescription>
          </CardHeader>
        </Card>

        {loading && (
          <p className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        )}
    </SettingsPageShell>
  );
}

