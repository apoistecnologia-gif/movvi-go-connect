import { createFileRoute } from "@tanstack/react-router";
import { Car, Bike, Package, Truck, Dog, Briefcase, Sparkles, Clock } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { ServiceCard, ServicesGrid } from "@/components/ui-kit";

export const Route = createFileRoute("/passageiro/servicos")({
  head: () => ({
    meta: [
      { title: "Serviços — MOVVI" },
      { name: "description", content: "Escolha o serviço MOVVI ideal: carro, moto, entrega, pet e mais." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ServicosPage,
});

function ServicosPage() {
  return (
    <div className="min-h-dvh bg-background pb-28">
      <MovviHeader />
      <main className="mx-auto w-full max-w-md space-y-6 px-4 pt-4">
        <header className="space-y-1 px-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Conheça os serviços MOVVI
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Veja o que oferecemos. A escolha final do serviço acontece depois
            que você informa o destino no início.
          </p>
        </header>

        <ServicesGrid title="Transporte">
          <ServiceCard
            icon={Car}
            title="Carro"
            description="Viagens rápidas pela cidade."
            to="/passageiro/app"
          />
          <ServiceCard
            icon={Bike}
            title="Moto"
            description="Ágil no trânsito, preço menor."
            to="/passageiro/app"
          />
          <ServiceCard
            icon={Briefcase}
            title="Executivo"
            description="Conforto para reuniões."
            to="/passageiro/app"
          />
          <ServiceCard
            icon={Dog}
            title="Pet"
            description="Viagem com seu pet."
            to="/passageiro/app"
          />
        </ServicesGrid>

        <ServicesGrid title="Entregas">
          <ServiceCard
            icon={Package}
            title="Envio"
            description="Documentos e pequenos volumes."
            to="/passageiro/app"
          />
          <ServiceCard
            icon={Truck}
            title="Frete"
            description="Cargas maiores."
            badge="Em breve"
            disabled
          />
        </ServicesGrid>

        <ServicesGrid title="Novidades">
          <ServiceCard
            icon={Sparkles}
            title="Promoções"
            description="Cupons e descontos ativos."
            to="/passageiro/app"
          />
          <ServiceCard
            icon={Clock}
            title="Agendar"
            description="Reserve com antecedência."
            badge="Em breve"
            disabled
          />
        </ServicesGrid>
      </main>
      <BottomNav items={PASSENGER_NAV} floating theme="dark" />
    </div>
  );
}
