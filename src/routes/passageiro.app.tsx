import { createFileRoute } from "@tanstack/react-router";
import { RetiredPassengerRoute } from "@/components/RetiredPassengerRoute";

export const Route = createFileRoute("/passageiro/app")({
  component: () => <RetiredPassengerRoute title="Aplicativo Passageiro" />,
});
