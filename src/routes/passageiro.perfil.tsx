import { createFileRoute } from "@tanstack/react-router";
import { RetiredPassengerRoute } from "@/components/RetiredPassengerRoute";

export const Route = createFileRoute("/passageiro/perfil")({
  component: () => <RetiredPassengerRoute title="Perfil do Passageiro" />,
});
