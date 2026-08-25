import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { loadAdminAccess } from "@/lib/adminAccess";
import { AuthShell, useAuthForm } from "@/components/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck } from "lucide-react";
import { DSButton, DSInput, DSLabel } from "@/design-system";
import "@/apois-admin-theme.css";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin — APOIS" }, { name: "robots", content: "noindex" }] }),
  component: AdminLoginPage,
});

const schema = z.object({
  email: z.string().trim().max(254, "E-mail muito longo").email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha").max(256, "Senha muito longa"),
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const { error, setError, loading, handle } = useAuthForm();

  const onSubmit = handle(async (form) => {
    setError(null);
    const parsed = schema.safeParse(Object.fromEntries(form.entries()));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revise os dados informados.");
      return;
    }

    const credentials = {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
    };
    const { data, error: signInError } = await supabase.auth.signInWithPassword(credentials);
    if (signInError || !data.user) {
      setError("E-mail ou senha inválidos.");
      return;
    }

    try {
      const access = await loadAdminAccess();
      if (!access?.authorized) {
        await supabase.auth.signOut();
        setError("Esta conta não possui acesso administrativo ativo.");
        return;
      }
      await navigate({ to: "/admin/dashboard" });
    } catch (accessError) {
      await supabase.auth.signOut().catch(() => undefined);
      setError("Não foi possível validar o acesso administrativo agora. Entre novamente em alguns instantes.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao validar RBAC após login", accessError);
    }
  });

  return (
    <div className="apois-admin-theme min-h-dvh min-w-0 overflow-x-hidden bg-background text-foreground">
      <AuthShell
        brandLabel="ADMIN"
        title={
          <span className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
            <span className="break-words">Painel administrativo</span>
          </span>
        }
        description="Acesso restrito à equipe APOIS."
      >
        <form onSubmit={onSubmit} method="post" className="min-w-0 space-y-4" noValidate>
          <div className="min-w-0 space-y-2">
            <DSLabel htmlFor="email">E-mail</DSLabel>
            <DSInput
              id="email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="email"
              inputMode="email"
              className="min-h-11 text-base"
              disabled={loading}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <DSLabel htmlFor="password">Senha</DSLabel>
            <DSInput
              id="password"
              name="password"
              type="password"
              required
              maxLength={256}
              autoComplete="current-password"
              className="min-h-11 text-base"
              disabled={loading}
            />
          </div>
          {error ? (
            <Alert variant="destructive" role="alert" aria-live="polite">
              <AlertDescription className="break-words">{error}</AlertDescription>
            </Alert>
          ) : null}
          <DSButton
            type="submit"
            className="min-h-11 w-full gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {loading ? "Entrando…" : "Entrar"}
          </DSButton>
        </form>
      </AuthShell>
    </div>
  );
}
