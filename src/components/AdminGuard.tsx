import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadAdminAccess } from "@/lib/adminAccess";
import { ADMIN_NAV } from "@/components/admin/AdminSidebar";
import { DSButton, Loading } from "@/design-system";
import { AdminMfaGate } from "@/components/AdminMfaGate";

type State = "loading" | "ok" | "mfa" | "no-session" | "no-admin" | "no-permission" | "error";

export function AdminGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [state, setState] = useState<State>("loading");
  const [fallbackRoute, setFallbackRoute] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    const requestId = ++requestRef.current;
    setState("loading");
    setFallbackRoute(null);
    setActionError(null);

    void (async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (!mounted || requestId !== requestRef.current) return;
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          setState("no-session");
          return;
        }

        // O MFA precisa ocorrer antes das consultas RBAC; a futura exigência
        // de AAL2 no Postgres impediria consultar as permissões antecipadamente.
        const { data: assurance, error: assuranceError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!mounted || requestId !== requestRef.current) return;
        if (assuranceError || !assurance) {
          throw assuranceError ?? new Error("Falha ao verificar autenticação multifator");
        }
        if (assurance.currentLevel !== "aal2") {
          setState("mfa");
          return;
        }

        const access = await loadAdminAccess();
        if (!mounted || requestId !== requestRef.current) return;
        if (!access?.authorized) {
          setState("no-admin");
          return;
        }

        const permissionSet = new Set((access.permissions ?? []).filter(Boolean));
        const firstAllowed = ADMIN_NAV.find((item) => permissionSet.has(item.permission));
        setFallbackRoute(firstAllowed?.to ?? null);

        const routePermission = ADMIN_NAV.find(
          (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
        );

        // Somente módulos explicitamente homologados no menu administrativo podem
        // ser acessados. Rotas históricas que ainda existem no source ficam
        // bloqueadas até serem auditadas e promovidas conscientemente.
        if (!routePermission || !permissionSet.has(routePermission.permission)) {
          setState("no-permission");
          return;
        }

        setState("ok");
      } catch (error) {
        if (!mounted || requestId !== requestRef.current) return;
        setState("error");
        if (import.meta.env.DEV) console.warn("[APOIS Admin] falha na verificação de acesso", error);
      }
    })();

    return () => {
      mounted = false;
      requestRef.current += 1;
    };
  }, [pathname, retryNonce]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        requestRef.current += 1;
        setState("no-session");
        setFallbackRoute(null);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setRetryNonce((value) => value + 1);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function go(to: string) {
    try {
      setActionError(null);
      await navigate({ to });
    } catch (error) {
      setActionError("Não foi possível abrir a página solicitada. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha de navegação", error);
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setActionError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await navigate({ to: "/admin/login", replace: true });
    } catch (error) {
      setActionError("Não foi possível encerrar a sessão agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao sair", error);
    } finally {
      setSigningOut(false);
    }
  }

  if (state === "loading") {
    return (
      <div
        className="flex min-h-dvh items-center justify-center bg-background p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]"
        role="status"
        aria-live="polite"
      >
        <Loading label="Verificando permissões..." />
      </div>
    );
  }

  if (state === "mfa") {
    return (
      <AdminMfaGate loginPath="/admin/login" onVerified={() => setRetryNonce((value) => value + 1)}>
        <div role="status" className="grid min-h-dvh place-items-center p-6 text-sm">
          Confirmando permissões administrativas...
        </div>
      </AdminMfaGate>
    );
  }

  if (state === "no-session") {
    return (
      <GuardState title="Sessão administrativa necessária" iconTone="danger">
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          Você precisa entrar com uma conta administrativa para continuar.
        </p>
        <DSButton className="min-h-11" onClick={() => void go("/admin/login")}>
          Ir para login admin
        </DSButton>
        {actionError ? <GuardError message={actionError} /> : null}
      </GuardState>
    );
  }

  if (state === "no-admin") {
    return (
      <GuardState title="Acesso restrito" iconTone="danger">
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          Sua conta não possui uma função administrativa ativa no APOIS.
        </p>
        <DSButton
          variant="secondary"
          className="min-h-11"
          onClick={() => void signOut()}
          disabled={signingOut}
          aria-busy={signingOut}
        >
          {signingOut ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : null}
          {signingOut ? "Saindo…" : "Sair e entrar com outra conta"}
        </DSButton>
        {actionError ? <GuardError message={actionError} /> : null}
      </GuardState>
    );
  }

  if (state === "no-permission") {
    return (
      <GuardState title="Módulo não autorizado" iconTone="primary">
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          Sua função não possui permissão para este módulo, ou esta rota ainda não foi homologada
          para uso operacional no painel.
        </p>
        {fallbackRoute ? (
          <DSButton className="min-h-11" onClick={() => void go(fallbackRoute)}>
            Ir para uma seção permitida
          </DSButton>
        ) : (
          <DSButton
            variant="secondary"
            className="min-h-11"
            onClick={() => void signOut()}
            disabled={signingOut}
            aria-busy={signingOut}
          >
            {signingOut ? "Saindo…" : "Sair"}
          </DSButton>
        )}
        {actionError ? <GuardError message={actionError} /> : null}
      </GuardState>
    );
  }

  if (state === "error") {
    return (
      <GuardState title="Não foi possível verificar seu acesso" iconTone="danger">
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          Houve uma falha temporária ao confirmar a sessão e as permissões administrativas.
        </p>
        <DSButton
          variant="outline"
          className="min-h-11 gap-2"
          onClick={() => setRetryNonce((value) => value + 1)}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Tentar novamente
        </DSButton>
      </GuardState>
    );
  }

  return <>{children}</>;
}

function GuardState({
  title,
  iconTone,
  children,
}: {
  title: string;
  iconTone: "danger" | "primary";
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh min-w-0 flex-col items-center justify-center gap-4 overflow-x-hidden bg-background p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
      <ShieldAlert
        className={`h-10 w-10 ${iconTone === "danger" ? "text-destructive" : "text-primary"}`}
        aria-hidden="true"
      />
      <h1 className="break-words font-display text-xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}

function GuardError({ message }: { message: string }) {
  return (
    <p className="max-w-md break-words text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}
