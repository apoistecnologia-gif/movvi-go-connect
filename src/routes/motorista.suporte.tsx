import { createFileRoute } from "@tanstack/react-router";
import { Headphones, LifeBuoy, ShieldCheck } from "lucide-react";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import { HelpCenterView } from "@/components/support/HelpCenterView";
import { ApoisDriverBottomNav } from "@/components/ApoisDriverBottomNav";

export const Route = createFileRoute("/motorista/suporte")({
  head: () => ({
    meta: [
      { title: "Central de Ajuda — APOIS" },
      { name: "description", content: "Suporte, FAQ e contato da APOIS para motoristas." },
    ],
  }),
  component: SuporteMotorista,
});

function SuporteMotorista() {
  return (
    <div className="min-h-[100dvh] bg-[#050607] pb-[calc(env(safe-area-inset-bottom)+82px)] text-white">
      <SettingsPageShell variant="driver">
        <div className="relative overflow-hidden rounded-[28px] border border-[#F6BE1C]/15 bg-gradient-to-br from-[#1A160A] via-[#101214] to-[#08090A] p-1 shadow-[0_26px_70px_-42px_rgba(246,190,28,.75)]">
          <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-[#F6BE1C]/10 blur-3xl" />
          <div className="relative">
            <SettingsHero
              icon={LifeBuoy}
              title="Central de ajuda"
              subtitle="Perguntas frequentes, contato e suporte APOIS."
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-[20px] border border-white/5 bg-[#101214] p-3.5">
            <Headphones className="h-5 w-5 text-[#F6BE1C]" />
            <p className="mt-2 text-[11px] font-black text-white">Suporte APOIS</p>
            <p className="mt-1 text-[10px] font-medium leading-4 text-zinc-600">Ajuda para sua operação e conta.</p>
          </div>
          <div className="rounded-[20px] border border-white/5 bg-[#101214] p-3.5">
            <ShieldCheck className="h-5 w-5 text-[#F6BE1C]" />
            <p className="mt-2 text-[11px] font-black text-white">Ambiente seguro</p>
            <p className="mt-1 text-[10px] font-medium leading-4 text-zinc-600">Privacidade e segurança em primeiro lugar.</p>
          </div>
        </div>

        <HelpCenterView
          role="driver"
          termsHref="/motorista/termos"
          privacyHref="/motorista/privacidade"
        />
      </SettingsPageShell>
      <ApoisDriverBottomNav />
    </div>
  );
}
