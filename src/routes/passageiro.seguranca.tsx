import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import { PASSENGER_NAV } from "@/components/BottomNav";
import { EmergencyContactsManager } from "@/components/safety/EmergencyContactsManager";

export const Route = createFileRoute("/passageiro/seguranca")({
  head: () => ({
    meta: [
      { title: "Segurança — APOIS" },
      { name: "description", content: "Contatos de emergência e recursos de segurança APOIS." },
    ],
  }),
  component: PassengerSafetyPage,
});

function PassengerSafetyPage() {
  return (
    <SettingsPageShell nav={PASSENGER_NAV}>
      <SettingsHero
        icon={ShieldAlert}
        title="Segurança"
        subtitle="Cadastre um contato de confiança para o botão de emergência."
        tone="danger"
      />

      <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
        <EmergencyContactsManager role="passenger" />
      </div>

      <p className="text-center text-[11.5px] text-[#707070]">
        Em caso de emergência real, ligue 190. A APOIS registra alertas SOS com sua localização e dados da corrida.
      </p>
    </SettingsPageShell>
  );
}
