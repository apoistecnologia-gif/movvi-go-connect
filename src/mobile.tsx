import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";

import "./styles.css";
import "./apois-motorista-theme.css";
import "./apois-ui-hardening-round4.css";
import "./apois-ui-hardening-round5.css";
import "./apois-ui-hardening-round6.css";
import "./apois-ui-hardening-round7.css";
import "./apois-ui-hardening-round8.css";
import { routeTree } from "virtual:mobile-route-tree";
import { startInstance } from "./start";
import { installMobileFetchProxy } from "./lib/mobileFetchProxy";
import { initNativeBridge } from "./lib/nativeBridge";
import {
  DefaultErrorComponent,
  DefaultNotFoundComponent,
} from "./components/routing/DefaultBoundaries";

if (typeof document !== "undefined") {
  document.documentElement.dataset.appRole = import.meta.env.VITE_APP_ROLE ?? "";
}

let reactMounted = false;
let fatalRendered = false;

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
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050607;color:#f8fafc;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <section style="width:100%;max-width:360px;text-align:center">
        <div style="margin:0 auto 18px;width:54px;height:4px;border-radius:999px;background:#f6be1c"></div>
        <h1 style="margin:0 0 10px;font-size:22px;line-height:1.15">Não foi possível abrir a APOIS</h1>
        <p style="margin:0 0 12px;color:#a1a1aa;font-size:14px;line-height:1.45">Verifique sua conexão e tente novamente.</p>
        <p style="margin:0 0 18px;color:#71717a;font-size:11px;line-height:1.4;word-break:break-word">${
          String(detail).replace(/[<>&]/g, "")
        }</p>
        <button style="width:100%;border:0;border-radius:16px;background:#f6be1c;color:#090a0b;font-weight:800;padding:14px 16px;font-size:15px" onclick="location.reload()">Tentar novamente</button>
      </section>
    </main>
  `;
}

function isRecoverableResourceEvent(ev: Event): boolean {
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
      if (isRecoverableResourceEvent(ev)) return;
      if (reactMounted) return;
      renderFatalBootstrapError(ev.error ?? new Error(String(ev.message || "erro")));
    },
    true,
  );
  window.addEventListener("unhandledrejection", (ev) => {
    try {
      console.error("[mobile] unhandledrejection", ev.reason);
    } catch {
      /* noop */
    }
    if (reactMounted) return;
    renderFatalBootstrapError(ev.reason ?? new Error("promise rejeitada"));
  });
}

async function bootstrap() {
  installMobileFetchProxy();
  try {
    initNativeBridge();
  } catch (err) {
    console.warn("[mobile] initNativeBridge falhou (seguindo mesmo assim)", err);
  }

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

  queueMicrotask(() => {
    reactMounted = true;
  });
}

void bootstrap().catch(renderFatalBootstrapError);