import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";

import "./styles.css";
import "./apois-admin-theme.css";
import { routeTree } from "./routeTree.gen";
import { startInstance } from "./start";
import {
  DefaultErrorComponent,
  DefaultNotFoundComponent,
} from "./components/routing/DefaultBoundaries";

async function bootstrap() {
  (window as unknown as { __TSS_START_OPTIONS__?: unknown }).__TSS_START_OPTIONS__ =
    await startInstance.getOptions();

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
}

void bootstrap();
