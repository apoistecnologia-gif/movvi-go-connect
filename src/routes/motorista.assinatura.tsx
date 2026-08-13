import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Crown,
  LifeBuoy,
  Loader2,
  QrCode,
  ShieldCheck,
  Sparkles,
  Star,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { SettingsPageShell } from "@/components/settings";
import { DSButton, DSCard, Loading } from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import { APOIS_MONTHLY_FEE_BRL } from "@/lib/payments/types";
import { formatCurrency } from "@/lib/finance/financeSettings";
import { MovviLogo } from "@/components/MovviLogo";

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
  "Sem taxa por corrida da APOIS",
  "Suporte durante a operação",
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
      <div className="space-y-4 pb-4">
        <section className="relative overflow-hidden rounded-[28px] border border-[#F6BE1C]/18 bg-[#080A0C] px-5 pb-5 pt-5 text-center shadow-[0_24px_70px_-42px_rgba(246,190,28,.65)]">
          <div aria-hidden className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_50%_0%,rgba(246,190,28,.18),transparent_68%)]" />
          <div className="relative flex justify-center">
            <MovviLogo size={66} showTagline productLabel="" />
          </div>
          <div className={`relative mx-auto mt-4 flex h-16 w-16 items-center justify-center rounded-full border ${approved ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400" : "border-[#F6BE1C]/30 bg-[#F6BE1C]/10 text-[#F6BE1C]"}`}>
            {approved ? <CheckCircle2 className="h-8 w-8" /> : <Crown className="h-8 w-8" />}
          </div>
          <p className="relative mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-[#F6BE1C]">
            {approved ? "Cadastro aprovado" : "Plano Motorista APOIS"}
          </p>
          <h1 className="relative mt-1 text-[25px] font-black tracking-[-0.03em] text-white">
            {approved ? "Sua conta está pronta para a mensalidade" : "Mensalidade do motorista"}
          </h1>
          <p className="relative mx-auto mt-2 max-w-sm text-[12px] font-medium leading-5 text-zinc-500">
            {approved
              ? "O pagamento só é iniciado quando você confirmar a geração do Pix abaixo."
              : "Seu cadastro precisa ser aprovado antes de liberar a cobrança."}
          </p>
          <div className="relative mt-4 inline-flex items-center gap-2 rounded-full border border-white/8 bg-black/35 px-3 py-1.5 text-[10px] font-black text-zinc-300">
            <span className={`h-2 w-2 rounded-full ${operational ? "bg-emerald-400" : "bg-zinc-600"}`} />
            {paidActive ? "Mensalidade ativa" : subscription === "teste" ? "Homologação ativa" : subscription === "pending" ? "Pagamento pendente" : "Mensalidade inativa"}
          </div>
        </section>

        <DSCard className="overflow-hidden border-white/8 bg-[#0D0F11] p-0">
          <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Plano Motorista Parceiro</p>
              <p className="mt-1 text-[13px] font-semibold leading-5 text-zinc-400">Acesso completo à operação APOIS conforme o status oficial da conta.</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#F6BE1C]/20 bg-[#F6BE1C]/10 text-[#F6BE1C]">
              <Star className="h-5 w-5" />
            </div>
          </div>

          <div className="border-y border-white/6 bg-black/25 px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Mensalidade</span>
              <div className="text-right">
                <span className="text-[30px] font-black tracking-[-0.04em] text-[#F6BE1C]">{formatCurrency(APOIS_MONTHLY_FEE_BRL)}</span>
                <span className="ml-1 text-[11px] font-semibold text-zinc-500">/ mês</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 p-4">
            {BENEFITS.map((benefit) => (
              <div key={benefit} className="flex min-h-16 items-start gap-2 rounded-2xl border border-white/6 bg-[#111315] px-3 py-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#F6BE1C]" />
                <span className="text-[10.5px] font-semibold leading-4 text-zinc-300">{benefit}</span>
              </div>
            ))}
          </div>
        </DSCard>

        {!approved ? (
          <DSCard className="border-white/8 bg-[#0D0F11] p-5">
            <p className="text-sm font-black text-white">Aguardando aprovação</p>
            <p className="mt-2 text-xs leading-5 text-zinc-500">Seu cadastro precisa ser aprovado antes da liberação da mensalidade.</p>
          </DSCard>
        ) : paidActive ? (
          <DSCard className="border-emerald-400/20 bg-emerald-400/8 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <p className="text-sm font-black text-white">Mensalidade ativa</p>
                <p className="mt-2 text-xs leading-5 text-zinc-400">Seu plano está ativo. A renovação é acompanhada automaticamente pelo Asaas.</p>
              </div>
            </div>
          </DSCard>
        ) : subscription === "teste" ? (
          <DSCard className="border-[#F6BE1C]/20 bg-[#F6BE1C]/8 p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#F6BE1C]" />
              <div>
                <p className="text-sm font-black text-white">Homologação ativa</p>
                <p className="mt-2 text-xs leading-5 text-zinc-400">Seu acesso de homologação está liberado. Nenhuma cobrança é criada nesta condição.</p>
              </div>
            </div>
          </DSCard>
        ) : (
          <DSCard className="border-[#F6BE1C]/25 bg-[#0D0F11] p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#F6BE1C]/20 bg-[#F6BE1C]/10 text-[#F6BE1C]">
                <WalletCards className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-black text-white">Pague com Pix</p>
                <p className="mt-1 text-[10.5px] font-medium leading-4 text-zinc-500">Cobrança real processada pelo Asaas somente após sua confirmação.</p>
              </div>
              <p className="shrink-0 text-[20px] font-black text-[#F6BE1C]">{formatCurrency(APOIS_MONTHLY_FEE_BRL)}</p>
            </div>
            <DSButton className="mt-4 h-14 w-full bg-[#F6BE1C] text-[14px] font-black text-black hover:bg-[#F6BE1C]/95" onClick={() => void generateMembershipPix()} disabled={checkoutLoading}>
              {checkoutLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
              {subscription === "pending" ? "Consultar / gerar Pix" : "Gerar Pix da mensalidade"}
            </DSButton>
            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-semibold text-zinc-600">
              <ShieldCheck className="h-3.5 w-3.5" />
              Nenhuma cobrança automática ao abrir esta tela
            </div>
          </DSCard>
        )}

        {checkout?.pixPayload ? (
          <DSCard className="border-[#F6BE1C]/20 bg-[#0D0F11] p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Pix pronto</p>
            <h2 className="mt-1 text-lg font-black text-white">Pague a mensalidade</h2>
            <p className="mt-2 text-xs leading-5 text-zinc-500">A confirmação do pagamento é automática pelo webhook do Asaas.</p>
            {checkout.pixQrCodeBase64 ? (
              <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3">
                <img
                  src={`data:image/png;base64,${checkout.pixQrCodeBase64}`}
                  alt="QR Code Pix da mensalidade APOIS"
                  className="h-48 w-48"
                />
              </div>
            ) : null}
            <div className="mt-4 rounded-2xl border border-white/8 bg-black/35 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Pix copia e cola</p>
              <p className="mt-2 break-all font-mono text-xs leading-5 text-zinc-300">{checkout.pixPayload}</p>
            </div>
            <DSButton variant="outline" className="mt-3 w-full border-white/10" onClick={() => void copyPix()}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? "Código copiado" : "Copiar código Pix"}
            </DSButton>
            {checkout.dueDate ? <p className="mt-3 text-center text-[10px] font-semibold text-zinc-600">Vencimento: {checkout.dueDate}</p> : null}
          </DSCard>
        ) : null}

        <DSCard className="flex items-center justify-between gap-3 border-white/8 bg-[#0D0F11] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-[#F6BE1C]"><LifeBuoy className="h-5 w-5" /></div>
            <div className="min-w-0"><p className="text-xs font-black text-white">Precisa de ajuda?</p><p className="mt-0.5 truncate text-[10px] text-zinc-500">Fale com nossa equipe sobre sua conta.</p></div>
          </div>
          <DSButton variant="outline" size="sm" asChild><Link to="/motorista/suporte">Suporte</Link></DSButton>
        </DSCard>
      </div>
    </SettingsPageShell>
  );
}
