import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { EmergencyContactsManager } from "@/components/safety/EmergencyContactsManager";

export const Route = createFileRoute("/passageiro/seguranca")({
  head: () => ({
    meta: [
      { title: "Segurança — MOVVI" },
      { name: "description", content: "Contatos de emergência e recursos de segurança MOVVI." },
    ],
  }),
  component: PassengerSafetyPage,
});

function PassengerSafetyPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <MovviHeader title="Segurança" />
      <main className="mx-auto max-w-md space-y-4 px-4 pt-4">
        <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/25">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-bold">Sua segurança em primeiro lugar</div>
              <div className="text-[12px] text-muted-foreground">
                Cadastre um contato de confiança. Ele aparece no botão de emergência durante suas corridas.
              </div>
            </div>
          </div>
        </section>

        <EmergencyContactsManager role="passenger" />

        <p className="text-center text-[11px] text-muted-foreground">
          Em caso de emergência real, ligue 190. A MOVVI registra alertas SOS com sua localização e dados da corrida.
        </p>
      </main>
      <BottomNav items={PASSENGER_NAV} />
    </div>
  );
}
