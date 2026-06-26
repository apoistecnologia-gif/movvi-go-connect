import type { ReactNode } from "react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV, DRIVER_NAV } from "@/components/BottomNav";

interface AppShellProps {
  role: "passenger" | "driver" | "admin";
  children: ReactNode;
  /** Esconde o bottom nav (ex: telas de auth/status) */
  hideBottomNav?: boolean;
}

/**
 * Layout padrão de TODA tela logada do MOVVI.
 * Garante header padrão + bottom nav, evitando "telas presas".
 */
export function AppShell({ role, children, hideBottomNav }: AppShellProps) {
  const items =
    role === "passenger"
      ? PASSENGER_NAV
      : role === "driver"
      ? DRIVER_NAV
      : [];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MovviHeader />
      <main className="flex-1">{children}</main>
      {!hideBottomNav && items.length > 0 && <BottomNav items={items} />}
    </div>
  );
}
