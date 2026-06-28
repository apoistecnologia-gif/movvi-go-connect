import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/passageiro/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — MOVVI DRIVE" },
      { name: "description", content: "Política de Privacidade da plataforma MOVVI DRIVE em conformidade com a LGPD." },
    ],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  const router = useRouter();
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
    return () => {
      alive = false;
    };
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (router.history.canGoBack() ? router.history.back() : router.navigate({ to: "/passageiro/configuracoes" }))}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Política de Privacidade</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-6 pb-24">
        <p className="mb-6 text-xs text-muted-foreground">
          Última atualização: 28 de junho de 2026 • Em conformidade com a LGPD (Lei nº 13.709/2018)
        </p>

        <article className="space-y-5 text-sm leading-relaxed text-foreground/90">
          <Section title="1. Quem somos">
            A MOVVI Tecnologia é a controladora dos dados pessoais tratados na plataforma
            MOVVI DRIVE. Esta política descreve como coletamos, usamos, compartilhamos e
            protegemos suas informações.
          </Section>

          <Section title="2. Dados que coletamos">
            <ul className="ml-5 list-disc space-y-1">
              <li><strong>Cadastro:</strong> nome, e-mail, telefone, CPF, foto de perfil, contato de emergência.</li>
              <li><strong>Localização:</strong> coordenadas GPS em tempo real durante o uso do app, origem e destino das corridas.</li>
              <li><strong>Uso da plataforma:</strong> histórico de corridas, avaliações, tickets de suporte, preferências.</li>
              <li><strong>Pagamento:</strong> dados de cartão tokenizados via processador autorizado (não armazenamos número completo do cartão).</li>
              <li><strong>Dispositivo:</strong> modelo, sistema operacional, identificadores anônimos, logs técnicos.</li>
            </ul>
          </Section>

          <Section title="3. Como usamos seus dados">
            <ul className="ml-5 list-disc space-y-1">
              <li>Conectar você a motoristas próximos e calcular rotas e tarifas.</li>
              <li>Garantir segurança (PIN, rastreamento, SOS, verificação de identidade).</li>
              <li>Processar pagamentos, reembolsos e prevenir fraudes.</li>
              <li>Enviar notificações operacionais (status da corrida) e, com seu consentimento, promocionais.</li>
              <li>Atender obrigações legais e responder autoridades competentes.</li>
            </ul>
          </Section>

          <Section title="4. Base legal (LGPD)">
            Tratamos dados com base em: execução de contrato, cumprimento de obrigação legal,
            legítimo interesse (segurança e prevenção a fraudes), consentimento (marketing e
            notificações promocionais) e proteção da vida (SOS).
          </Section>

          <Section title="5. Compartilhamento">
            Compartilhamos dados estritamente necessários com: (i) motoristas parceiros
            (nome, foto, telefone temporário, origem/destino); (ii) processadores de
            pagamento; (iii) provedores de infraestrutura em nuvem; (iv) autoridades
            mediante requisição legal. Não vendemos seus dados.
          </Section>

          <Section title="6. Armazenamento e segurança">
            Adotamos criptografia em trânsito (TLS) e em repouso, controle de acesso baseado
            em função (RBAC), Row-Level Security no banco de dados, auditoria de acessos e
            backups regulares. Apesar dos esforços, nenhum sistema é 100% imune a incidentes.
          </Section>

          <Section title="7. Retenção">
            Mantemos seus dados pelo tempo necessário às finalidades descritas e às
            obrigações legais (ex.: dados fiscais por 5 anos). Após esse período, os dados
            são anonimizados ou eliminados.
          </Section>

          <Section title="8. Seus direitos (Art. 18 LGPD)">
            Você pode, a qualquer tempo: confirmar a existência de tratamento, acessar,
            corrigir, anonimizar, portar, eliminar dados, revogar consentimento e se opor a
            tratamentos. Solicite pelo e-mail{" "}
            <a className="text-primary underline" href="mailto:privacidade@movvi.app">privacidade@movvi.app</a>.
          </Section>

          <Section title="9. Cookies e tecnologias similares">
            Utilizamos armazenamento local e cookies essenciais para manter sua sessão,
            preferências e segurança. Você pode limpar esses dados nas configurações do
            navegador, ciente de que isso pode afetar o funcionamento do app.
          </Section>

          <Section title="10. Crianças e adolescentes">
            A MOVVI DRIVE não se destina a menores de 18 anos. Não coletamos
            intencionalmente dados de crianças e adolescentes.
          </Section>

          <Section title="11. Transferência internacional">
            Alguns provedores de infraestrutura podem processar dados fora do Brasil. Nesses
            casos, exigimos garantias contratuais e técnicas compatíveis com a LGPD.
          </Section>

          <Section title="12. Alterações desta Política">
            Esta Política pode ser atualizada. Notificaremos mudanças relevantes pelo app ou
            por e-mail. Veja também os nossos{" "}
            <Link to="/passageiro/termos" className="text-primary underline">Termos de Uso</Link>.
          </Section>

          <Section title="13. Encarregado de Proteção de Dados (DPO)">
            Contato do Encarregado:{" "}
            <a className="text-primary underline" href="mailto:dpo@movvi.app">dpo@movvi.app</a>.
          </Section>
        </article>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-foreground">{title}</h2>
      <div className="text-sm text-muted-foreground">{children}</div>
    </section>
  );
}
