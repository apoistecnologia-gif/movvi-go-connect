// Shared help-center content for APOIS Support module.
// UI-only strings — no business logic, no PII.

import {
  User, Car, CreditCard, ShieldAlert, Wallet, FileCheck2, Smartphone,
  type LucideIcon,
} from "lucide-react";

export type HelpSection = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export const HELP_SECTIONS: HelpSection[] = [
  { id: "account", title: "Conta", description: "Cadastro, login, dados pessoais e recuperação de acesso.", icon: User },
  { id: "rides", title: "Corridas", description: "Solicitação, andamento, cancelamento e avaliação.", icon: Car },
  { id: "payments", title: "Pagamentos", description: "Formas de pagamento, valores e comprovantes.", icon: CreditCard },
  { id: "safety", title: "Segurança", description: "SOS, contatos de emergência e compartilhamento de corrida.", icon: ShieldAlert },
  { id: "subscription", title: "Assinatura do motorista", description: "Planos, cobrança e status da assinatura.", icon: Wallet },
  { id: "documents", title: "Documentos", description: "Envio, aprovação e renovação de documentos.", icon: FileCheck2 },
  { id: "app", title: "Problemas no app", description: "Erros, travamentos, permissões e localização.", icon: Smartphone },
];

export type Faq = { q: string; a: string };

export const PASSENGER_FAQ: Faq[] = [
  { q: "Como solicito uma corrida?", a: "Na tela inicial, defina origem e destino e toque em Solicitar corrida. O sistema busca motoristas próximos automaticamente." },
  { q: "Como funciona o código de segurança (PIN)?", a: "Ao aceitar a corrida, o app gera um PIN de 4 dígitos. Informe-o ao motorista para que ele possa iniciar a viagem." },
  { q: "Como avalio o motorista?", a: "Ao finalizar a corrida, dê de 1 a 5 estrelas e, se quiser, deixe um comentário. A avaliação pode ser feita apenas uma vez por corrida." },
  { q: "Esqueci um objeto no carro. E agora?", a: "Abra um ticket em 'Problema com corrida' informando data, motorista (se lembrar) e descrição do item." },
  { q: "Posso cancelar uma corrida?", a: "Sim, antes do motorista chegar. Cancelamentos após o início podem gerar cobrança simbólica conforme política da APOIS." },
  { q: "Como funciona o pagamento?", a: "O pagamento é acertado diretamente com o motorista. O app apenas mostra o valor sugerido da corrida." },
  { q: "Como uso o botão SOS?", a: "Durante uma corrida ativa, o botão SOS aparece no painel de segurança e permite ligar para o 190 ou compartilhar sua localização." },
];

export const DRIVER_FAQ: Faq[] = [
  { q: "Como funciona a assinatura APOIS?", a: "A assinatura mensal libera o recebimento de corridas. Cobranças e status são gerenciados na tela de Assinatura." },
  { q: "Minha assinatura venceu, o que faço?", a: "Acesse 'Assinatura' no menu, gere um novo pagamento e aguarde a confirmação para voltar a receber corridas." },
  { q: "Como envio meus documentos?", a: "Em 'Status do cadastro', envie CNH, foto do veículo e demais documentos solicitados. A análise leva até 48h úteis." },
  { q: "Como recebo o pagamento das corridas?", a: "O pagamento é feito diretamente pelo passageiro. A APOIS não intermedia valores de corrida." },
  { q: "Como recuso uma corrida?", a: "Na tela de oferta, toque em Recusar. Recusas excessivas podem afetar sua taxa de aceitação." },
  { q: "Como ficar online?", a: "Ative o botão 'Ficar online' na tela inicial. Você precisa estar com localização ativa e assinatura em dia." },
  { q: "Como reporto um problema com passageiro?", a: "Abra um ticket em 'Problema com passageiro' descrevendo o ocorrido. Casos graves são analisados em até 24h." },
];

export type SupportCategory = { value: string; label: string };

export const PASSENGER_CATEGORIES: SupportCategory[] = [
  { value: "ride_issue", label: "Problema com corrida" },
  { value: "driver_issue", label: "Problema com motorista" },
  { value: "payment", label: "Forma de pagamento" },
  { value: "safety", label: "Segurança" },
  { value: "app_bug", label: "Erro no app" },
  { value: "account", label: "Conta" },
  { value: "other", label: "Outro" },
];

export const DRIVER_CATEGORIES: SupportCategory[] = [
  { value: "subscription", label: "Assinatura" },
  { value: "ride_issue", label: "Problema com corrida" },
  { value: "passenger_issue", label: "Problema com passageiro" },
  { value: "documents", label: "Aprovação de documentos" },
  { value: "payment", label: "Pagamento com passageiro" },
  { value: "app_bug", label: "Erro no app" },
  { value: "account", label: "Conta" },
  { value: "other", label: "Outro" },
];
