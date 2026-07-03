import { createFileRoute } from "@tanstack/react-router";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
import { NotificationPreferencesPage } from "@/components/notifications/NotificationPreferencesPage";

function Page() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1">
        <NotificationPreferencesPage audience="driver" />
      </main>
      <BottomNav items={DRIVER_NAV} />
    </div>
  );
}

export const Route = createFileRoute("/motorista/preferencias-notificacoes")({
  head: () => ({ meta: [{ title: "Preferências de notificação — MOVVI" }] }),
  component: Page,
});
