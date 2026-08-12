import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { SettingsPageShell, SettingsHero } from "@/components/settings";

export const Route = createFileRoute("/motorista/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — APOIS Motorista" },
      {
        name: "description",
        content: "Política de Privacidade do APOIS Motorista em conformidade com a LGPD.",
      },
    ],
  }),
  component: PrivacidadeMotoristaPage,
});

function PrivacidadeMotoristaPage() {
  return (
    <SettingsPageShell variant="driver">
      <SettingsHero
        icon={ShieldCheck}
        title="Política de Privacidade"
        subtitle="Última atualização: 11 de agosto de 2026"
      />

      <article className="space-y-5 rounded-[24px] bg-white p-6 text-[14px] leading-relaxed text-[#1B1B1B] shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
        <section>
          <h2 className="mb-2 text-base font-bold">Dados tratados</h2>
          <p>
            A APOIS trata os dados necessários para operar o serviço de mobilidade e o cadastro do motorista,
            incluindo nome, e-mail, telefone, CPF, CNH, documentos, fotografia, dados do veículo, informações
            de verificação cadastral, corridas, avaliações, notificações, suporte, ganhos, carteira, pagamentos e repasses.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">Localização</h2>
          <p>
            A localização aproximada e/ou precisa é utilizada para disponibilidade operacional, recebimento de ofertas,
            navegação, chegada ao embarque, acompanhamento de corridas e recursos de segurança. Quando o motorista está
            online e disponível para receber corridas ou executando uma corrida, a localização pode continuar sendo
            processada em segundo plano por meio do serviço de localização do Android. O rastreamento operacional é
            encerrado quando o motorista fica offline, encerra a sessão ou deixa de existir finalidade operacional para a coleta.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">Finalidades e fornecedores</h2>
          <p>
            Os dados são utilizados para autenticação, verificação cadastral, despacho de corridas, navegação, segurança,
            prevenção a fraude, suporte, pagamentos e repasses. Para prestar esses serviços, a APOIS pode utilizar operadores
            de infraestrutura, banco de dados, mapas, geolocalização, notificações e pagamentos, incluindo tecnologias como
            Supabase, Google Maps/Google Places, Firebase Cloud Messaging e serviços nativos Android/Capacitor.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">Retenção e exclusão</h2>
          <p>
            O motorista pode solicitar a exclusão da conta dentro do aplicativo. Após a solicitação válida, dados pessoais
            são excluídos ou anonimizados quando possível. Registros de corridas, pagamentos, repasses, segurança, auditoria,
            prevenção a fraude ou cumprimento de obrigação legal podem ser preservados pelo período juridicamente necessário,
            com minimização ou anonimização quando aplicável.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">Direitos do titular</h2>
          <p>
            O titular pode solicitar confirmação de tratamento, acesso, correção e, quando cabível, anonimização, bloqueio
            ou exclusão dos seus dados pessoais, observadas as hipóteses legais de retenção.
          </p>
        </section>

        <div className="space-y-2 border-t border-black/10 pt-4">
          <a
            href="https://apoisbrasil.com.br/privacidade"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 font-semibold text-primary underline underline-offset-4"
          >
            Ver Política de Privacidade pública <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href="https://apoisbrasil.com.br/excluir-conta"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 font-semibold text-primary underline underline-offset-4"
          >
            Solicitar exclusão fora do aplicativo <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </article>
    </SettingsPageShell>
  );
}
