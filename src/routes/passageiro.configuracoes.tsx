import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/passageiro/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — MOVVI DRIVE" }] }),
  component: () => (
    <SectionPage
      role="passenger"
      title="Configurações"
      description="Notificações, privacidade, idioma e preferências de viagem."
      icon={Settings}
      next="Em breve você poderá personalizar notificações, idioma e preferências de pagamento."
    />
  ),
});
