import { createFileRoute } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import { NotificationPreferencesPage } from "@/components/notifications/NotificationPreferencesPage";

function Page() {
  return (
    <SettingsPageShell>
      <SettingsHero
        icon={BellRing}
        title="Preferências de notificação"
        subtitle="Escolha quais alertas você quer receber."
      />
      <div className="rounded-[24px] bg-white shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5 overflow-hidden">
        <NotificationPreferencesPage audience="driver" />
      </div>
    </SettingsPageShell>
  );
}

export const Route = createFileRoute("/motorista/preferencias-notificacoes")({
  head: () => ({ meta: [{ title: "Preferências de notificação — MOVVI" }] }),
  component: Page,
});
