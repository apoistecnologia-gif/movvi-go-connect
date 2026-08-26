// ────────────────────────────────────────────────────────────────────────────
// APOIS — Modo desenvolvedor global
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
// APOIS — Detecção de ambiente
//
// REGRA DE OURO:
//   • Em DESENVOLVIMENTO/PREVIEW (build DEV ou host de sandbox conhecido)
//     o app habilita o "Modo Desenvolvedor": NUNCA dispara GPS real automático
//     e permite definir uma origem manual de teste.
//   • Em PRODUÇÃO (URL publicada ou custom domain), inclusive quando embutida
//     em um iframe de terceiro, o app continua em modo real.
//
// O modo desenvolvedor NUNCA pode substituir o GPS real em produção.
// ────────────────────────────────────────────────────────────────────────────

const DEV_HOST_REGEX =
  /(^|\.)lovableproject\.com$|^id-preview--|^localhost$|^127\.0\.0\.1$|^0\.0\.0\.0$|(^|\.)stackblitz\.com$|(^|\.)stackblitz\.io$|(^|\.)webcontainer\.io$|(^|\.)bolt\.new$|(^|\.)gitpod\.io$|(^|\.)githubpreview\.dev$|(^|\.)app\.github\.dev$|(^|\.)csb\.app$/i;

function normalizedHostname() {
  if (typeof window === "undefined") return "";
  return String(window.location.hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
}

/**
 * Fonte única de verdade para distinguir DEV/PREVIEW vs PRODUÇÃO.
 *
 * Considera DEV somente quando uma destas condições confiáveis é verdadeira:
 *   1. `import.meta.env.DEV` (build de desenvolvimento);
 *   2. o hostname pertence a uma lista explícita de sandbox/preview conhecido.
 *
 * Estar dentro de iframe NÃO é prova de ambiente de desenvolvimento. Um domínio
 * de produção pode ser incorporado por terceiros, e tratá-lo como DEV abriria
 * superfícies de diagnóstico e alteraria o comportamento de GPS indevidamente.
 */
export function isDevelopmentEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return true;
  try {
    const host = normalizedHostname();
    if (!host) return false;
    return DEV_HOST_REGEX.test(host);
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
    // Cross-origin frame access can throw. This is diagnostic metadata only and
    // must never promote the application to development mode.
    inIframe = true;
  }
  return {
    mode: dev ? "development" : "production",
    hostname: normalizedHostname(),
    href: String(window.location.href ?? ""),
    inIframe,
    isSecureContext: window.isSecureContext === true,
    protocol: String(window.location.protocol ?? ""),
    userAgent: String(window.navigator?.userAgent ?? ""),
    viteDev: !!import.meta.env.DEV,
  };
}
