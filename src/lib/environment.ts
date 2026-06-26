// Detecta ambientes de desenvolvimento/preview onde a geolocalização
// frequentemente é simulada ou bloqueada pelo navegador.
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

// Localização de teste padrão (Petrolina/PE).
export const DEV_TEST_LOCATION = { lat: -9.3891, lng: -40.5027 };
export const DEV_TEST_LABEL = "Petrolina, PE (teste)";
