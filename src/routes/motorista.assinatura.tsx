import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Copy, Crown, LifeBuoy, Loader2, QrCode, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import { DSButton, DSCard, StatusPill, Loading, Icon, HeadingS, Body, BodySmall, Caption, Typography } from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import { APOIS_MONTHLY_FEE_BRL } from "@/lib/payments/types";
import { formatCurrency } from "@/lib/finance/financeSettings";

export const Route = createFileRoute("/motorista/assinatura")({
  head: () => ({ meta: [{ title: "Mensalidade — Motorista APOIS" }] }),
  component: DriverSubscriptionPage,
});

type DriverInfo = {
  approval_status: string;
  subscription_status: string;
};

type AsaasMembershipResult = {
  ok?: boolean;
  alreadyActive?: boolean;
  paidThrough?: string | null;
  pendingGeneration?: boolean;
  amountCents?: number;
  subscriptionId?: string;
  paymentId?: string;
  dueDate?: string;
  pixPayload?: string | null;
  pixQrCodeBase64?: string | null;
  pixExpirationAt?: string | null;
  error?: string;
  detail?: string;
};

const BENEFITS = [
  "Corridas ilimitadas na plataforma",
  "Repasse integral das corridas ao motorista",
  "Suporte durante a operação",
  "Ferramentas de ganhos, histórico e relatórios",
];

function DriverSubscriptionPage() {
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkout, setCheckout] = useState<AsaasMembershipResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("not_authenticated");

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", auth.user.id)
        .maybeSingle();
      if (profileError || !profile) throw profileError ?? new Error("profile_missing");

      const { data, error } = await supabase
        .from("drivers")
        .select("approval_status,subscription_status")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (error) throw error;
      setDriver(data ?? null);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível carregar a mensalidade.");
    } finally {
      setLoading(false);
    }
  }

  async function generateMembershipPix() {
    if (!driver || driver.approval_status.toLowerCase() !== "aprovado") return;

    const confirmed = window.confirm(
      `Gerar agora a cobrança Pix real de ${formatCurrency(APOIS_MONTHLY_FEE_BRL)} da mensalidade APOIS?`,
    );
    if (!confirmed) return;

    setCheckoutLoading(true);
    setCheckout(null);
    try {
      const { data, error } = await supabase.functions.invoke<AsaasMembershipResult>(
        "asaas-create-driver-membership",
        { body: {} },
      );
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail || data?.error || "membership_checkout_failed");

      setCheckout(data);
      if (data.alreadyActive) {
        toast.success("Sua mensalidade já está ativa.");
      } else if (data.pendingGeneration) {
        toast.info("Cobrança criada. O Pix ainda está sendo gerado pelo Asaas; tente novamente em instantes.");
      } else if (data.pixPayload) {
        toast.success("Pix da mensalidade gerado com sucesso.");
      } else {
        toast.info("Cobrança criada no Asaas. Atualize em instantes para obter o Pix.");
      }
      await refresh();
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível gerar o Pix da mensalidade agora.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function copyPix() {
    if (!checkout?.pixPayload) return;
    try {
      await navigator.clipboard.writeText(checkout.pixPayload);
      setCopied(true);
      toast.success("Código Pix copiado.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar o código Pix.");
    }
  }

  useEffect(() => { void refresh(); }, []);

  if (loading && !driver) {
    return <SettingsPageShell variant="driver"><Loading label="Carregando mensalidade…" /></SettingsPageShell>;
  }

  const approval = (driver?.approval_status ?? "pendente").toLowerCase();
  const subscription = (driver?.subscription_status ?? "inactive").toLowerCase();
  const operational = ["active", "ativa", "teste"].includes(subscription);
  const approved = approval === "aprovado";
  const paidActive = ["active", "ativa"].includes(subscription);

  return (
    <SettingsPageShell variant="driver">
      <SettingsHero
        icon={Crown}
        title="Mensalidade"
        subtitle="Plano Motorista APOIS"
        action={<StatusPill status={operational ? "finished" : "offline"} label={paidActive ? "Ativa" : subscription === "teste" ? "Homologação" : subscription === "pending" ? "Pagamento pendente" : "Inativa"} pulse={false} />}
      />

      <DSCard className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <HeadingS>Plano Motorista APOIS</HeadingS>
            <BodySmall className="text-muted-foreground">Acesso à operação da plataforma conforme o status oficial da sua conta.</BodySmall>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon as={Sparkles} size="lg" />
          </div>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <Typography variant="metric" className="text-[clamp(28px,9vw,36px)] text-foreground">
            {formatCurrency(APOIS_MONTHLY_FEE_BRL)}
          </Typography>
          <Caption>por mês</Caption>
        </div>
      </DSCard>

      <DSCard className="p-5 space-y-3">
        <HeadingS>Benefícios do plano</HeadingS>
        <ul className="space-y-2">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
              <Body>{benefit}</Body>
            </li>
          ))}
        </ul>
      </DSCard>

      {!approved ? (
        <DSCard className="p-5 space-y-2">
          <HeadingS>Aguardando aprovação</HeadingS>
          <BodySmall className="text-muted-foreground">Seu cadastro precisa ser aprovado antes da liberação da mensalidade.</BodySmall>
        </DSCard>
      ) : paidActive ? (
        <DSCard className="p-5 space-y-2">
          <HeadingS>Mensalidade ativa</HeadingS>
          <BodySmall className="text-muted-foreground">Seu plano está ativo. A renovação é acompanhada automaticamente pelo Asaas.</BodySmall>
        </DSCard>
      ) : (
        <DSCard className="p-5 space-y-4">
          <div className="space-y-2">
            <HeadingS>{subscription === "pending" ? "Pagamento pendente" : "Ativar mensalidade"}</HeadingS>
            <BodySmall className="text-muted-foreground">
              A cobrança é processada pelo Asaas. O Pix só é criado depois que você confirmar no botão abaixo; esta tela nunca gera cobrança automaticamente.
            </BodySmall>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <Caption className="block">Valor da cobrança</Caption>
            <Typography variant="metric" className="mt-1 text-2xl text-foreground">{formatCurrency(APOIS_MONTHLY_FEE_BRL)}</Typography>
          </div>
          <DSButton className="w-full" onClick={() => void generateMembershipPix()} disabled={checkoutLoading}>
            {checkoutLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
            {subscription === "pending" ? "Consultar / gerar Pix" : "Gerar Pix da mensalidade"}
          </DSButton>
        </DSCard>
      )}

      {checkout?.pixPayload ? (
        <DSCard className="p-5 space-y-4">
          <div className="space-y-1">
            <HeadingS>Pix pronto para pagamento</HeadingS>
            <BodySmall className="text-muted-foreground">
              Copie o código abaixo e pague no aplicativo do seu banco. A confirmação do pagamento é automática pelo webhook do Asaas.
            </BodySmall>
          </div>
          {checkout.pixQrCodeBase64 ? (
            <div className="mx-auto w-fit rounded-2xl bg-white p-3">
              <img
                src={`data:image/png;base64,${checkout.pixQrCodeBase64}`}
                alt="QR Code Pix da mensalidade APOIS"
                className="h-48 w-48"
              />
            </div>
          ) : null}
          <div className="rounded-2xl bg-muted p-3">
            <Caption className="block">Pix copia e cola</Caption>
            <p className="mt-2 break-all font-mono text-xs text-foreground">{checkout.pixPayload}</p>
          </div>
          <DSButton variant="outline" className="w-full" onClick={() => void copyPix()}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? "Código copiado" : "Copiar código Pix"}
          </DSButton>
          {checkout.dueDate ? <Caption className="block text-center">Vencimento: {checkout.dueDate}</Caption> : null}
        </DSCard>
      ) : null}

      <DSCard className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Icon as={LifeBuoy} size="lg" /></div>
          <div><HeadingS>Precisa de ajuda?</HeadingS><Caption className="block">Fale com nossa equipe sobre sua conta.</Caption></div>
        </div>
        <DSButton variant="outline" size="sm" asChild><Link to="/motorista/suporte">Falar com suporte</Link></DSButton>
      </DSCard>
    </SettingsPageShell>
  );
}
