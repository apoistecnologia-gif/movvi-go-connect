import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonRoute } from "@/components/ComingSoonRoute";

export const Route = createFileRoute("/motorista/login")({
  head: () => ({ meta: [{ title: "Login do Motorista — MOVVI DRIVE" }] }),
  component: () => (
    <ComingSoonRoute
      phase="Fase 2"
      title="Login do Motorista"
      description="Roteamento automático para /motorista/status ou /motorista/app conforme aprovação."
    />
  ),
});
