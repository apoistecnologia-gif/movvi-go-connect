import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonRoute } from "@/components/ComingSoonRoute";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Login Admin — MOVVI DRIVE" }] }),
  component: () => (
    <ComingSoonRoute
      phase="Fase 2"
      title="Painel Administrativo"
      description="Acesso restrito à equipe MOVVI. Em construção."
    />
  ),
});
