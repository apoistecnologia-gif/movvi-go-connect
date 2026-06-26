import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonRoute } from "@/components/ComingSoonRoute";

export const Route = createFileRoute("/passageiro/app")({
  head: () => ({ meta: [{ title: "App do Passageiro — MOVVI DRIVE" }] }),
  component: () => (
    <ComingSoonRoute
      phase="Fase 3"
      title="App do Passageiro"
      description="Mapa, Places Autocomplete, modalidades e solicitação de corrida em tempo real."
    />
  ),
});
