import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import { PASSENGER_NAV } from "@/components/BottomNav";
import { HelpCenterView } from "@/components/support/HelpCenterView";

export const Route = createFileRoute("/passageiro/suporte")({
  head: () => ({
    meta: [
      { title: "Central de Ajuda — APOIS" },
      { name: "description", content: "Suporte, FAQ e contato da APOIS para passageiros." },
    ],
  }),
  component: SuportePassageiro,
});

function SuportePassageiro() {
  return (
    <SettingsPageShell nav={PASSENGER_NAV}>
      <SettingsHero
        icon={LifeBuoy}
        title="Central de ajuda"
        subtitle="Perguntas frequentes, contato e suporte APOIS."
      />
      <HelpCenterView
        role="passenger"
        termsHref="/passageiro/termos"
        privacyHref="/passageiro/privacidade"
      />
    </SettingsPageShell>
  );
}
