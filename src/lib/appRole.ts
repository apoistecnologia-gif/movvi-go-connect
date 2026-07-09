// MOVVI — App role (build-time flag).
//
// Fase 1 da separação dos aplicativos. Um único código-fonte, três "sabores"
// de build controlados por `VITE_APP_ROLE`:
//
//   - "passenger" → build do app MOVVI Passageiro (Play Store). Só expõe
//     rotas /passageiro/*. Menus/cards de motorista e admin são ocultados
//     e uma navegação acidental para essas áreas redireciona para o login
//     do passageiro.
//   - "driver"    → reservado para a Fase 2 (app do Motorista). Ainda não é
//     usado nesta fase, mas o tipo já existe para evitar retrabalho.
//   - "web"       → padrão. Site institucional + painel admin + fallback web.
//     Comportamento atual do projeto, sem restrições.
//
// Nada aqui altera regras de negócio, banco, autenticação, corridas,
// pagamentos ou notificações — apenas quais rotas ficam visíveis no bundle.

export type AppRole = "passenger" | "driver" | "web";

const RAW = (import.meta.env.VITE_APP_ROLE as string | undefined)?.toLowerCase().trim();

// Aceita aliases em português ("passageiro", "motorista") além dos canônicos.
export const APP_ROLE: AppRole =
  RAW === "passenger" || RAW === "passageiro"
    ? "passenger"
    : RAW === "driver" || RAW === "motorista"
      ? "driver"
      : "web";

export const isPassengerBuild = () => APP_ROLE === "passenger";
export const isDriverBuild = () => APP_ROLE === "driver";
export const isWebBuild = () => APP_ROLE === "web";

/** Rota inicial do bundle atual. Usada pelo `/` para redirecionar. */
export function defaultLandingPath(): string {
  if (APP_ROLE === "passenger") return "/passageiro/login";
  if (APP_ROLE === "driver") return "/motorista/login";
  return "/"; // web: mantém a tela institucional de escolha de perfil
}

/**
 * Retorna true se o pathname pertence a uma área que NÃO deve existir no
 * bundle atual. Usado como guarda de navegação no root layout.
 */
export function isForbiddenPath(pathname: string): boolean {
  if (APP_ROLE === "passenger") {
    return pathname.startsWith("/motorista") || pathname.startsWith("/admin");
  }
  if (APP_ROLE === "driver") {
    return pathname.startsWith("/passageiro") || pathname.startsWith("/admin");
  }
  return false;
}
