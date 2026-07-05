import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Crown,
  CalendarDays,
  Wallet,
  CreditCard,
  Copy,
  ExternalLink,
  LifeBuoy,
  Sparkles,
  QrCode,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import {
  Typography,
  DSButton,
  DSCard,
  StatusPill,
  Loading,
  EmptyState,
  Icon,
  HeadingS,
  Body,
  BodySmall,
  Caption,
} from "@/design-system";
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
type UiStatus = ReturnType<typeof toUiStatus>;

/** UI status → StatusPill token. */
function pillFor(status: UiStatus) {
  const label = SUBSCRIPTION_STATUS_UI_LABELS[status];
  switch (status) {
    case "active":
      return <StatusPill status="finished" label={label} pulse={false} />;
    case "pending_payment":
      return <StatusPill status="searching" label={label} />;
    case "expired":
    case "blocked":
    case "cancelled":
      return <StatusPill status="cancelled" label={label} pulse={false} />;
    default:
      return <StatusPill status="offline" label={label} pulse={false} />;
  }
}


const BENEFITS = [
  "Corridas ilimitadas na plataforma",
  "Repasse integral das corridas ao motorista",
  "Suporte prioritário 7 dias por semana",
  "Ferramentas de ganhos, histórico e relatórios",
];

function DriverSubscriptionPage() {
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

  if (loading && !info) {
    return (
      <SettingsPageShell>
        <Loading label="Carregando assinatura…" />
      </SettingsPageShell>
    );
  }

  const ui = toUiStatus(info?.subscriptionStatus);
  const isActive = ui === "active";
  const latest = info?.latest;
  const dueDate = info?.nextDueAt ? new Date(info.nextDueAt) : null;

  return (
    <SettingsPageShell>
      <SettingsHero
        icon={Crown}
        title="Mensalidade"
        subtitle="Plano Motorista MOVVI Premium"
        action={pillFor(ui)}
      />

      {/* Plano atual */}
      <DSCard className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <HeadingS>Plano Motorista MOVVI</HeadingS>
            <BodySmall className="text-muted-foreground">
              Acesso completo à plataforma MOVVI DRIVE.
            </BodySmall>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon as={Sparkles} size="lg" />
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Typography
            variant="metric"
            className="text-[clamp(28px,9vw,36px)] text-foreground"
          >
            {formatCurrency(MOVVI_MONTHLY_FEE_BRL)}
          </Typography>
          <Caption>por mês</Caption>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2">
            <Icon as={CalendarDays} size="md" className="text-muted-foreground" />
            <div className="min-w-0">
              <Caption className="block">Próximo vencimento</Caption>
              <BodySmall className="truncate font-semibold text-foreground">
                {dueDate ? dueDate.toLocaleDateString("pt-BR") : "—"}
              </BodySmall>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2">
            <Icon as={Wallet} size="md" className="text-muted-foreground" />
            <div className="min-w-0">
              <Caption className="block">Forma de pagamento</Caption>
              <BodySmall className="truncate font-semibold text-foreground">
                {latest?.payment_method === "credit_card"
                  ? "Cartão de crédito"
                  : latest?.payment_method === "pix"
                    ? "PIX"
                    : "PIX ou Cartão"}
              </BodySmall>
            </div>
          </div>
        </div>
      </DSCard>

      {/* Benefícios */}
      <DSCard className="p-5 space-y-3">
        <HeadingS>Benefícios do plano</HeadingS>
        <ul className="space-y-2">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
              />
              <Body className="text-foreground">{b}</Body>
            </li>
          ))}
        </ul>
      </DSCard>

      {/* Pagamento (quando não ativa) */}
      {!isActive ? (
        <DSCard className="p-5 space-y-3">
          <div className="space-y-1">
            <HeadingS>
              {ui === "expired" || ui === "blocked" || ui === "cancelled"
                ? "Regularizar mensalidade"
                : "Pagar mensalidade"}
            </HeadingS>

            <BodySmall className="text-muted-foreground">
              Escolha a forma de pagamento para gerar sua cobrança.
            </BodySmall>
          </div>
          <div className="grid gap-2">
            <DSButton
              className="w-full"
              size="lg"
              disabled={busy !== null}
              onClick={() => pay("pix")}
              aria-label="Pagar mensalidade com PIX"
            >
              {busy === "pix" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Icon as={QrCode} size="sm" className="mr-2" />
              )}
              Pagar com PIX
            </DSButton>
            <DSButton
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={busy !== null}
              onClick={() => pay("credit_card")}
              aria-label="Pagar mensalidade com cartão de crédito"
            >
              {busy === "credit_card" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Icon as={CreditCard} size="sm" className="mr-2" />
              )}
              Pagar com cartão de crédito
            </DSButton>
          </div>
        </DSCard>
      ) : null}

      {/* Última cobrança */}
      {latest ? (
        <DSCard className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <HeadingS>Última cobrança</HeadingS>
              <Caption className="block">
                {new Date(latest.created_at).toLocaleString("pt-BR")}
              </Caption>
            </div>
            {pillFor(ui)}
          </div>

          <div className="grid gap-2">
            <Row label="Valor" value={formatCurrency(Number(latest.amount ?? 0))} />
            <Row
              label="Método"
              value={latest.payment_method === "credit_card" ? "Cartão" : "PIX"}
            />
            <Row label="Status" value={String(latest.status ?? "—")} />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {latest.pix_copy_paste ? (
              <DSButton
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(latest.pix_copy_paste!);
                  toast.success("Código PIX copiado.");
                }}
              >
                <Icon as={Copy} size="sm" className="mr-1.5" />
                Copiar PIX
              </DSButton>
            ) : null}
            {latest.invoice_url ? (
              <DSButton variant="outline" size="sm" asChild>
                <a href={latest.invoice_url} target="_blank" rel="noreferrer">
                  <Icon as={ExternalLink} size="sm" className="mr-1.5" />
                  Abrir fatura
                </a>
              </DSButton>
            ) : null}
          </div>
        </DSCard>
      ) : (
        <EmptyState
          icon={Wallet}
          title="Nenhuma cobrança encontrada"
          description="Suas cobranças da mensalidade aparecerão aqui após a primeira geração."
        />
      )}

      {/* Suporte */}
      <DSCard className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Icon as={LifeBuoy} size="lg" />
          </div>
          <div className="min-w-0">
            <HeadingS>Precisa de ajuda?</HeadingS>
            <Caption className="block">Fale com nossa equipe sobre sua assinatura.</Caption>
          </div>
        </div>
        <DSButton variant="outline" size="sm" asChild>
          <Link to="/motorista/suporte">Falar com suporte</Link>
        </DSButton>
      </DSCard>
    </SettingsPageShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <BodySmall className="text-muted-foreground">{label}</BodySmall>
      <BodySmall className="truncate font-semibold text-foreground">{value}</BodySmall>
    </div>
  );
}
