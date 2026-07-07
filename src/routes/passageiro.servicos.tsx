import { createFileRoute } from "@tanstack/react-router";
import { Bike, Box, Briefcase, Car, PawPrint, Send, Truck } from "lucide-react";
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
          "Escolha o serviço MOVVI: corridas, entregas, guincho, mudanças e fretes grandes.",
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
            Corridas para pessoas, entregas de itens e serviços especiais —
            cada um com o fluxo certo.
          </p>
        </header>

        {/* A. Corridas — transporte de passageiros */}
        <ServicesGrid title="Corridas">
          <ServiceCard
            icon={Car}
            title="Carros"
            description="Viagens urbanas com conforto."
            to="/passageiro/app"
          />
          <ServiceCard
            icon={Bike}
            title="Motos"
            description="Ágil no trânsito, preço menor."
            to="/passageiro/app"
          />
          <ServiceCard
            icon={Briefcase}
            title="Executivo"
            description="Carros premium para reuniões e viagens de negócio."
            to="/passageiro/app"
          />
          <ServiceCard
            icon={PawPrint}
            title="Pet"
            description="Motorista preparado para levar seu pet com segurança."
            to="/passageiro/app"
          />
        </ServicesGrid>

        {/* B. Entregas */}
        <ServicesGrid title="Entregas">
          <ServiceCard
            icon={Send}
            title="MOVVI Envios"
            description="Enviar ou receber documentos e pequenos volumes."
            to="/passageiro/envios"
          />
        </ServicesGrid>

        {/* C. Serviços especiais — cada um com fluxo próprio */}
        <ServicesGrid title="Serviços especiais">
          <ServiceCard
            icon={Truck}
            title="MOVVI Guincho"
            description="Remoção e transporte de veículos com questionário guiado."
            to="/passageiro/guincho"
          />
          <ServiceCard
            icon={Box}
            title="MOVVI Mudanças"
            description="Mudanças, fretes grandes e cargas volumosas."
            to="/passageiro/mudancas"
          />
        </ServicesGrid>
      </main>
      <BottomNav items={PASSENGER_NAV} theme="dark" />
    </div>
  );
}
