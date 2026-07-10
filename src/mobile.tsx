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

void bootstrap();
