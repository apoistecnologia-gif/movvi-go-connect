import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { AuthShell, useAuthForm } from "@/components/AuthShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck } from "lucide-react";
import { DSButton } from "@/design-system";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin — MOVVI DRIVE" }] }),
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
    const { data, error: e } = await supabase.auth.signInWithPassword(parsed);
    if (e || !data.user) throw new Error("Credenciais inválidas");

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      await supabase.auth.signOut();
      setError("Esta conta não possui acesso administrativo.");
      throw new Error("Acesso restrito a administradores.");
    }

    await supabase.from("admin_login_history").insert({
      user_id: data.user.id,
      email: data.user.email ?? parsed.email,
      user_agent: navigator.userAgent,
      success: true,
    });
    await supabase.from("admin_users_meta").upsert(
      { user_id: data.user.id, last_login_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    navigate({ to: "/admin/dashboard" });
  });

  return (
    <AuthShell
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Painel administrativo
        </span>
      }
      description="Acesso restrito à equipe MOVVI DRIVE."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DSButton type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Entrar
        </DSButton>
      </form>
    </AuthShell>
  );
}
