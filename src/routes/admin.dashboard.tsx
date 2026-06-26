import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonRoute } from "@/components/ComingSoonRoute";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard Admin — MOVVI DRIVE" }] }),
  component: () => (
    <ComingSoonRoute
      phase="Fase 5"
      title="Dashboard Administrativo"
      description="Métricas, aprovação de motoristas, tarifas e operação. Em construção."
    />
  ),
});
