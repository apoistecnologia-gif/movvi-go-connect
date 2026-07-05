import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { DSLoading } from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import { PASSENGER_NAV } from "@/components/BottomNav";

export const Route = createFileRoute("/passageiro/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — MOVVI" },
      { name: "description", content: "Política de Privacidade da plataforma MOVVI em conformidade com a LGPD." },
    ],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "legal.privacy_url")
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
      <DSLoading label="Carregando..." className="min-h-dvh" />
    );
  }

  return (
    <SettingsPageShell nav={PASSENGER_NAV}>
      <SettingsHero
        icon={ShieldCheck}
        title="Política de Privacidade"
        subtitle="Última atualização: 28 de junho de 2026 • LGPD"
      />
      <article className="space-y-5 rounded-[24px] bg-white p-6 text-[14px] leading-relaxed text-[#1B1B1B] shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
        <Section title="1. Quem somos">
          A MOVVI Tecnologia é a controladora dos dados pessoais tratados na plataforma
          MOVVI. Esta política descreve como coletamos, usamos, compartilhamos e
          protegemos suas informações.
        </Section>
        <Section title="2. Dados que coletamos">
          Cadastro (nome, e-mail, telefone, CPF, foto), localização GPS em tempo real
          durante o uso, histórico de corridas, avaliações, tickets de suporte,
          dados de pagamento tokenizados e informações técnicas de dispositivo.
        </Section>
        <Section title="3. Como usamos seus dados">
          Conectar você a motoristas próximos, calcular rotas e tarifas, garantir
          segurança (PIN, rastreamento, SOS), processar pagamentos, enviar
          notificações operacionais e cumprir obrigações legais.
        </Section>
        <Section title="4. Compartilhamento">
          Compartilhamos apenas o necessário com motoristas parceiros, processadores
          de pagamento, provedores de infraestrutura e autoridades mediante requisição
          legal. Não vendemos seus dados.
        </Section>
        <Section title="5. Seus direitos (Art. 18 LGPD)">
          Você pode confirmar, acessar, corrigir, anonimizar, portar, eliminar dados,
          revogar consentimento e se opor a tratamentos. Escreva para{" "}
          <a className="text-[#5A9A2A] underline" href="mailto:privacidade@movvi.app">privacidade@movvi.app</a>.
        </Section>
        <Section title="6. DPO">
          Encarregado de Proteção de Dados:{" "}
          <a className="text-[#5A9A2A] underline" href="mailto:dpo@movvi.app">dpo@movvi.app</a>.
        </Section>
        <p className="text-[12.5px] text-[#707070]">
          Veja também nossos{" "}
          <Link to="/passageiro/termos" className="text-[#5A9A2A] underline">Termos de Uso</Link>.
        </p>
      </article>
    </SettingsPageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-[15px] font-semibold text-[#1B1B1B]">{title}</h2>
      <div className="text-[13.5px] leading-relaxed text-[#4B5563]">{children}</div>
    </section>
  );
}
