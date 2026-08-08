import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadAdminAccess } from "@/lib/adminAccess";
import { DSButton, Loading } from "@/design-system";

type State = "loading" | "ok" | "no-session" | "no-admin";

export function AdminGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
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
      setState(access?.authorized ? "ok" : "no-admin");
    })();

    return () => {
      mounted = false;
    };
  }, []);

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

  return <>{children}</>;
}
