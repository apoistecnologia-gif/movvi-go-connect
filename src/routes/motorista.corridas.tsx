import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/motorista/corridas")({
  head: () => ({ meta: [{ title: "Corridas — MOVVI DRIVE" }] }),
  component: () => (
    <SectionPage
      role="driver"
      title="Minhas corridas"
      description="Histórico de viagens realizadas com a MOVVI."
      icon={ClipboardList}
      next="Após sua primeira corrida finalizada, ela aparecerá aqui com passageiro, distância, duração e ganhos."
    />
  ),
});
