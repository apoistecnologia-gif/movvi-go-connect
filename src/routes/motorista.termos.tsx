import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, ShieldCheck, Sparkles } from "lucide-react";
import { DSLoading } from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import { SettingsPageShell, SettingsHero } from "@/components/settings";

export const Route = createFileRoute("/motorista/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — APOIS" },
      { name: "description", content: "Termos de Uso da plataforma APOIS." },
    ],
  }),
  component: TermosMotoristaPage,
});

function TermosMotoristaPage() {
  const _router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "legal.terms_url")
        .maybeSingle();
      const url = typeof data?.value === "string" ? data.value : (data?.value as { url?: string } | null)?.url;
      if (alive && url && /^https?:\/\//i.test(url)) {
        window.location.replace(url);
        return;
      }
      if (alive) setChecking(false);
    })();
    return () => { alive = false; };
  }, []);

  if (checking) {
    return (
      <div className="min-h-dvh bg-[#050607] text-white">
        <DSLoading label="Carregando..." className="min-h-dvh" />
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(246,190,28,0.12),transparent_62%)]" />
      <div className="relative">
        <SettingsPageShell variant="driver">
          <div className="relative overflow-hidden rounded-[30px] border border-[#F6BE1C]/20 bg-gradient-to-br from-[#211A08] via-[#101214] to-[#08090A] p-1 shadow-[0_28px_78px_-42px_rgba(246,190,28,.8)]">
            <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#F6BE1C]/12 blur-3xl" />
            <div className="relative">
              <SettingsHero
                icon={FileText}
                title="Termos de Uso"
                subtitle="Última atualização: 15 de agosto de 2026"
              />
            </div>
          </div>

          <article className="space-y-4 rounded-[28px] border border-white/[0.06] bg-[#0D0F11]/95 p-5 text-[14px] leading-relaxed text-zinc-300 shadow-[0_26px_70px_-44px_rgba(0,0,0,.95)] backdrop-blur-sm sm:p-6">
            <div className="flex items-start gap-3 rounded-[20px] border border-[#F6BE1C]/18 bg-[#F6BE1C]/8 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F6BE1C] text-black shadow-[0_12px_28px_-18px_rgba(246,190,28,.8)]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">APOIS Motorista</p>
                <p className="mt-1 text-[13px] font-semibold leading-5 text-zinc-300">
                  Regras essenciais para uma operação segura, transparente e profissional.
                </p>
              </div>
            </div>

            <section className="rounded-[20px] border border-white/5 bg-[#101214] p-4">
              <h2 className="mb-2 text-base font-black text-white">Uso da plataforma</h2>
              <p className="text-zinc-400">
                Ao utilizar o aplicativo APOIS como motorista parceiro, você concorda com estes
                Termos, com a Política de Privacidade e com as regras operacionais da plataforma.
              </p>
            </section>

            <section className="rounded-[20px] border border-white/5 bg-[#101214] p-4">
              <h2 className="mb-2 text-base font-black text-white">Intermediação, pagamentos e assinatura</h2>
              <p className="text-zinc-400">
                A APOIS é uma plataforma de intermediação tecnológica. As formas de pagamento disponibilizadas no aplicativo
                podem utilizar provedores de pagamento integrados à plataforma, conforme a configuração operacional vigente.
                O valor devido ao motorista, eventuais cobranças do passageiro, registros de liquidação e repasses seguem os
                fluxos financeiros e as regras exibidas no aplicativo. A assinatura mensal do motorista libera o recebimento
                de ofertas quando os demais requisitos cadastrais e operacionais também estiverem regulares.
              </p>
            </section>

            <section className="rounded-[20px] border border-white/5 bg-[#101214] p-4">
              <h2 className="mb-2 text-base font-black text-white">Responsabilidades do motorista</h2>
              <p className="text-zinc-400">
                É responsabilidade do motorista manter documentos, veículo e cadastro atualizados,
                respeitar a legislação de trânsito e agir com cordialidade com passageiros.
              </p>
            </section>

            <div className="flex items-start gap-3 rounded-[18px] border border-white/8 bg-black/20 px-4 py-3 text-[12.5px] leading-5 text-zinc-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#F6BE1C]" />
              <p>Esta é uma versão preliminar. O texto oficial será publicado pela APOIS em breve.</p>
            </div>
          </article>
        </SettingsPageShell>
      </div>
    </div>
  );
}
