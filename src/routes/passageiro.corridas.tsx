import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/passageiro/corridas")({
  head: () => ({ meta: [{ title: "Minhas Corridas — MOVVI DRIVE" }] }),
  component: () => (
    <SectionPage
      role="passenger"
      title="Minhas corridas"
      description="Seu histórico de viagens aparecerá aqui."
      icon={ClipboardList}
      next="Quando você concluir sua primeira corrida na MOVVI, ela aparecerá aqui com origem, destino, motorista, valor e avaliação."
    />
  ),
});
