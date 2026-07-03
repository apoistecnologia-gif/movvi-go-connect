import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import { PASSENGER_NAV } from "@/components/BottomNav";

export const Route = createFileRoute("/passageiro/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — MOVVI" },
      { name: "description", content: "Termos de Uso da plataforma MOVVI." },
    ],
  }),
  component: TermosPage,
});

function TermosPage() {
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
      <div className="flex min-h-dvh items-center justify-center bg-[#F7F9F7] text-[#707070]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <SettingsPageShell nav={PASSENGER_NAV}>
      <SettingsHero
        icon={FileText}
        title="Termos de Uso"
        subtitle="Última atualização: 28 de junho de 2026"
      />
      <article className="space-y-5 rounded-[24px] bg-white p-6 text-[14px] leading-relaxed text-[#1B1B1B] shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
        <Section title="1. Aceitação">
          Ao criar conta e utilizar o aplicativo MOVVI, você concorda com estes Termos
          e com a Política de Privacidade.
        </Section>
        <Section title="2. Descrição do Serviço">
          A MOVVI é uma plataforma tecnológica de intermediação que conecta passageiros
          a motoristas parceiros. Não prestamos serviço de transporte.
        </Section>
        <Section title="3. Conta">
          Forneça dados verdadeiros e atualizados. Uso vedado a menores de 18 anos sem
          assistência. A conta é pessoal e intransferível.
        </Section>
        <Section title="4. Tarifas e Cancelamentos">
          Tarifas calculadas por distância, tempo, categoria e demanda, exibidas antes
          da confirmação. Cancelamentos após o aceite podem gerar cobrança.
        </Section>
        <Section title="5. PIN de Segurança">
          A MOVVI gera um PIN de 4 dígitos por corrida. Informe-o ao motorista para
          autorizar o início da viagem.
        </Section>
        <Section title="6. Avaliações">
          Passageiros e motoristas se avaliam ao fim de cada corrida. Avaliações
          abusivas podem ser removidas.
        </Section>
        <Section title="7. Responsabilidades">
          A MOVVI busca manter a plataforma disponível e segura, mas não garante
          disponibilidade ininterrupta nem responde por condutas de terceiros.
        </Section>
        <Section title="8. Privacidade">
          Consulte a{" "}
          <Link to="/passageiro/privacidade" className="text-[#5A9A2A] underline">Política de Privacidade</Link>
          {" "}para detalhes do tratamento de dados (LGPD).
        </Section>
        <Section title="9. Contato">
          Dúvidas: <a className="text-[#5A9A2A] underline" href="mailto:suporte@movvi.app">suporte@movvi.app</a>.
        </Section>
      </article>
    </SettingsPageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-[15px] font-semibold text-[#1B1B1B]">{title}</h2>
      <p className="text-[13.5px] leading-relaxed text-[#4B5563]">{children}</p>
    </section>
  );
}
