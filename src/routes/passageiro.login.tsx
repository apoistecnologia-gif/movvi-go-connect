import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { AuthShell, useAuthForm } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/passageiro/login")({
  head: () => ({ meta: [{ title: "Entrar — Passageiro MOVVI DRIVE" }] }),
  component: PassengerLoginPage,
});

const schema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

function PassengerLoginPage() {
  const navigate = useNavigate();
  const { error, loading, handle } = useAuthForm();

  const onSubmit = handle(async (form) => {
    const parsed = schema.parse(Object.fromEntries(form.entries()));
    const { error: e } = await supabase.auth.signInWithPassword(parsed);
    if (e) throw new Error("E-mail ou senha inválidos");
    navigate({ to: "/passageiro/app" });
  });

  return (
    <AuthShell
      title="Entrar como passageiro"
      description="Acesse sua conta para solicitar uma corrida."
      footer={
        <>
          Não tem conta?{" "}
          <Link to="/passageiro/cadastro" className="text-primary hover:underline">
            Cadastre-se
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[13px]">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" className="h-9 text-[14px]" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[13px]">Senha</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="h-9 text-[14px]"
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="sm" className="w-full h-10" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Entrar
        </Button>
      </form>
    </AuthShell>
  );
}
