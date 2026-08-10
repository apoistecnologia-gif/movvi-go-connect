import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crown, LifeBuoy, Sparkles } from "lucide-react";
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

const BENEFITS = [
  "Corridas ilimitadas na plataforma",
  "Repasse integral das corridas ao motorista",
  "Suporte durante a operação",
  "Ferramentas de ganhos, histórico e relatórios",
];

function DriverSubscriptionPage() {
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { void refresh(); }, []);

  if (loading && !driver) {
    return <SettingsPageShell variant="driver"><Loading label="Carregando mensalidade…" /></SettingsPageShell>;
  }

  const approval = (driver?.approval_status ?? "pendente").toLowerCase();
  const subscription = (driver?.subscription_status ?? "inactive").toLowerCase();
  const operational = ["active", "ativa", "teste"].includes(subscription);
  const approved = approval === "aprovado";

  return (
    <SettingsPageShell variant="driver">
      <SettingsHero
        icon={Crown}
        title="Mensalidade"
        subtitle="Plano Motorista APOIS"
        action={<StatusPill status={operational ? "finished" : "offline"} label={operational ? (subscription === "teste" ? "Homologação" : "Ativa") : "Inativa"} pulse={false} />}
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
          <BodySmall className="text-muted-foreground">Seu cadastro precisa ser aprovado antes da liberação operacional.</BodySmall>
        </DSCard>
      ) : subscription === "teste" ? (
        <DSCard className="p-5 space-y-2">
          <HeadingS>Conta em homologação</HeadingS>
          <BodySmall className="text-muted-foreground">
            O backend oficial mantém esta conta no modo de homologação. Nenhuma cobrança é gerada por esta tela enquanto o checkout de mensalidade não estiver homologado.
          </BodySmall>
        </DSCard>
      ) : !operational ? (
        <DSCard className="p-5 space-y-2">
          <HeadingS>Mensalidade ainda indisponível</HeadingS>
          <BodySmall className="text-muted-foreground">
            O checkout de mensalidade ainda não está habilitado no backend oficial. O aplicativo não exibirá link falso nem cobrança de provedor legado.
          </BodySmall>
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
