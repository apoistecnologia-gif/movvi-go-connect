import { Link } from "@tanstack/react-router";
import { Clock3 } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";

export function RideFeatureUnavailable({ title }: { title: string }) {
  return (
    <div className="min-h-dvh bg-background pb-32">
      <MovviHeader />
      <main className="mx-auto flex w-full max-w-md px-4 pt-12">
        <section className="w-full rounded-3xl border border-border bg-card p-6 text-center shadow-xl">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Clock3 className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-primary">Em breve</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Este serviço está temporariamente indisponível.
          </p>
          <Link
            to="/passageiro/servicos"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Ver serviços disponíveis
          </Link>
        </section>
      </main>
      <BottomNav items={PASSENGER_NAV} floating theme="dark" />
    </div>
  );
}
