import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type State = "loading" | "ok" | "no-session" | "no-admin";

export function AdminGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        if (mounted) setState("no-session");
        return;
      }
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!mounted) return;
      setState(role ? "ok" : "no-admin");
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verificando permissões...
      </div>
    );
  }

  if (state === "no-session") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">Você precisa entrar como administrador.</p>
        <Button onClick={() => navigate({ to: "/admin/login" })}>Ir para login admin</Button>
      </div>
    );
  }

  if (state === "no-admin") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <h2 className="font-display text-xl">Acesso restrito</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Você não tem permissão para acessar o painel administrativo.
        </p>
        <Button
          variant="secondary"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/admin/login" });
          }}
        >
          Sair e entrar como admin
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
