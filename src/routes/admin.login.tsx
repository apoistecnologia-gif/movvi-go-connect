import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { AuthShell, useAuthForm } from "@/components/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck } from "lucide-react";
import { DSButton, DSInput, DSLabel } from "@/design-system";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin — APOIS" }, { name: "robots", content: "noindex" }] }),
  component: AdminLoginPage,
});

const schema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const { error, setError, loading, handle } = useAuthForm();

  const onSubmit = handle(async (form) => {
    const parsed = schema.parse(Object.fromEntries(form.entries()));
    const { data, error: authError } = await supabase.auth.signInWithPassword(parsed);
    if (authError || !data.user || !data.session) throw new Error("Credenciais inválidas");

    const { data: authorized, error: roleError } = await (supabase as any).rpc("admin_is_authorized");
    if (roleError || authorized !== true) {
      await supabase.auth.signOut();
      setError("Esta conta não possui acesso administrativo.");
      throw new Error("Acesso restrito a administradores.");
    }

    navigate({ to: "/admin/dashboard", replace: true });
  });

  return (
    <AuthShell
      title={<span className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Painel administrativo</span>}
      description="Acesso restrito à equipe APOIS."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <DSLabel htmlFor="email">E-mail</DSLabel>
          <DSInput id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <DSLabel htmlFor="password">Senha</DSLabel>
          <DSInput id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <DSButton type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Entrar
        </DSButton>
      </form>
    </AuthShell>
  );
}
