import { createFileRoute } from "@tanstack/react-router";
import { RetiredPassengerRoute } from "@/components/RetiredPassengerRoute";

export const Route = createFileRoute("/passageiro/agendar")({
  component: () => <RetiredPassengerRoute title="Agendamento do Passageiro" />,
});
