import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Crown,
  CalendarDays,
  Wallet,
  CreditCard,
  ExternalLink,
  LifeBuoy,
  Sparkles,
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
  Icon,
  HeadingS,
  Body,
  BodySmall,
  Caption,
} from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import { MOVVI_MONTHLY_FEE_BRL } from "@/lib/payments/types";
import { formatCurrency } from "@/lib/finance/financeSettings";

export const Route = createFileRoute("/motorista/assinatura")({
  head: () => ({ meta: [{ title: "Mensalidade — Motorista MOVVI" }] }),
  component: DriverSubscriptionPage,
});

type FinancialStatus = "inactive" | "pending" | "active" | "overdue" | "cancelled";

type DriverInfo = {
  mercadopago_init_point: string | null;
  mercadopago_preapproval_id: string | null;
  financial_status: FinancialStatus | null;
  subscription_status: string | null;
  subscription_value: number | null;
  next_due_date: string | null;
  last_payment_status: string | null;
  approval_status: string | null;
};

const FIN_LABEL: Record<FinancialStatus, string> = {
  active: "Ativo",
  pending: "Pendente",
  overdue: "Inadimplente",
  cancelled: "Cancelado",
  inactive: "Inativo",
};

function pillFor(status: FinancialStatus) {
  const label = FIN_LABEL[status];
  switch (status) {
    case "active":
      return <StatusPill status="finished" label={label} pulse={false} />;
    case "pending":
      return <StatusPill status="searching" label={label} />;
    case "overdue":
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
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("not_authenticated");
      const { data, error } = await supabase
        .from("drivers")
        .select(
          "mercadopago_init_point,mercadopago_preapproval_id,financial_status,subscription_status,subscription_value,next_due_date,last_payment_status,approval_status",
        )
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      setDriver((data as DriverInfo) ?? null);
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

  if (loading && !driver) {
    return (
      <SettingsPageShell>
        <Loading label="Carregando assinatura…" />
      </SettingsPageShell>
    );
  }

  const financial = (driver?.financial_status ?? "inactive") as FinancialStatus;
  const isActive = financial === "active";
  const dueDate = driver?.next_due_date ? new Date(driver.next_due_date) : null;
  const initPoint = driver?.mercadopago_init_point ?? null;
  const notApprovedYet = driver?.approval_status !== "aprovado";

  return (
    <SettingsPageShell>
      <SettingsHero
        icon={Crown}
        title="Mensalidade"
        subtitle="Plano Motorista MOVVI Premium"
        action={pillFor(financial)}
      />

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
            {formatCurrency(Number(driver?.subscription_value ?? MOVVI_MONTHLY_FEE_BRL))}
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
              <Caption className="block">Pagamento</Caption>
              <BodySmall className="truncate font-semibold text-foreground">
                Mercado Pago
              </BodySmall>
            </div>
          </div>
        </div>
      </DSCard>

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

      {notApprovedYet ? (
        <DSCard className="p-5 space-y-2">
          <HeadingS>Aguardando aprovação</HeadingS>
          <BodySmall className="text-muted-foreground">
            Seu cadastro está em análise. Assim que for aprovado, o link para
            pagar a primeira mensalidade aparecerá aqui.
          </BodySmall>
        </DSCard>
      ) : !isActive && initPoint ? (
        <DSCard className="p-5 space-y-3">
          <div className="space-y-1">
            <HeadingS>
              {financial === "overdue" || financial === "cancelled"
                ? "Regularizar mensalidade"
                : "Pagar mensalidade"}
            </HeadingS>
            <BodySmall className="text-muted-foreground">
              Você será direcionado ao Mercado Pago para concluir o pagamento
              com PIX, cartão ou saldo.
            </BodySmall>
          </div>
          <DSButton
            className="w-full"
            size="lg"
            onClick={() => window.open(initPoint, "_blank", "noopener")}
            aria-label="Pagar mensalidade no Mercado Pago"
          >
            <Icon as={CreditCard} size="sm" className="mr-2" />
            Pagar mensalidade
          </DSButton>
          <BodySmall className="text-muted-foreground">
            Após confirmar o pagamento, esta tela é atualizada automaticamente
            em alguns instantes.
          </BodySmall>
        </DSCard>
      ) : !isActive ? (
        <DSCard className="p-5 space-y-2">
          <HeadingS>Assinatura ainda não gerada</HeadingS>
          <BodySmall className="text-muted-foreground">
            Não foi possível encontrar o link de pagamento da sua mensalidade.
            Entre em contato com o suporte.
          </BodySmall>
        </DSCard>
      ) : null}

      {driver?.last_payment_status ? (
        <DSCard className="p-5 space-y-2">
          <HeadingS>Último pagamento</HeadingS>
          <BodySmall className="text-muted-foreground">
            Status: <span className="font-semibold text-foreground">{driver.last_payment_status}</span>
          </BodySmall>
          {initPoint ? (
            <DSButton variant="outline" size="sm" asChild>
              <a href={initPoint} target="_blank" rel="noreferrer">
                <Icon as={ExternalLink} size="sm" className="mr-1.5" />
                Abrir Mercado Pago
              </a>
            </DSButton>
          ) : null}
        </DSCard>
      ) : null}

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

      {loading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : null}
    </SettingsPageShell>
  );
}

