import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/passageiro/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — MOVVI DRIVE" },
      { name: "description", content: "Termos de Uso da plataforma MOVVI DRIVE." },
    ],
  }),
  component: TermosPage,
});

function TermosPage() {
  const router = useRouter();
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
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Termos de Uso</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-6 pb-24">
        <p className="mb-6 text-xs text-muted-foreground">
          Última atualização: 28 de junho de 2026
        </p>

        <article className="prose prose-invert max-w-none space-y-5 text-sm leading-relaxed text-foreground/90">
          <Section title="1. Aceitação dos Termos">
            Ao criar uma conta, acessar ou utilizar o aplicativo MOVVI DRIVE ("Plataforma"),
            você ("Usuário") declara ter lido, compreendido e concordado integralmente com
            estes Termos de Uso, com a Política de Privacidade e com as demais políticas
            disponibilizadas na Plataforma. Caso não concorde, não utilize o serviço.
          </Section>

          <Section title="2. Descrição do Serviço">
            A MOVVI DRIVE é uma plataforma tecnológica de intermediação que conecta
            passageiros a motoristas parceiros independentes para a contratação de viagens
            urbanas sob demanda em todo o território brasileiro. A MOVVI não presta serviço
            de transporte: atua exclusivamente como provedora de tecnologia.
          </Section>

          <Section title="3. Cadastro e Conta">
            O Usuário se compromete a fornecer dados verdadeiros, completos e atualizados.
            É vedado o uso por menores de 18 anos sem assistência. A conta é pessoal e
            intransferível; o Usuário é responsável por toda atividade realizada com suas
            credenciais. A MOVVI poderá suspender ou encerrar contas que apresentem dados
            falsos, fraude, comportamento abusivo ou descumprimento destes Termos.
          </Section>

          <Section title="4. Uso da Plataforma">
            O Usuário concorda em (i) respeitar motoristas, demais passageiros e terceiros;
            (ii) não portar objetos ilícitos, perigosos ou perecíveis sem autorização;
            (iii) não danificar veículos; (iv) não utilizar a Plataforma para qualquer
            finalidade ilegal; e (v) cumprir as regras de trânsito e segurança aplicáveis.
          </Section>

          <Section title="5. Tarifas, Pagamentos e Cancelamentos">
            As tarifas são calculadas dinamicamente com base em distância, tempo estimado,
            categoria escolhida, demanda e tributos aplicáveis, sendo exibidas antes da
            confirmação da corrida. Cancelamentos após o aceite do motorista poderão gerar
            cobrança simbólica conforme política vigente. Promoções e cupons estão sujeitos
            a regras específicas divulgadas no momento da oferta.
          </Section>

          <Section title="6. Código de Segurança (PIN)">
            Para sua proteção, a MOVVI gera um PIN de 4 dígitos a cada corrida. O passageiro
            deve informá-lo ao motorista para autorizar o início da viagem, confirmando o
            embarque no veículo correto.
          </Section>

          <Section title="7. Avaliações e Conduta">
            Passageiros e motoristas podem se avaliar mutuamente ao final de cada corrida.
            Avaliações ofensivas, falsas ou abusivas poderão ser removidas e ensejar
            penalidades. A MOVVI investiga denúncias graves em até 24 horas úteis.
          </Section>

          <Section title="8. Responsabilidades">
            A MOVVI envida seus melhores esforços para manter a Plataforma disponível, segura
            e funcional, mas não garante disponibilidade ininterrupta. Não nos
            responsabilizamos por: (i) condutas de motoristas parceiros, que são profissionais
            autônomos; (ii) falhas de conexão, GPS, energia ou de serviços de terceiros;
            (iii) danos indiretos, lucros cessantes ou perda de oportunidade.
          </Section>

          <Section title="9. Propriedade Intelectual">
            Todo o conteúdo, marcas, logotipos, layouts, software e bases de dados da
            Plataforma pertencem à MOVVI Tecnologia ou a seus licenciadores, sendo vedada
            qualquer reprodução, modificação, engenharia reversa ou uso comercial sem
            autorização prévia e por escrito.
          </Section>

          <Section title="10. Privacidade e Dados Pessoais">
            O tratamento de dados pessoais é regido pela nossa{" "}
            <Link to="/passageiro/privacidade" className="text-primary underline">
              Política de Privacidade
            </Link>
            , em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
          </Section>

          <Section title="11. Alterações dos Termos">
            A MOVVI poderá alterar estes Termos a qualquer tempo, mediante aviso na própria
            Plataforma. O uso continuado após as alterações implica concordância com a nova
            versão. Recomendamos a revisão periódica deste documento.
          </Section>

          <Section title="12. Encerramento">
            O Usuário pode encerrar sua conta a qualquer momento pelo menu de Perfil. A MOVVI
            poderá encerrar ou suspender o acesso de Usuários que violem estes Termos, a
            legislação aplicável ou ameacem a segurança da comunidade.
          </Section>

          <Section title="13. Legislação e Foro">
            Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica
            eleito o foro da comarca do domicílio do Usuário para dirimir quaisquer
            controvérsias, ressalvada a competência de juizados especiais quando aplicável.
          </Section>

          <Section title="14. Contato">
            Dúvidas, sugestões ou solicitações: <a className="text-primary underline" href="mailto:suporte@movvi.app">suporte@movvi.app</a>.
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
      <p className="text-sm text-muted-foreground">{children}</p>
    </section>
  );
}
