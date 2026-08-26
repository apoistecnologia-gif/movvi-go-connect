import { createFileRoute } from "@tanstack/react-router";
import { RetiredPassengerRoute } from "@/components/RetiredPassengerRoute";

export const Route = createFileRoute("/passageiro/notificacoes")({
  component: () => <RetiredPassengerRoute title="Notificações do Passageiro" />,
});
