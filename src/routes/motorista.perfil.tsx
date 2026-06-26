import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/routes/passageiro.perfil";

export const Route = createFileRoute("/motorista/perfil")({
  head: () => ({ meta: [{ title: "Perfil do Motorista — MOVVI DRIVE" }] }),
  component: () => (
    <ProfilePage
      role="driver"
      title="Perfil do motorista"
      description="Mantenha seus dados sempre atualizados."
    />
  ),
});
