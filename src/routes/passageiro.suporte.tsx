import { createFileRoute } from "@tanstack/react-router";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { HelpCenterView } from "@/components/support/HelpCenterView";

export const Route = createFileRoute("/passageiro/suporte")({
  head: () => ({
    meta: [
      { title: "Central de Ajuda — MOVVI DRIVE" },
      { name: "description", content: "Suporte, FAQ e contato da MOVVI DRIVE para passageiros." },
    ],
  }),
  component: SuportePassageiro,
});

function SuportePassageiro() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-24">
        <HelpCenterView
          role="passenger"
          termsHref="/passageiro/termos"
          privacyHref="/passageiro/privacidade"
        />
      </main>
      <BottomNav items={PASSENGER_NAV} />
    </div>
  );
}
