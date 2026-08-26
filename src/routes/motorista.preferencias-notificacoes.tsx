import { createFileRoute } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import { NotificationPreferencesPage } from "@/components/notifications/NotificationPreferencesPage";

function Page() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(246,190,28,0.12),transparent_62%)]" />
      <div className="relative">
        <SettingsPageShell variant="driver">
          <div className="relative overflow-hidden rounded-[30px] border border-[#F6BE1C]/20 bg-gradient-to-br from-[#211A08] via-[#101214] to-[#08090A] p-1 shadow-[0_28px_78px_-42px_rgba(246,190,28,.8)]">
            <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#F6BE1C]/12 blur-3xl" />
            <div className="relative">
              <SettingsHero
                icon={BellRing}
                title="Preferências de notificação"
                subtitle="Escolha quais alertas você quer receber."
              />
            </div>
          </div>
          <div className="overflow-hidden rounded-[28px] border border-white/[0.06] bg-[#0D0F11]/95 shadow-[0_26px_70px_-44px_rgba(0,0,0,.95)] backdrop-blur-sm">
            <NotificationPreferencesPage audience="driver" />
          </div>
        </SettingsPageShell>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/motorista/preferencias-notificacoes")({
  head: () => ({ meta: [{ title: "Preferências de notificação — APOIS" }] }),
  component: Page,
});
