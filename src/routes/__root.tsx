import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
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
import { loadDriverProfile } from "../lib/driverProfile";

const DRIVER_ONBOARDING_PATHS = new Set([
  "/motorista/cadastro",
  "/motorista/recuperar-senha",
  "/motorista/redefinir-senha",
  "/motorista/termos",
  "/motorista/privacidade",
]);

// Ativa o proxy de rede quando rodando dentro do APK (Capacitor).
// No build web isso é no-op. Precisa rodar antes de qualquer serverFn
// disparar — por isso é executado em module scope, com guarda de window.
if (typeof window !== "undefined") {
  installMobileFetchProxy();
  initNativeBridge();
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço solicitado não existe na plataforma APOIS.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-glow"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Algo deu errado
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Não conseguimos carregar esta página. Tente novamente em instantes.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-glow"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#05070D" },
      { title: "APOIS — Mobilidade que move você" },
      { name: "description", content: "Plataforma de mobilidade urbana APOIS. Carros, motos, fretes, guincho e envios em todo o Brasil." },
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
  // O build mobile já possui <html>, <head> e <body> em index.mobile.html.
  // A shell documental completa é necessária apenas no build web/SSR.
  if (APP_ROLE !== "web") return <>{children}</>;

  return (
    <html lang="pt-BR" className="dark" style={{ colorScheme: "dark" }}>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [driverRuntimeAllowed, setDriverRuntimeAllowed] = useState(APP_ROLE !== "driver");

  // Fase 1 — guarda de bundle por papel (VITE_APP_ROLE).
  // No build "passenger" e "driver", qualquer tentativa de navegar para
  // áreas fora do escopo do app (ex.: /motorista/*, /admin/*) é redirecionada
  // para a landing padrão daquele bundle. No build "web" (padrão) nada muda.
  useEffect(() => {
    if (APP_ROLE === "web") return;
    const unsub = router.subscribe("onBeforeNavigate", ({ toLocation }) => {
      if (isForbiddenPath(toLocation.pathname)) {
        router.navigate({ to: defaultLandingPath(), replace: true });
      }
    });
    // Checa também a rota inicial (deep-link direto).
    if (isForbiddenPath(router.state.location.pathname)) {
      router.navigate({ to: defaultLandingPath(), replace: true });
    }
    return () => unsub();
  }, [router]);

  // O Supabase compartilha a identidade autenticada entre apps. Uma sessão
  // válida, porém, NÃO concede o papel de motorista. Antes de restaurar o
  // runtime do APK Motorista confirmamos server-side a existência do perfil
  // Driver. Apenas as rotas de onboarding podem existir sem esse perfil.
  useEffect(() => {
    if (APP_ROLE !== "driver") return;
    let cancelled = false;
    let verificationSequence = 0;

    const verifyDriverSession = async (hasSession: boolean) => {
      const verificationId = ++verificationSequence;
      if (!hasSession || cancelled) {
        if (!cancelled) setDriverRuntimeAllowed(false);
        return;
      }

      const profileResult = await loadDriverProfile();
      if (cancelled || verificationId !== verificationSequence) return;

      const pathname = router.state.location.pathname;
      if (!profileResult.ok) {
        setDriverRuntimeAllowed(false);

        // Cadastro e recuperação precisam poder usar uma sessão Auth antes de
        // existir a entidade Driver. Nenhuma outra área do Motorista é liberada.
        if (DRIVER_ONBOARDING_PATHS.has(pathname)) return;

        try {
          await supabase.auth.signOut();
        } catch {
          // Mesmo se o signOut remoto falhar, o runtime do Motorista continua negado.
        }
        if (!cancelled && pathname !== "/motorista/login") {
          void router.navigate({ to: "/motorista/login", replace: true });
        }
        return;
      }

      setDriverRuntimeAllowed(true);
      if (pathname === "/" || pathname === "/motorista/login") {
        const destination =
          profileResult.profile.approval_status === "aprovado"
            ? "/motorista/app"
            : "/motorista/status";
        void router.navigate({ to: destination, replace: true });
      }
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setDriverRuntimeAllowed(false);
        console.warn("[APOIS MOTORISTA] não foi possível restaurar a sessão:", error.message);
        return;
      }
      void verifyDriverSession(Boolean(data.session));
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void verifyDriverSession(Boolean(session));
    });

    return () => {
      cancelled = true;
      verificationSequence += 1;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MapThemeProvider>
          {APP_ROLE === "driver" && driverRuntimeAllowed ? <DriverNativePermissionsSync /> : null}
          {APP_ROLE === "driver" && driverRuntimeAllowed ? <DriverPresenceKeeper /> : null}
          {APP_ROLE === "driver" ? <DriverPasswordRecoveryBridge /> : null}
          <Outlet />
          {APP_ROLE === "web" ? <NotificationPermissionPrompt /> : null}
          <Toaster richColors position="top-right" closeButton />
        </MapThemeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
