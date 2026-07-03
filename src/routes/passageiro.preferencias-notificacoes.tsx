import { createFileRoute } from "@tanstack/react-router";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { NotificationPreferencesPage } from "@/components/notifications/NotificationPreferencesPage";

function Page() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1">
        <NotificationPreferencesPage audience="passenger" />
      </main>
      <BottomNav items={PASSENGER_NAV} />
    </div>
  );
}

export const Route = createFileRoute("/passageiro/preferencias-notificacoes")({
  head: () => ({ meta: [{ title: "Preferências de notificação — MOVVI" }] }),
  component: Page,
});
