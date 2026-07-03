import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
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
    <SettingsPageShell>
      <SettingsHero
        icon={LifeBuoy}
        title="Central de ajuda"
        subtitle="Perguntas frequentes, contato e suporte MOVVI."
      />
      <HelpCenterView
        role="driver"
        termsHref="/motorista/termos"
        privacyHref="/motorista/privacidade"
      />
    </SettingsPageShell>
  );
}
