import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";

import "./styles.css";
import { routeTree } from "./mobile-route-tree";
import { startInstance } from "./start";
import { installMobileFetchProxy } from "./lib/mobileFetchProxy";
import { initNativeBridge } from "./lib/nativeBridge";
import {
  DefaultErrorComponent,
  DefaultNotFoundComponent,
} from "./components/routing/DefaultBoundaries";

function renderFatalBootstrapError(error: unknown) {
  console.error("[mobile] falha crítica no bootstrap", error);
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#05070d;color:#f8fafc;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <section style="width:100%;max-width:360px;text-align:center">
        <h1 style="margin:0 0 10px;font-size:22px;line-height:1.15">Não foi possível abrir o MOVVI</h1>
        <p style="margin:0 0 18px;color:#94a3b8;font-size:14px;line-height:1.45">Verifique sua conexão e tente novamente.</p>
        <button style="width:100%;border:0;border-radius:12px;background:#ef4444;color:white;font-weight:700;padding:12px 16px" onclick="location.reload()">Tentar novamente</button>
      </section>
    </main>
  `;
}

async function bootstrap() {
  installMobileFetchProxy();
  initNativeBridge();

  // createServerFn no SPA mobile usa apenas RPC remoto; as opções precisam
  // estar disponíveis no cliente antes de qualquer chamada.
  (window as any).__TSS_START_OPTIONS__ = await startInstance.getOptions();

  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
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
}

void bootstrap().catch(renderFatalBootstrapError);
