import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import "../apois-ui-hardening-round3.css";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider, THEME_INIT_SCRIPT } from "../lib/theme";
import { MapThemeProvider } from "../lib/mapTheme";
import { NotificationPermissionPrompt } from "../components/notifications/NotificationPermissionPrompt";
import { APP_ROLE, isForbiddenPath, defaultLandingPath } from "../lib/appRole";
import { installMobileFetchProxy } from "../lib/mobileFetchProxy";
import { initNativeBridge } from "../lib/nativeBridge";
import { DriverPresenceKeeper } from "../components/DriverPresenceKeeper";
import { DriverNativePermissionsSync } from "../components/DriverNativePermissionsSync";
import { DriverPasswordRecoveryBridge } from "../components/DriverPasswordRecoveryBridge";
import { supabase } from "../integrations/supabase/client";

if (typeof window !== "undefined") {
  try {
    installMobileFetchProxy();
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[APOIS] falha ao instalar proxy mobile", error);
  }
  try {
    initNativeBridge();
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[APOIS] falha ao iniciar bridge nativa", error);
  }
}

function NotFoundComponent() {
  return (
    <main className="flex min-h-dvh min-w-0 items-center justify-center overflow-x-hidden bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="min-w-0 max-w-md text-center">
        <p className="font-display text-6xl font-bold text-primary sm:text-7xl" aria-hidden="true">
          404
        </p>
        <h1 className="mt-4 break-words text-xl font-semibold text-foreground">Página não encontrada</h1>
        <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
          O endereço solicitado não existe na plataforma APOIS.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary-glow focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    try {
      reportLovableError(error, { boundary: "tanstack_root_error_component" });
    } catch (reportError) {
      if (import.meta.env.DEV) console.warn("[APOIS] falha ao reportar erro da aplicação", reportError);
    }
    if (import.meta.env.DEV) console.error(error);
    return () => {
      aliveRef.current = false;
    };
  }, [error]);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await router.invalidate();
      if (!aliveRef.current) return;
      reset();
    } catch (cause) {
      if (!aliveRef.current) return;
      setRetryError("Não foi possível recarregar a página agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS] falha ao recuperar boundary", cause);
    } finally {
      if (aliveRef.current) setRetrying(false);
    }
  }

  return (
    <main className="flex min-h-dvh min-w-0 items-center justify-center overflow-x-hidden bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="min-w-0 max-w-md text-center">
        <h1 className="break-words text-xl font-semibold tracking-tight text-foreground">
          Algo deu errado
        </h1>
        <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
          Não conseguimos carregar esta página. Tente novamente em instantes.
        </p>
        {retryError ? (
          <p className="mt-3 break-words text-sm text-destructive" role="alert">
            {retryError}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying}
            aria-busy={retrying}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary-glow focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
          >
            {retrying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : null}
            {retrying ? "Tentando…" : "Tentar novamente"}
          </button>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            Início
          </Link>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#05070D" },
      { title: "APOIS — Mobilidade que move você" },
      {
        name: "description",
        content:
          "Plataforma de mobilidade urbana APOIS. Carros, motos, fretes, guincho e envios em todo o Brasil.",
      },
      { name: "author", content: "APOIS" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "APOIS" },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  if (APP_ROLE !== "web") return <>{children}</>;

  return (
    <html lang="pt-BR" className="dark" style={{ colorScheme: "dark" }}>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-w-0 overflow-x-hidden bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    if (APP_ROLE === "web") return;
    let redirecting = false;
    const ensureAllowedPath = (pathname: string) => {
      if (!isForbiddenPath(pathname) || redirecting) return;
      redirecting = true;
      void router
        .navigate({ to: defaultLandingPath(), replace: true })
        .catch((error) => {
          if (import.meta.env.DEV) console.warn("[APOIS] falha ao redirecionar rota proibida", error);
        })
        .finally(() => {
          redirecting = false;
        });
    };
    const unsub = router.subscribe("onBeforeNavigate", ({ toLocation }) => {
      ensureAllowedPath(toLocation.pathname);
    });
    ensureAllowedPath(router.state.location.pathname);
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (APP_ROLE !== "driver") return;
    let cancelled = false;
    let redirecting = false;

    const enterDriverAppWhenAuthenticated = (hasSession: boolean) => {
      if (!hasSession || cancelled || redirecting) return;
      const pathname = router.state.location.pathname;
      if (pathname !== "/" && pathname !== "/motorista/login") return;
      redirecting = true;
      void router
        .navigate({ to: "/motorista/app", replace: true })
        .catch((error) => {
          if (import.meta.env.DEV) console.warn("[APOIS MOTORISTA] falha ao abrir app autenticado", error);
        })
        .finally(() => {
          redirecting = false;
        });
    };

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          if (import.meta.env.DEV) {
            console.warn("[APOIS MOTORISTA] não foi possível restaurar a sessão", error);
          }
          return;
        }
        enterDriverAppWhenAuthenticated(Boolean(data.session));
      })
      .catch((error) => {
        if (!cancelled && import.meta.env.DEV) {
          console.warn("[APOIS MOTORISTA] falha inesperada ao restaurar sessão", error);
        }
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      enterDriverAppWhenAuthenticated(Boolean(session));
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MapThemeProvider>
          {APP_ROLE === "driver" ? <DriverNativePermissionsSync /> : null}
          {APP_ROLE === "driver" ? <DriverPresenceKeeper /> : null}
          {APP_ROLE === "driver" ? <DriverPasswordRecoveryBridge /> : null}
          <Outlet />
          {APP_ROLE === "web" ? <NotificationPermissionPrompt /> : null}
          <Toaster richColors position="top-right" closeButton />
        </MapThemeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
