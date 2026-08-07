import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Box, Send, Truck, type LucideIcon } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";

export const Route = createFileRoute("/passageiro/servicos")({
  head: () => ({
    meta: [
      { title: "Serviços — APOIS" },
      {
        name: "description",
        content:
          "Escolha o serviço APOIS: corridas, entregas, guincho, mudanças e fretes grandes.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ServicosPage,
});

function ServicosPage() {
  return (
    <div className="min-h-dvh bg-background pb-32">
      <MovviHeader />
      <main className="mx-auto w-full max-w-md space-y-5 px-4 pt-4">
        <header className="space-y-1 px-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Serviços APOIS
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Escolha um atendimento especial.
          </p>
        </header>

        <section className="space-y-3">
          <ServiceFlowCard
            icon={Send}
            title="APOIS Envios"
            description="Envie ou receba itens com praticidade."
            action="Enviar ou receber"
            to="/passageiro/envios"
          />
          <ServiceFlowCard
            icon={Truck}
            title="APOIS Guincho"
            description="Solicite assistência para transportar seu veículo."
            action="Solicitar guincho"
            to="/passageiro/guincho"
          />
          <ServiceFlowCard
            icon={Box}
            title="Mudanças e Fretes Grandes"
            description="Transporte móveis, cargas maiores e mudanças."
            action="Solicitar frete"
            to="/passageiro/mudancas"
          />
        </section>
      </main>
      <BottomNav items={PASSENGER_NAV} floating theme="dark" />
    </div>
  );
}

type ServiceRoute =
  | "/passageiro/app"
  | "/passageiro/envios"
  | "/passageiro/guincho"
  | "/passageiro/mudancas";

function ServiceFlowCard({
  icon: Icon,
  title,
  description,
  action,
  to,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
  to: ServiceRoute;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-[0_14px_34px_-24px_rgba(0,0,0,0.75)] transition active:scale-[0.98]"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary transition group-hover:bg-primary/25">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-bold leading-tight text-foreground">
          {title}
        </span>
        <span className="mt-1 block text-[12.5px] leading-snug text-muted-foreground">
          {description}
        </span>
        <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-primary">
          {action}
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" strokeWidth={2.4} />
        </span>
      </span>
    </Link>
  );
}
