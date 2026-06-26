import { createFileRoute } from "@tanstack/react-router";
import { DollarSign } from "lucide-react";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/motorista/ganhos")({
  head: () => ({ meta: [{ title: "Ganhos — MOVVI DRIVE" }] }),
  component: () => (
    <SectionPage
      role="driver"
      title="Meus ganhos"
      description="Acompanhe seus ganhos diários, semanais e mensais."
      icon={DollarSign}
      next="Quando uma corrida for finalizada, o valor aparece aqui com extratos e relatórios."
    />
  ),
});
