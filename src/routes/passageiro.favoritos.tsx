import { createFileRoute } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/passageiro/favoritos")({
  head: () => ({ meta: [{ title: "Favoritos — MOVVI DRIVE" }] }),
  component: () => (
    <SectionPage
      role="passenger"
      title="Endereços favoritos"
      description="Salve casa, trabalho e outros lugares frequentes para pedir uma corrida em segundos."
      icon={Heart}
      next="Em breve você poderá salvar endereços e abrir a corrida em 1 toque."
    />
  ),
});
