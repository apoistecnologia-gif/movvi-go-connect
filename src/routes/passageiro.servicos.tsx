import { createFileRoute } from "@tanstack/react-router";
import { Car, Bike, Truck, Package, Send } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { ServiceCard, ServicesGrid } from "@/components/ui-kit";

export const Route = createFileRoute("/passageiro/servicos")({
  head: () => ({
    meta: [
      { title: "Serviços — MOVVI" },
      {
        name: "description",
        content:
          "Escolha o serviço MOVVI ideal: carro, moto, frete, guincho ou MOVVI Envios.",
      },
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
            Serviços MOVVI
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Escolha o serviço que você precisa. Corridas usam a busca de
            destino do início. MOVVI Envios tem um fluxo próprio.
          </p>
        </header>

        <ServicesGrid title="Transporte de passageiros">
          <ServiceCard
            icon={Car}
            title="Corridas"
            description="Viagens rápidas de carro pela cidade."
            to="/passageiro/app"
          />
          <ServiceCard
            icon={Bike}
            title="Motos"
            description="Ágil no trânsito, preço menor."
            to="/passageiro/app"
          />
        </ServicesGrid>

        <ServicesGrid title="Carga e veículos">
          <ServiceCard
            icon={Package}
            title="Fretes"
            description="Mudanças e cargas maiores."
            to="/passageiro/app"
          />
          <ServiceCard
            icon={Truck}
            title="Guincho"
            description="Remoção e transporte de veículos."
            to="/passageiro/app"
          />
        </ServicesGrid>

        <ServicesGrid title="Entregas">
          <ServiceCard
            icon={Send}
            title="MOVVI Envios"
            description="Enviar ou receber documentos e pequenos volumes."
            to="/passageiro/envios"
          />
        </ServicesGrid>
      </main>
      <BottomNav items={PASSENGER_NAV} theme="dark" />
    </div>
  );
}
