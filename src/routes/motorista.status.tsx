import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileText,
  Loader2,
  LogIn,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadDriverProfile, type DriverProfileRow } from "@/lib/driverProfile";
import { MovviLogo } from "@/components/MovviLogo";

export const Route = createFileRoute("/motorista/status")({
  head: () => ({ meta: [{ title: "Status do cadastro — APOIS Motorista" }] }),
  component: DriverStatusPage,
});

type DisplayStatus = DriverProfileRow["approval_status"] | "nao_encontrado";

type StatusMeta = {
  label: string;
  title: string;
  description: string;
  icon: typeof Clock3;
  tone: string;
  iconTone: string;
};

const STATUS_META: Record<DisplayStatus, StatusMeta> = {
  pendente: {
    label: "Em análise",
    title: "Recebemos seu cadastro",
    description: "Seus dados e documentos serão conferidos antes da liberação para dirigir.",
    icon: Clock3,
    tone: "border-[#F6BE1C]/25 bg-[#F6BE1C]/10 text-[#F6BE1C]",
    iconTone: "bg-[#F6BE1C] text-black",
  },
  em_analise: {
    label: "Em análise",
    title: "Recebemos seu cadastro",
    description: "Seus dados e documentos serão conferidos antes da liberação para dirigir.",
    icon: Clock3,
    tone: "border-[#F6BE1C]/25 bg-[#F6BE1C]/10 text-[#F6BE1C]",
    iconTone: "bg-[#F6BE1C] text-black",
  },
  aprovado: {
    label: "Aprovado",
    title: "Cadastro aprovado!",
    description: "Parabéns! Seu cadastro foi aprovado. Agora falta apenas ativar sua primeira mensalidade para começar a receber corridas.",
    icon: UserRoundCheck,
    tone: "border-emerald-400/25 bg-emerald-400/10 text-emerald-400",
    iconTone: "bg-[#F6BE1C] text-black",
  },
  reprovado: {
    label: "Reprovado",
    title: "Precisamos de uma correção",
    description: "Confira o motivo informado pela equipe e atualize os dados necessários.",
    icon: XCircle,
    tone: "border-red-400/25 bg-red-400/10 text-red-400",
    iconTone: "bg-red-400 text-black",
  },
  bloqueado: {
    label: "Bloqueado",
    title: "Conta temporariamente bloqueada",
    description: "Fale com o suporte da APOIS para entender o que precisa ser regularizado.",
    icon: ShieldAlert,
    tone: "border-red-400/25 bg-red-400/10 text-red-400",
    iconTone: "bg-red-400 text-black",
  },
  nao_encontrado: {
    label: "Não encontrado",
    title: "Cadastro não localizado",
    description: "Não encontramos um cadastro de motorista vinculado a esta conta.",
    icon: ShieldAlert,
    tone: "border-white/10 bg-white/5 text-zinc-300",
    iconTone: "bg-zinc-700 text-white",
  },
};

type DocumentItem = {
  label: string;
  description: string;
  sent: boolean;
};

function DriverStatusPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<DriverProfileRow | null>(null);
  const [status, setStatus] = useState<DisplayStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchProfile = async () => {
      const result = await loadDriverProfile();
      if (!mounted) return;

      if (!result.ok && result.reason === "no_session") {
        await navigate({ to: "/motorista/login" });
        return;
      }

      if (result.ok) {
        setProfile(result.profile);
        setStatus(result.profile.approval_status);
      } else {
        setProfile(null);
        setStatus("nao_encontrado");
      }
      setLoading(false);
    };

    void fetchProfile();

    const channel = supabase
      .channel("apois-driver-status-self")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "drivers" }, () => {
        void fetchProfile();
      })
      .subscribe();

    const onFocus = () => void fetchProfile();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      mounted = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [navigate]);

  const documents = useMemo<DocumentItem[]>(
    () => [
      {
        label: "Foto de perfil",
        description: "Rosto visível para identificação",
        sent: Boolean(profile?.selfie_url || profile?.photo_url),
      },
      {
        label: "CNH",
        description: "Frente e verso da habilitação",
        sent: Boolean(profile?.cnh_url && profile?.cnh_back_url),
      },
      {
        label: "Documento do veículo (CRLV)",
        description: "Documento atual do veículo",
        sent: Boolean(profile?.vehicle_document_url),
      },
      {
        label: "Foto do veículo",
        description: "Veículo visível por inteiro",
        sent: Boolean(profile?.vehicle_photo_url),
      },
    ],
    [profile],
  );

  const sentCount = documents.filter((item) => item.sent).length;
  const meta = status ? STATUS_META[status] : null;
  const Icon = meta?.icon ?? Clock3;

  async function switchAccount() {
    await supabase.auth.signOut();
    await navigate({ to: "/motorista/login" });
  }

  return (
    <div className="min-h-[100dvh] bg-[#050607] text-white">
      <header className="border-b border-white/5 bg-[#08090A] px-5 pb-5 pt-[calc(env(safe-area-inset-top)+18px)]">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
          <MovviLogo size={54} />
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F6BE1C]">Cadastro</p>
            <p className="mt-1 text-[12px] font-semibold text-zinc-500">APOIS Motorista</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6">
        {loading || !meta ? (
          <div className="flex min-h-[52vh] items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#F6BE1C]" />
              <p className="mt-3 text-sm font-semibold text-zinc-500">Carregando seu cadastro...</p>
            </div>
          </div>
        ) : (
          <>
            <section className="overflow-hidden rounded-[28px] border border-white/5 bg-[#101214] shadow-[0_24px_70px_-38px_rgba(0,0,0,0.95)]">
              <div className="px-5 pb-5 pt-6 text-center">
                <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#F6BE1C]/20 ${meta.iconTone}`}>
                  <Icon className="h-9 w-9" strokeWidth={2.1} />
                </div>
                <span className={`mt-4 inline-flex rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] ${meta.tone}`}>
                  {meta.label}
                </span>
                <h1 className="mt-4 text-[26px] font-black leading-tight tracking-tight text-white">
                  {meta.title}
                </h1>
                <p className="mx-auto mt-2 max-w-md text-[13px] font-medium leading-relaxed text-zinc-400">
                  {meta.description}
                </p>
              </div>

              {status === "aprovado" && profile ? (
                <div className="mx-4 mb-4 flex items-center gap-3 rounded-[20px] border border-white/5 bg-black/45 px-4 py-3 text-left">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F6BE1C]/10 text-[#F6BE1C]">
                    <BadgeCheck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-black text-white">{profile.name || "Motorista APOIS"}</p>
                    <p className="mt-0.5 text-[10px] font-medium text-zinc-500">Motorista parceiro</p>
                  </div>
                  <div className="text-right">
                    <ShieldCheck className="ml-auto h-4 w-4 text-[#F6BE1C]" />
                    <p className="mt-1 text-[9px] font-black uppercase tracking-[0.1em] text-[#F6BE1C]">Aprovado</p>
                  </div>
                </div>
              ) : null}

              {status === "reprovado" && profile?.motivo_reprovacao ? (
                <div className="mx-4 mb-4 rounded-2xl border border-red-400/20 bg-red-400/8 px-4 py-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-red-400">Motivo informado</p>
                  <p className="mt-1.5 text-[12px] font-semibold leading-relaxed text-red-200">
                    {profile.motivo_reprovacao}
                  </p>
                </div>
              ) : null}
            </section>

            {status !== "nao_encontrado" && status !== "aprovado" ? (
              <section className="rounded-[24px] border border-white/5 bg-[#0D0F11] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Documentos enviados</p>
                    <p className="mt-1 text-[13px] font-semibold text-zinc-400">{sentCount} de 4 itens recebidos</p>
                  </div>
                  <div className="rounded-2xl bg-black px-3 py-2 text-[18px] font-black tabular-nums text-white">{sentCount}/4</div>
                </div>

                <div className="mt-4 space-y-2">
                  {documents.map((item) => (
                    <div key={item.label} className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/5 bg-[#111315] px-3.5 py-2.5">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.sent ? "bg-emerald-400/10 text-emerald-400" : "bg-white/5 text-zinc-600"}`}>
                        {item.sent ? <CheckCircle2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-black text-zinc-200">{item.label}</p>
                        <p className="mt-0.5 truncate text-[9.5px] font-medium text-zinc-600">{item.description}</p>
                      </div>
                      <span className={`text-[9px] font-black uppercase tracking-[0.12em] ${item.sent ? "text-emerald-400" : "text-zinc-600"}`}>
                        {item.sent ? "Enviado" : "Pendente"}
                      </span>
                    </div>
                  ))}
                </div>

                {sentCount < 4 || profile?.documents_status === "rejected" ? (
                  <Link
                    to="/motorista/documentos"
                    className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-[#F6BE1C]/25 bg-[#F6BE1C]/10 px-4 text-[12px] font-black text-[#F6BE1C]"
                  >
                    <FileCheck2 className="h-4 w-4" />
                    Revisar documentos
                  </Link>
                ) : null}
              </section>
            ) : null}

            {status === "aprovado" ? (
              <section className="overflow-hidden rounded-[26px] border border-[#F6BE1C]/20 bg-[#0D0F11]">
                <div className="border-b border-white/5 px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Sua primeira mensalidade</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#F6BE1C]/20 bg-[#F6BE1C]/10 text-[#F6BE1C]"><Star className="h-5 w-5" /></div>
                      <div>
                        <p className="text-[12px] font-black text-white">Plano Motorista Parceiro</p>
                        <p className="mt-0.5 text-[9.5px] font-medium text-zinc-500">Acesso à plataforma APOIS</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[20px] font-black leading-none text-[#F6BE1C]">R$ 49,90</p>
                      <p className="mt-1 text-[9px] font-bold text-zinc-600">por mês</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 divide-x divide-white/5 border-b border-white/5 bg-black/25">
                  {["100% das corridas", "Sem taxa por corrida", "Suporte exclusivo"].map((benefit) => (
                    <div key={benefit} className="px-2 py-3 text-center">
                      <CheckCircle2 className="mx-auto h-4 w-4 text-[#F6BE1C]" />
                      <p className="mt-1.5 text-[8.5px] font-bold leading-tight text-zinc-400">{benefit}</p>
                    </div>
                  ))}
                </div>

                <div className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-3 rounded-[18px] border border-white/5 bg-black/35 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <QrCode className="h-5 w-5 text-[#F6BE1C]" />
                      <div>
                        <p className="text-[10px] font-black text-white">Pague com PIX</p>
                        <p className="mt-0.5 text-[9px] font-medium text-zinc-600">Pagamento rápido e seguro</p>
                      </div>
                    </div>
                    <span className="text-[13px] font-black text-[#F6BE1C]">R$ 49,90</span>
                  </div>

                  <Link
                    to="/motorista/assinatura"
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-[#F6BE1C] text-[13px] font-black text-black shadow-[0_18px_40px_-24px_rgba(246,190,28,0.85)]"
                  >
                    Pagar primeira mensalidade
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </section>
            ) : null}

            <section className="space-y-2 pb-[calc(env(safe-area-inset-bottom)+14px)]">
              {status === "aprovado" && ["teste", "active", "ativa"].includes(profile?.subscription_status ?? "") ? (
                <Link
                  to="/motorista/app"
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[20px] border border-white/8 bg-[#101214] px-5 text-[12px] font-black text-white"
                >
                  Abrir APOIS Motorista
                  <ChevronRight className="h-4 w-4 text-[#F6BE1C]" />
                </Link>
              ) : null}

              {status === "nao_encontrado" ? (
                <Link
                  to="/motorista/cadastro"
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-[#F6BE1C] px-5 text-[14px] font-black text-black"
                >
                  Fazer cadastro como motorista
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : null}

              <button
                type="button"
                onClick={switchAccount}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-white/8 bg-[#101214] px-4 text-[11px] font-black uppercase tracking-[0.12em] text-zinc-400"
              >
                <LogIn className="h-4 w-4" />
                Entrar com outra conta
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
