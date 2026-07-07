import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { AuthShell, useAuthForm } from "@/components/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { DSButton, DSInput, DSLabel } from "@/design-system";

export const Route = createFileRoute("/motorista/login")({
  head: () => ({ meta: [{ title: "Entrar — Motorista MOVVI DRIVE" }, { name: "robots", content: "noindex" }] }),
  component: DriverLoginPage,
});

const schema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

function DriverLoginPage() {
  const navigate = useNavigate();
  const { error, setError, loading, handle } = useAuthForm();

  const onSubmit = handle(async (form) => {
    const parsed = schema.parse(Object.fromEntries(form.entries()));
    const { data, error: e } = await supabase.auth.signInWithPassword(parsed);
    if (e || !data.user) throw e ?? new Error("E-mail ou senha inválidos.");

    const { data: driver, error: driverError } = await supabase
      .from("drivers")
      .select("approval_status, motivo_reprovacao")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (driverError) throw new Error("Falha ao consultar cadastro de motorista.");

    if (!driver) {
      await supabase.auth.signOut();
      setError("Cadastro de motorista não encontrado.");
      return;
    }

    if (driver.approval_status === "aprovado") {
      navigate({ to: "/motorista/app" });
      return;
    }

    navigate({ to: "/motorista/status" });
  });

  return (
    <AuthShell
      title="Entrar como motorista"
      description="Acesse sua conta MOVVI para começar a rodar."
      footer={
        <>
          Quer dirigir conosco?{" "}
          <Link to="/motorista/cadastro" className="text-primary hover:underline">
            Cadastrar motorista
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <DSLabel htmlFor="email">E-mail</DSLabel>
          <DSInput id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <DSLabel htmlFor="password">Senha</DSLabel>
          <DSInput
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
