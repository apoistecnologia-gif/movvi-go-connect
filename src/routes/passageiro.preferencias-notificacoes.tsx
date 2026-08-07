import { createFileRoute } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import { PASSENGER_NAV } from "@/components/BottomNav";
import { NotificationPreferencesPage } from "@/components/notifications/NotificationPreferencesPage";

function Page() {
  return (
    <SettingsPageShell nav={PASSENGER_NAV}>
      <SettingsHero
        icon={BellRing}
        title="Preferências de notificação"
        subtitle="Escolha quais alertas você quer receber."
      />
      <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
        <NotificationPreferencesPage audience="passenger" />
      </div>
    </SettingsPageShell>
  );
}

export const Route = createFileRoute("/passageiro/preferencias-notificacoes")({
  head: () => ({ meta: [{ title: "Preferências de notificação — APOIS" }] }),
  component: Page,
});
