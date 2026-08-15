// APOIS — Mobile Fetch Proxy
//
// Quando o app é empacotado com Capacitor (VITE_APP_ROLE=passageiro|motorista),
// o WebView carrega o SPA a partir de uma origem local (capacitor://localhost
// ou https://localhost). Como não existe servidor TanStack rodando dentro do
// APK, qualquer chamada a `createServerFn` (que faz POST em /_serverFn/<hash>)
// ou a server routes (/api/*) falharia com 404/network error.
//
// Este módulo intercepta `window.fetch` e reescreve URLs relativas de
// endpoints TanStack para o backend TanStack já publicado
// (https://movvi-go-connect.lovable.app). Faz isso APENAS em builds mobile;
// nos builds web o proxy é no-op, então nada muda no comportamento atual.
//
// Sessão Supabase continua funcionando: o cliente persiste tokens em
// localStorage do WebView e o middleware `attachSupabaseAuth` anexa o bearer
// nas chamadas RPC via header `Authorization`, que é copiado no fetch abaixo.
// Também setamos `credentials: 'include'` para preservar cookies caso alguma
// server route dependa disso (o servidor libera credenciais para as origens
// Capacitor via CORS em src/start.ts).

import { APP_ROLE } from "./appRole";

// Backend TanStack em produção (deploy Lovable).
// Se um dia o domínio publicado mudar, alterar aqui.
export const MOBILE_REMOTE_BASE = "https://movvi-go-connect.lovable.app";

// Prefixos de caminho que devem ser redirecionados para o backend remoto.
// - /_serverFn/*  → endpoints RPC do createServerFn
// - /api/         → server routes (webhooks, endpoints públicos)
const PROXY_PREFIXES = ["/_serverFn", "/api/"];

let installed = false;

export function isMobileRuntime(): boolean {
  return APP_ROLE === "passenger" || APP_ROLE === "driver";
}

function shouldProxyPath(path: string): boolean {
  return PROXY_PREFIXES.some((p) => path.startsWith(p));
}

function extractPath(url: string): string | null {
  if (url.startsWith("/")) return url;
  if (typeof window !== "undefined" && url.startsWith(window.location.origin)) {
    return url.slice(window.location.origin.length) || "/";
  }
  return null;
}

export function installMobileFetchProxy(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  if (!isMobileRuntime()) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      let originalUrl: string;
      if (typeof input === "string") originalUrl = input;
      else if (input instanceof URL) originalUrl = input.toString();
      else originalUrl = input.url;

      const path = extractPath(originalUrl);
      if (path && shouldProxyPath(path)) {
        const remoteUrl = MOBILE_REMOTE_BASE + path;

        // Se o caller passou um Request e sem init, precisamos reconstruir
        // o Request contra a nova URL para preservar body/headers/method.
        if (input instanceof Request && !init) {
          const cloned = new Request(remoteUrl, input);
          return originalFetch(cloned, { credentials: "include" });
        }

        const nextInit: RequestInit = {
          ...(init ?? {}),
          credentials: init?.credentials ?? "include",
        };
        return originalFetch(remoteUrl, nextInit);
      }
    } catch (err) {
      // Nunca quebrar o fetch por causa do proxy — se algo falhar, faz
      // fallback para o comportamento nativo.
      console.warn("[mobileFetchProxy] rewrite failed, falling through", err);
    }
    return originalFetch(input, init);
  };

  installed = true;
  console.info(
    `[mobileFetchProxy] active (role=${APP_ROLE}, remote=${MOBILE_REMOTE_BASE})`,
  );
}
