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
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(246,190,28,0.12),transparent_62%)]" />
      <div className="relative">
        <SettingsPageShell variant="driver">
          <div className="relative overflow-hidden rounded-[30px] border border-[#F6BE1C]/20 bg-gradient-to-br from-[#211A08] via-[#101214] to-[#08090A] p-1 shadow-[0_28px_78px_-42px_rgba(246,190,28,.8)]">
            <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#F6BE1C]/12 blur-3xl" />
            <div className="relative">
              <SettingsHero
                icon={ShieldCheck}
                title="Política de Privacidade"
                subtitle="Última atualização: 11 de agosto de 2026"
              />
            </div>
          </div>

          <article className="space-y-5 rounded-[28px] border border-white/[0.06] bg-[#0D0F11]/95 p-5 text-[14px] leading-relaxed text-zinc-300 shadow-[0_26px_70px_-44px_rgba(0,0,0,.95)] backdrop-blur-sm sm:p-6">
            <section className="rounded-[20px] border border-white/5 bg-[#101214] p-4">
              <h2 className="mb-2 text-base font-black text-white">Dados tratados</h2>
              <p className="text-zinc-400">
                A APOIS trata os dados necessários para operar o serviço de mobilidade e o cadastro do motorista,
                incluindo nome, e-mail, telefone, CPF, CNH, documentos, fotografia, dados do veículo, informações
                de verificação cadastral, corridas, avaliações, notificações, suporte, ganhos, carteira, pagamentos e repasses.
              </p>
            </section>

            <section className="rounded-[20px] border border-white/5 bg-[#101214] p-4">
              <h2 className="mb-2 text-base font-black text-white">Localização</h2>
              <p className="text-zinc-400">
                A localização aproximada e/ou precisa é utilizada para disponibilidade operacional, recebimento de ofertas,
                navegação, chegada ao embarque, acompanhamento de corridas e recursos de segurança. Quando o motorista está
                online e disponível para receber corridas ou executando uma corrida, a localização pode continuar sendo
                processada em segundo plano por meio do serviço de localização do Android. O rastreamento operacional é
                encerrado quando o motorista fica offline, encerra a sessão ou deixa de existir finalidade operacional para a coleta.
              </p>
            </section>

            <section className="rounded-[20px] border border-white/5 bg-[#101214] p-4">
              <h2 className="mb-2 text-base font-black text-white">Finalidades e fornecedores</h2>
              <p className="text-zinc-400">
                Os dados são utilizados para autenticação, verificação cadastral, despacho de corridas, navegação, segurança,
                prevenção a fraude, suporte, pagamentos e repasses. Para prestar esses serviços, a APOIS pode utilizar operadores
                de infraestrutura, banco de dados, mapas, geolocalização, notificações e pagamentos, incluindo tecnologias como
                Supabase, Google Maps/Google Places, Firebase Cloud Messaging e serviços nativos Android/Capacitor.
              </p>
            </section>

            <section className="rounded-[20px] border border-white/5 bg-[#101214] p-4">
              <h2 className="mb-2 text-base font-black text-white">Retenção e exclusão</h2>
              <p className="text-zinc-400">
                O motorista pode solicitar a exclusão da conta dentro do aplicativo. Após a solicitação válida, dados pessoais
                são excluídos ou anonimizados quando possível. Registros de corridas, pagamentos, repasses, segurança, auditoria,
                prevenção a fraude ou cumprimento de obrigação legal podem ser preservados pelo período juridicamente necessário,
                com minimização ou anonimização quando aplicável.
              </p>
            </section>

            <section className="rounded-[20px] border border-white/5 bg-[#101214] p-4">
              <h2 className="mb-2 text-base font-black text-white">Direitos do titular</h2>
              <p className="text-zinc-400">
                O titular pode solicitar confirmação de tratamento, acesso, correção e, quando cabível, anonimização, bloqueio
                ou exclusão dos seus dados pessoais, observadas as hipóteses legais de retenção.
              </p>
            </section>

            <div className="space-y-2 border-t border-white/8 pt-4">
              <a
                href="https://apoisbrasil.com.br/privacidade"
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 items-center justify-between gap-3 rounded-[18px] border border-[#F6BE1C]/18 bg-[#F6BE1C]/8 px-4 font-bold text-[#F6BE1C] transition active:scale-[0.99]"
              >
                <span>Ver Política de Privacidade pública</span><ExternalLink className="h-4 w-4 shrink-0" />
              </a>
              <a
                href="https://apoisbrasil.com.br/excluir-conta"
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-[#111315] px-4 font-bold text-zinc-200 transition active:scale-[0.99]"
              >
                <span>Solicitar exclusão fora do aplicativo</span><ExternalLink className="h-4 w-4 shrink-0 text-[#F6BE1C]" />
              </a>
            </div>
          </article>
        </SettingsPageShell>
      </div>
    </div>
  );
}
