import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonRoute } from "@/components/ComingSoonRoute";

export const Route = createFileRoute("/motorista/app")({
  head: () => ({ meta: [{ title: "App do Motorista — MOVVI DRIVE" }] }),
  component: () => (
    <ComingSoonRoute
      phase="Fase 4"
      title="App do Motorista"
      description="Mapa em tela cheia, online/offline, GPS real, chamadas com som e fluxo completo da corrida."
    />
  ),
});
