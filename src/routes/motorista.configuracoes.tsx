import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/motorista/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — MOVVI DRIVE" }] }),
  component: () => (
    <SectionPage
      role="driver"
      title="Configurações"
      description="Preferências do app, notificações e segurança."
      icon={Settings}
      next="Em breve: aceitar corridas longas/curtas, raio máximo, tipos de pagamento aceitos e mais."
    />
  ),
});
