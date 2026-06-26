// Detecta ambientes de desenvolvimento/preview (localhost, iframes, previews).
// Usado apenas para fins de logging — NUNCA para fornecer cidades de exemplo
// como localização real do usuário.
export function isDevEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return true;
  try {
    const host = window.location.hostname;
    const inIframe = window.self !== window.top;
    const devHost =
      /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(host) ||
      /\.lovableproject\.com$/.test(host) ||
      /id-preview--/.test(host) ||
      /stackblitz|webcontainer|bolt\.new|gitpod|codespaces|csb\.app|stackblitz\.io/.test(
        host,
      );
    return devHost || inIframe;
  } catch {
    return false;
  }
}
