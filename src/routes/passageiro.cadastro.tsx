import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { AuthShell, useAuthForm } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/passageiro/cadastro")({
  head: () => ({ meta: [{ title: "Cadastro — Passageiro MOVVI DRIVE" }] }),
  component: PassengerSignUpPage,
});

const schema = z.object({
  name: z.string().trim().min(3, "Nome muito curto").max(120),
  email: z.string().trim().email("E-mail inválido").max(255),
  phone: z.string().trim().min(10, "Telefone inválido").max(20),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

function PassengerSignUpPage() {
  const navigate = useNavigate();
  const { error, loading, handle } = useAuthForm();

  const onSubmit = handle(async (form) => {
    const data = schema.parse(Object.fromEntries(form.entries()));
    const { data: signUp, error: e } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/passageiro/app`,
        data: { name: data.name, phone: data.phone, role: "passenger" },
      },
    });
    if (e) throw e;
    if (!signUp.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (signInError) throw signInError;
    }
    navigate({ to: "/passageiro/app" });
  });

  return (
    <AuthShell
      title="Criar conta de passageiro"
      description="Em poucos passos você pede sua primeira corrida."
      footer={
        <>
          Já tem conta?{" "}
          <Link to="/passageiro/login" className="text-primary hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome completo</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" name="phone" required autoComplete="tel" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Criar conta
        </Button>
      </form>
    </AuthShell>
  );
}
