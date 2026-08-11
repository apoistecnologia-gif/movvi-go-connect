import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadAdminAccess } from "@/lib/adminAccess";
import { ADMIN_NAV } from "@/components/admin/AdminSidebar";
import { DSButton, Loading } from "@/design-system";

type State = "loading" | "ok" | "no-session" | "no-admin" | "no-permission";

export function AdminGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!mounted) return;
      if (sessionError || !sessionData.session) {
        setState("no-session");
        return;
      }

      const access = await loadAdminAccess();
      if (!mounted) return;
      if (!access?.authorized) {
        setState("no-admin");
        return;
      }

      const routePermission = ADMIN_NAV.find(
        (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
      );

      // Somente módulos explicitamente homologados no menu administrativo podem
      // ser acessados. Rotas históricas que ainda existem no source ficam
      // bloqueadas até serem auditadas e promovidas conscientemente.
      if (!routePermission || !access.permissions.includes(routePermission.permission)) {
        setState("no-permission");
        return;
      }

      setState("ok");
    })();

    return () => {
      mounted = false;
    };
  }, [pathname]);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loading label="Verificando permissões..." />
      </div>
    );
  }

  if (state === "no-session") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">Você precisa entrar como administrador.</p>
        <DSButton onClick={() => navigate({ to: "/admin/login" })}>Ir para login admin</DSButton>
      </div>
    );
  }

  if (state === "no-admin") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <h2 className="font-display text-xl">Acesso restrito</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Sua conta não possui uma função administrativa ativa no APOIS.
        </p>
        <DSButton
          variant="secondary"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/admin/login" });
          }}
        >
          Sair e entrar com outra conta
        </DSButton>
      </div>
    );
  }

  if (state === "no-permission") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-primary" />
        <h2 className="font-display text-xl">Módulo não autorizado</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Sua função não possui permissão para este módulo, ou esta rota ainda não foi homologada
          para uso operacional no painel.
        </p>
        <DSButton onClick={() => navigate({ to: "/admin/dashboard" })}>
          Voltar ao painel
        </DSButton>
      </div>
    );
  }

  return <>{children}</>;
}
