import { createFileRoute } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV, DRIVER_NAV } from "@/components/BottomNav";

/**
 * Painel padrão de subseção logada (Corridas, Ganhos, Favoritos, etc).
 * Garante header + bottom nav. Conteúdo da fase atual = aviso "em breve".
 */
export function SectionPage({
  role,
  title,
  description,
  icon: Icon,
  next,
}: {
  role: "passenger" | "driver";
  title: string;
  description: string;
  icon: LucideIcon;
  next: string;
}) {
  const nav = role === "passenger" ? PASSENGER_NAV : DRIVER_NAV;
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-10 pb-24">
        <div className="container mx-auto max-w-xl text-center">
          <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Icon className="h-7 w-7" />
          </div>
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>

          <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-dashed border-border bg-card/40 p-5 text-left text-xs text-muted-foreground">
            <strong className="text-foreground">Próximos passos:</strong>
            <p className="mt-2">{next}</p>
          </div>
        </div>
      </main>
      <BottomNav items={nav} />
    </div>
  );
}

export const Route = createFileRoute("/passageiro/corridas")({
  head: () => ({ meta: [{ title: "Minhas Corridas — MOVVI DRIVE" }] }),
  component: () => null, // overridden — placeholder for type
});
