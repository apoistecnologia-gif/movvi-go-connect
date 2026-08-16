import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  LifeBuoy,
  Loader2,
  QrCode,
  RefreshCw,
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

function normalizeStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(parsed);
}

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

function safePixPayload(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function DriverSubscriptionPage() {
  const navigate = useNavigate();
  const copiedTimerRef = useRef<number | null>(null);
  const refreshRequestRef = useRef(0);
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkout, setCheckout] = useState<AsaasMembershipResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function refresh() {
    const requestId = ++refreshRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        await navigate({ to: "/motorista/login", replace: true });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", auth.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error("profile_missing");

      const { data, error: driverError } = await supabase
        .from("drivers")
        .select("approval_status,subscription_status")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (driverError) throw driverError;
      if (requestId !== refreshRequestRef.current) return;
      if (!data) {
        setDriver(null);
        setError("Seu cadastro de motorista ainda não está disponível para consultar a mensalidade.");
        return;
      }
      setDriver(data);
    } catch (caughtError: unknown) {
      console.error("[APOIS Driver Subscription] refresh failed", caughtError);
      if (requestId === refreshRequestRef.current) setError("Não foi possível carregar a mensalidade agora.");
    } finally {
      if (requestId === refreshRequestRef.current) setLoading(false);
    }
  }

  async function generateMembershipPix() {
    const approval = normalizeStatus(driver?.approval_status);
    if (!driver || !["aprovado", "approved"].includes(approval) || checkoutLoading) return;

    const confirmed = window.confirm(
      `Gerar agora a cobrança Pix real de ${formatCurrency(APOIS_MONTHLY_FEE_BRL)} da mensalidade APOIS?`,
    );
    if (!confirmed) return;

    setCheckoutLoading(true);
    setCheckout(null);
    setCheckoutError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<AsaasMembershipResult>(
        "asaas-create-driver-membership",
        { body: {} },
      );
      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error("membership_checkout_failed");

      const normalizedCheckout = {
        ...data,
        pixPayload: safePixPayload(data.pixPayload) || null,
      };
      setCheckout(normalizedCheckout);
      if (data.alreadyActive) {
        toast.success("Sua mensalidade já está ativa.");
      } else if (data.pendingGeneration) {
        toast.info("Cobrança criada. O Pix ainda está sendo preparado; consulte novamente em instantes.");
      } else if (normalizedCheckout.pixPayload) {
        toast.success("Pix da mensalidade gerado com sucesso.");
      } else {
        toast.info("Cobrança criada. Atualize em instantes para obter o Pix.");
      }
      await refresh();
    } catch (caughtError: unknown) {
      console.error("[APOIS Driver Subscription] checkout failed", caughtError);
      setCheckoutError("Não foi possível gerar o Pix da mensalidade agora. Tente novamente em instantes.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function copyPix() {
    const payload = safePixPayload(checkout?.pixPayload);
    if (!payload) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      toast.success("Código Pix copiado.");
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCheckoutError("Não foi possível copiar o código Pix. Selecione o código manualmente.");
    }
  }

  useEffect(() => {
    void refresh();
    return () => {
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !checkoutLoading) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [checkoutLoading]);

  if (loading && !driver) {
    return <SettingsPageShell variant="driver"><Loading label="Carregando mensalidade…" /></SettingsPageShell>;
  }

  const approval = normalizeStatus(driver?.approval_status || "pendente");
  const subscription = normalizeStatus(driver?.subscription_status || "inactive");
  const operational = ["active", "ativa", "ativo", "paid", "pago", "teste"].includes(subscription);
  const approved = ["aprovado", "aprovada", "approved"].includes(approval);
  const paidActive = ["active", "ativa", "ativo", "paid", "pago"].includes(subscription);
  const pending = ["pending", "pendente", "processing", "processando"].includes(subscription);
  const paidThrough = formatDate(checkout?.paidThrough);
  const dueDate = formatDate(checkout?.dueDate);
  const pixExpiration = formatDateTime(checkout?.pixExpirationAt);
  const pixPayload = safePixPayload(checkout?.pixPayload);

  return (
    <SettingsPageShell variant="driver">
      <div className="min-w-0 space-y-4 pb-4">
        {error ? (
          <DSCard className="min-w-0 border-red-500/20 bg-red-500/8 p-4" role="alert" aria-live="assertive">
            <div className="flex min-w-0 items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden="true" /><p className="min-w-0 flex-1 break-words text-xs font-bold leading-5 text-red-200">{error}</p></div>
            <button type="button" onClick={() => void refresh()} disabled={loading} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-300/20 px-4 text-xs font-black text-red-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"><RefreshCw className={loading ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} aria-hidden="true" />Tentar novamente</button>
          </DSCard>
        ) : null}

        <section className="relative min-w-0 overflow-hidden rounded-[28px] border border-[#F6BE1C]/18 bg-[#080A0C] px-4 pb-5 pt-5 text-center shadow-[0_24px_70px_-42px_rgba(246,190,28,.65)] sm:px-5">
          <div aria-hidden className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_50%_0%,rgba(246,190,28,.18),transparent_68%)]" />
          <div className="relative flex justify-center"><MovviLogo size={66} showTagline productLabel="" /></div>
          <div className={`relative mx-auto mt-4 flex h-16 w-16 items-center justify-center rounded-full border ${approved ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400" : "border-[#F6BE1C]/30 bg-[#F6BE1C]/10 text-[#F6BE1C]"}`} aria-hidden="true">{approved ? <CheckCircle2 className="h-8 w-8" /> : <Crown className="h-8 w-8" />}</div>
          <p className="relative mt-4 break-words text-[11px] font-black uppercase tracking-[0.18em] text-[#F6BE1C] sm:tracking-[0.22em]">{approved ? "Cadastro aprovado" : "Plano Motorista APOIS"}</p>
          <h1 className="relative mt-1 break-words text-[clamp(21px,7vw,25px)] font-black leading-tight tracking-[-0.03em] text-white">{approved ? "Sua conta está pronta para a mensalidade" : "Mensalidade do motorista"}</h1>
          <p className="relative mx-auto mt-2 max-w-sm break-words text-xs font-medium leading-5 text-zinc-500">{approved ? "O pagamento só é iniciado quando você confirmar a geração do Pix abaixo." : "Seu cadastro precisa ser aprovado antes de liberar a cobrança."}</p>
          <div className="relative mt-4 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-white/8 bg-black/35 px-3 py-1.5 text-center text-[11px] font-black text-zinc-300" role="status">
            <span className={`h-2 w-2 shrink-0 rounded-full ${operational ? "bg-emerald-400" : "bg-zinc-600"}`} aria-hidden="true" />
            <span className="break-words">{paidActive ? "Mensalidade ativa" : subscription === "teste" ? "Homologação ativa" : pending ? "Pagamento pendente" : "Mensalidade inativa"}</span>
          </div>
        </section>

        <DSCard className="min-w-0 overflow-hidden border-white/8 bg-[#0D0F11] p-0">
          <div className="flex min-w-0 items-start justify-between gap-3 px-4 pb-4 pt-5 sm:gap-4 sm:px-5"><div className="min-w-0 flex-1"><p className="break-words text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500 sm:tracking-[0.18em]">Plano Motorista Parceiro</p><p className="mt-1 break-words text-[13px] font-semibold leading-5 text-zinc-400">Acesso completo à operação APOIS conforme o status oficial da conta.</p></div><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#F6BE1C]/20 bg-[#F6BE1C]/10 text-[#F6BE1C]" aria-hidden="true"><Star className="h-5 w-5" /></div></div>
          <div className="border-y border-white/6 bg-black/25 px-4 py-4 sm:px-5"><div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2"><span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Mensalidade</span><div className="min-w-0 text-right"><span className="break-words text-[clamp(24px,8.5vw,30px)] font-black tracking-[-0.04em] text-[#F6BE1C]">{formatCurrency(APOIS_MONTHLY_FEE_BRL)}</span><span className="ml-1 text-xs font-semibold text-zinc-500">/ mês</span></div></div></div>
          <div className="grid grid-cols-2 gap-2 p-4 max-[339px]:grid-cols-1">{BENEFITS.map((benefit) => <div key={benefit} className="flex min-h-16 min-w-0 items-start gap-2 rounded-2xl border border-white/6 bg-[#111315] px-3 py-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#F6BE1C]" aria-hidden="true" /><span className="min-w-0 break-words text-[11px] font-semibold leading-4 text-zinc-300">{benefit}</span></div>)}</div>
        </DSCard>

        {!approved ? (
          <DSCard className="min-w-0 border-white/8 bg-[#0D0F11] p-5"><p className="break-words text-sm font-black text-white">Aguardando aprovação</p><p className="mt-2 break-words text-xs leading-5 text-zinc-500">Seu cadastro precisa ser aprovado antes da liberação da mensalidade.</p></DSCard>
        ) : paidActive ? (
          <DSCard className="min-w-0 border-emerald-400/20 bg-emerald-400/8 p-5"><div className="flex min-w-0 items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" /><div className="min-w-0"><p className="break-words text-sm font-black text-white">Mensalidade ativa</p><p className="mt-2 break-words text-xs leading-5 text-zinc-400">Seu plano está ativo. A renovação é acompanhada automaticamente.</p>{paidThrough ? <p className="mt-2 break-words text-xs font-bold text-emerald-300">Ativa até {paidThrough}</p> : null}</div></div></DSCard>
        ) : subscription === "teste" ? (
          <DSCard className="min-w-0 border-[#F6BE1C]/20 bg-[#F6BE1C]/8 p-5"><div className="flex min-w-0 items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#F6BE1C]" aria-hidden="true" /><div className="min-w-0"><p className="break-words text-sm font-black text-white">Homologação ativa</p><p className="mt-2 break-words text-xs leading-5 text-zinc-400">Seu acesso de homologação está liberado. Nenhuma cobrança é criada nesta condição.</p></div></div></DSCard>
        ) : (
          <DSCard className="min-w-0 border-[#F6BE1C]/25 bg-[#0D0F11] p-4 sm:p-5">
            <div className="flex min-w-0 flex-wrap items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#F6BE1C]/20 bg-[#F6BE1C]/10 text-[#F6BE1C]" aria-hidden="true"><WalletCards className="h-5 w-5" /></div><div className="min-w-[140px] flex-1"><p className="break-words text-[14px] font-black text-white">Pague com Pix</p><p className="mt-1 break-words text-[11px] font-medium leading-4 text-zinc-500">Cobrança real processada somente após sua confirmação.</p></div><p className="max-w-full break-words text-[clamp(17px,6vw,20px)] font-black text-[#F6BE1C]">{formatCurrency(APOIS_MONTHLY_FEE_BRL)}</p></div>
            <DSButton className="mt-4 min-h-14 h-auto w-full whitespace-normal bg-[#F6BE1C] px-4 py-3 text-center text-[14px] font-black leading-5 text-black hover:bg-[#F6BE1C]/95 focus-visible:ring-2 focus-visible:ring-white" onClick={() => void generateMembershipPix()} disabled={checkoutLoading || loading} aria-busy={checkoutLoading}>{checkoutLoading ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <QrCode className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />}{pending ? "Consultar / gerar Pix" : "Gerar Pix da mensalidade"}</DSButton>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-center text-[11px] font-semibold text-zinc-600"><ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="break-words">Nenhuma cobrança automática ao abrir esta tela</span></div>
          </DSCard>
        )}

        {checkoutError ? <DSCard className="min-w-0 border-red-500/20 bg-red-500/8 p-4" role="alert" aria-live="assertive"><p className="break-words text-xs font-bold leading-5 text-red-200">{checkoutError}</p></DSCard> : null}

        {checkout?.pendingGeneration && !pixPayload ? <DSCard className="min-w-0 border-[#F6BE1C]/20 bg-[#F6BE1C]/8 p-4" role="status"><p className="break-words text-sm font-black text-white">Pix sendo preparado</p><p className="mt-1 break-words text-xs leading-5 text-zinc-400">A cobrança foi criada. Aguarde alguns instantes e consulte novamente.</p></DSCard> : null}

        {pixPayload ? (
          <DSCard className="min-w-0 border-[#F6BE1C]/20 bg-[#0D0F11] p-4 sm:p-5">
            <p className="break-words text-[11px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Pix pronto</p><h2 className="mt-1 break-words text-lg font-black text-white">Pague a mensalidade</h2><p className="mt-2 break-words text-xs leading-5 text-zinc-500">A confirmação do pagamento é automática após o processamento do Pix.</p>
            {checkout?.pixQrCodeBase64 ? <div className="mx-auto mt-4 w-fit max-w-full rounded-2xl bg-white p-3"><img src={`data:image/png;base64,${checkout.pixQrCodeBase64}`} alt="QR Code Pix da mensalidade APOIS" className="h-auto w-48 max-w-full" /></div> : null}
            <div className="mt-4 min-w-0 rounded-2xl border border-white/8 bg-black/35 p-3"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Pix copia e cola</p><p className="mt-2 max-w-full break-all select-text font-mono text-xs leading-5 text-zinc-300">{pixPayload}</p></div>
            <DSButton variant="outline" className="mt-3 min-h-11 w-full whitespace-normal border-white/10 focus-visible:ring-2 focus-visible:ring-[#F6BE1C]" onClick={() => void copyPix()} disabled={copied}>{copied ? <Check className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" /> : <Copy className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />}{copied ? "Código copiado" : "Copiar código Pix"}</DSButton>
            {dueDate ? <p className="mt-3 break-words text-center text-xs font-semibold text-zinc-500">Vencimento: {dueDate}</p> : null}
            {pixExpiration ? <p className="mt-1 break-words text-center text-xs font-semibold text-zinc-600">Pix válido até: {pixExpiration}</p> : null}
          </DSCard>
        ) : null}

        <DSCard className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-white/8 bg-[#0D0F11] p-4"><div className="flex min-w-[180px] flex-1 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-[#F6BE1C]" aria-hidden="true"><LifeBuoy className="h-5 w-5" /></div><div className="min-w-0"><p className="break-words text-xs font-black text-white">Precisa de ajuda?</p><p className="mt-0.5 break-words text-[11px] leading-4 text-zinc-500">Fale com nossa equipe sobre sua conta.</p></div></div><DSButton variant="outline" size="sm" className="min-h-11 max-[339px]:w-full focus-visible:ring-2 focus-visible:ring-[#F6BE1C]" asChild><Link to="/motorista/suporte">Suporte</Link></DSButton></DSCard>
      </div>
    </SettingsPageShell>
  );
}