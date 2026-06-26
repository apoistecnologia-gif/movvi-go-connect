import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonRoute } from "@/components/ComingSoonRoute";

export const Route = createFileRoute("/passageiro/cadastro")({
  head: () => ({ meta: [{ title: "Cadastro do Passageiro — MOVVI DRIVE" }] }),
  component: () => (
    <ComingSoonRoute
      phase="Fase 2"
      title="Cadastro do Passageiro"
      description="Nome, telefone, e-mail e senha. Em construção na Fase 2."
    />
  ),
});
