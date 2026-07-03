import { createFileRoute } from "@tanstack/react-router";
import { MovviHeader } from "@/components/MovviHeader";
import { HelpCenterView } from "@/components/support/HelpCenterView";

export const Route = createFileRoute("/motorista/suporte")({
  head: () => ({
    meta: [
      { title: "Central de Ajuda — MOVVI DRIVE" },
      { name: "description", content: "Suporte, FAQ e contato da MOVVI DRIVE para motoristas." },
    ],
  }),
  component: SuporteMotorista,
});

function SuporteMotorista() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-24">
        <HelpCenterView
          role="driver"
          termsHref="/motorista/termos"
          privacyHref="/motorista/privacidade"
        />
      </main>
    </div>
  );
}
