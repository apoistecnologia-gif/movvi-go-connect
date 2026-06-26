import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonRoute } from "@/components/ComingSoonRoute";

export const Route = createFileRoute("/passageiro/login")({
  head: () => ({ meta: [{ title: "Login do Passageiro — MOVVI DRIVE" }] }),
  component: () => (
    <ComingSoonRoute
      phase="Fase 2"
      title="Login do Passageiro"
      description="Esta tela será construída na Fase 2 com Supabase Auth (e-mail + senha)."
    />
  ),
});
