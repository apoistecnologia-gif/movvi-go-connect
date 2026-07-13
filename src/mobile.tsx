import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";

import "./styles.css";
import { routeTree } from "virtual:mobile-route-tree";
import { startInstance } from "./start";
import { installMobileFetchProxy } from "./lib/mobileFetchProxy";
import { initNativeBridge } from "./lib/nativeBridge";
import {
  DefaultErrorComponent,
  DefaultNotFoundComponent,
} from "./components/routing/DefaultBoundaries";

// Flags de ciclo de vida do bootstrap. Enquanto React não montou, qualquer erro
// global é considerado FATAL (tela branca real). Depois que a UI já montou,
// erros globais são apenas registrados — o React Error Boundary do próprio
// TanStack cuida de falhas em componentes; falhas de recursos, imagens ou
// network transitórias não devem substituir a aplicação inteira.
let reactMounted = false;
let fatalRendered = false;

/** Tela de recuperação — SEMPRE substitui tela branca. */
function renderFatalBootstrapError(error: unknown) {
  if (fatalRendered) return;
  fatalRendered = true;
  try {
    console.error("[mobile] falha crítica no bootstrap", error);
  } catch {
    /* noop */
  }
  const root = document.getElementById("root");
  if (!root) return;
  const detail = (() => {
    try {
      if (error instanceof Error) return error.message;
      if (typeof error === "string") return error;
      return JSON.stringify(error);
    } catch {
      return "erro desconhecido";
    }
  })();
  root.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#05070d;color:#f8fafc;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <section style="width:100%;max-width:360px;text-align:center">
        <h1 style="margin:0 0 10px;font-size:22px;line-height:1.15">Não foi possível abrir o MOVVI</h1>
        <p style="margin:0 0 12px;color:#94a3b8;font-size:14px;line-height:1.45">Verifique sua conexão e tente novamente.</p>
        <p style="margin:0 0 18px;color:#64748b;font-size:11px;line-height:1.4;word-break:break-word">${
          String(detail).replace(/[<>&]/g, "")
        }</p>
        <button style="width:100%;border:0;border-radius:12px;background:#ef4444;color:white;font-weight:700;padding:12px 16px;font-size:15px" onclick="location.reload()">Tentar novamente</button>
      </section>
    </main>
  `;
}

/** Distingue erro de recurso/imagem/rede recuperável de erro fatal de JS. */
function isRecoverableResourceEvent(ev: Event): boolean {
  // Errors em <img>, <script>, <link>, <video> etc. têm target ≠ window.
  const target = ev.target as EventTarget | null;
  if (target && target !== window && target instanceof Element) {
    return true;
  }
  return false;
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "error",
    (ev) => {
      try {
        console.error("[mobile] window.onerror", ev.error ?? ev.message);
      } catch {
        /* noop */
      }
      // Não substituir a UI por falhas de imagem/script/link.
      if (isRecoverableResourceEvent(ev)) return;
      // Depois que o React montou, o Error Boundary do TanStack cobre falhas
      // de render. Não sequestramos a tela aqui.
      if (reactMounted) return;
      renderFatalBootstrapError(ev.error ?? new Error(String(ev.message || "erro")));
    },
    true, // capture: para pegar erros de recurso (não borbulham na fase de bubble)
  );
  window.addEventListener("unhandledrejection", (ev) => {
    try {
      console.error("[mobile] unhandledrejection", ev.reason);
    } catch {
      /* noop */
    }
    if (reactMounted) return; // depois do mount, deixa o app decidir
    renderFatalBootstrapError(ev.reason ?? new Error("promise rejeitada"));
  });
}

async function bootstrap() {
  installMobileFetchProxy();
  // nativeBridge nesta etapa APENAS registra listeners passivos.
  // Permissões (push/geo) são pedidas depois da autenticação — ver
  // src/lib/nativeBridge.ts → requestPostAuthPermissions().
  try {
    initNativeBridge();
  } catch (err) {
    console.warn("[mobile] initNativeBridge falhou (seguindo mesmo assim)", err);
  }

  // createServerFn no SPA mobile usa apenas RPC remoto.
  try {
    (window as unknown as { __TSS_START_OPTIONS__?: unknown }).__TSS_START_OPTIONS__ =
      await startInstance.getOptions();
  } catch (err) {
    console.warn("[mobile] startInstance.getOptions falhou (seguindo com defaults)", err);
  }

  const queryClient = new QueryClient();
  const router = createRouter({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    routeTree: routeTree as any,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
    defaultNotFoundComponent: DefaultNotFoundComponent,
  });

  const root = document.getElementById("root");
  if (!root) throw new Error("Elemento #root não encontrado");

  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );

  // Assim que o React entrou no ciclo de render, marcamos como montado.
  // Um microtask garante que o primeiro commit já ocorreu.
  queueMicrotask(() => {
    reactMounted = true;
  });
}

void bootstrap().catch(renderFatalBootstrapError);
