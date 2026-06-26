import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonRoute } from "@/components/ComingSoonRoute";

export const Route = createFileRoute("/motorista/status")({
  head: () => ({ meta: [{ title: "Status do Cadastro — MOVVI DRIVE" }] }),
  component: () => (
    <ComingSoonRoute
      phase="Fase 2"
      title="Cadastro em análise"
      description="Tela mostrada após o cadastro do motorista, antes da aprovação pelo admin."
    />
  ),
});
