// ────────────────────────────────────────────────────────────────────────────
// MOVVI — Modo desenvolvedor global
//
// DEV_MODE controla TODA a interface de diagnóstico do app (banners de
// ambiente de teste, painel de GPS, métricas técnicas, link para
// /dev-diagnostics etc.). Em produção mantenha `false` — a interface
// fica totalmente limpa e apenas o console registra logs.
// ────────────────────────────────────────────────────────────────────────────
export const DEV_MODE = false;
/** Alias em português — mesma constante, mesmo comportamento. */
export const MODO_DESENVOLVIMENTO = DEV_MODE;

// ────────────────────────────────────────────────────────────────────────────
// MOVVI — Detecção de ambiente
//
// REGRA DE OURO:
//   • Em DESENVOLVIMENTO/PREVIEW (editor Lovable, localhost, sandbox, iframe)
//     o app habilita o "Modo Desenvolvedor": NUNCA dispara GPS real automático
//     e permite definir uma origem manual de teste.
//   • Em PRODUÇÃO (URL publicada acessada diretamente, custom domain) o app
//     usa o fluxo real: pede permissão de localização e usa o GPS do aparelho.
//
// O modo desenvolvedor NUNCA pode substituir o GPS real em produção.
// ────────────────────────────────────────────────────────────────────────────

const DEV_HOST_REGEX =
  /(^|\.)lovableproject\.com$|^id-preview--|^localhost$|^127\.0\.0\.1$|^0\.0\.0\.0$|stackblitz|webcontainer|bolt\.new|gitpod|codespaces|csb\.app|stackblitz\.io/;

/**
 * Fonte única de verdade para distinguir DEV/PREVIEW vs PRODUÇÃO.
 *
 * Considera DEV quando QUALQUER uma destas condições é verdadeira:
 *   1. `import.meta.env.DEV` (build de desenvolvimento)
 *   2. Host é um sandbox/preview conhecido (lovableproject.com, id-preview--*, localhost, etc.)
 *   3. Página está sendo renderizada dentro de um iframe (preview do editor Lovable)
 *
 * O domínio publicado (`project--<id>.lovable.app` aberto diretamente, ou um
 * custom domain) NÃO satisfaz nenhuma das condições → retorna `false` → PRODUÇÃO.
 */
export function isDevelopmentEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return true;
  try {
    const host = window.location.hostname;
    if (DEV_HOST_REGEX.test(host)) return true;
    if (window.self !== window.top) return true; // preview iframe
    return false;
  } catch {
    return false;
  }
}

/** Alias legado — mantém compatibilidade com chamadas antigas. */
export const isDevEnvironment = isDevelopmentEnvironment;

export type EnvironmentDiagnostics = {
  mode: "development" | "production";
  hostname: string;
  href: string;
  inIframe: boolean;
  isSecureContext: boolean;
  protocol: string;
  userAgent: string;
  viteDev: boolean;
};

/** Snapshot do ambiente atual para a tela de diagnóstico (somente DEV). */
export function getEnvironmentDiagnostics(): EnvironmentDiagnostics {
  const dev = isDevelopmentEnvironment();
  if (typeof window === "undefined") {
    return {
      mode: dev ? "development" : "production",
      hostname: "",
      href: "",
      inIframe: false,
      isSecureContext: false,
      protocol: "",
      userAgent: "",
      viteDev: !!import.meta.env.DEV,
    };
  }
  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  return {
    mode: dev ? "development" : "production",
    hostname: window.location.hostname,
    href: window.location.href,
    inIframe,
    isSecureContext: !!window.isSecureContext,
    protocol: window.location.protocol,
    userAgent: window.navigator.userAgent,
    viteDev: !!import.meta.env.DEV,
  };
}
