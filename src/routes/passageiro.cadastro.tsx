import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { AuthShell, useAuthForm } from "@/components/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { DSButton, DSInput, DSLabel } from "@/design-system";

export const Route = createFileRoute("/passageiro/cadastro")({
  head: () => ({ meta: [{ title: "Cadastro — Passageiro APOIS" }, { name: "robots", content: "noindex" }] }),
  component: PassengerSignUpPage,
});

const schema = z.object({
  name: z.string().trim().min(3, "Nome muito curto").max(120),
  email: z.string().trim().email("E-mail inválido").max(255),
  phone: z.string().trim().min(10, "Telefone inválido").max(20),
  password: z.string().min(4, "Mínimo 4 caracteres").max(72),
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
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <DSLabel htmlFor="name" className="text-[13px]">Nome completo</DSLabel>
          <DSInput id="name" name="name" required className="h-9 text-[14px]" />
        </div>
        <div className="space-y-1.5">
          <DSLabel htmlFor="email" className="text-[13px]">E-mail</DSLabel>
          <DSInput id="email" name="email" type="email" required autoComplete="email" className="h-9 text-[14px]" />
        </div>
        <div className="space-y-1.5">
          <DSLabel htmlFor="phone" className="text-[13px]">Telefone</DSLabel>
          <DSInput id="phone" name="phone" required autoComplete="tel" className="h-9 text-[14px]" />
        </div>
        <div className="space-y-1.5">
          <DSLabel htmlFor="password" className="text-[13px]">Senha</DSLabel>
          <DSInput
            id="password"
            name="password"
            type="password"
            required
            minLength={4}
            autoComplete="new-password"
            className="h-9 text-[14px]"
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DSButton type="submit" size="sm" className="w-full h-10" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Criar conta
        </DSButton>
      </form>
    </AuthShell>
  );
}
