import { createFileRoute } from "@tanstack/react-router";
import { RetiredPassengerRoute } from "@/components/RetiredPassengerRoute";

export const Route = createFileRoute("/passageiro/corridas")({
  component: () => <RetiredPassengerRoute title="Corridas do Passageiro" />,
});
