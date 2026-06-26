import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonRoute } from "@/components/ComingSoonRoute";

export const Route = createFileRoute("/motorista/cadastro")({
  head: () => ({ meta: [{ title: "Cadastro do Motorista — MOVVI DRIVE" }] }),
  component: () => (
    <ComingSoonRoute
      phase="Fase 2"
      title="Cadastro do Motorista"
      description="Dados pessoais, veículo e upload de selfie, CNH e documento. Em construção."
    />
  ),
});
