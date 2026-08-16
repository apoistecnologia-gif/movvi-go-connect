import { createFileRoute } from "@tanstack/react-router";
import { Headphones, LifeBuoy, ShieldCheck } from "lucide-react";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import { HelpCenterView } from "@/components/support/HelpCenterView";

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
    <div className="relative min-h-[100dvh] min-w-0 overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(246,190,28,0.11),transparent_64%)]" aria-hidden="true" />
      <div className="relative min-w-0">
        <SettingsPageShell variant="driver">
          <div className="relative min-w-0 overflow-hidden rounded-[30px] border border-[#F6BE1C]/20 bg-gradient-to-br from-[#211A08] via-[#101214] to-[#08090A] p-1 shadow-[0_28px_78px_-42px_rgba(246,190,28,.82)]">
            <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-[#F6BE1C]/12 blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-16 -left-14 h-32 w-32 rounded-full bg-white/[0.025] blur-3xl" aria-hidden="true" />
            <div className="relative min-w-0">
              <SettingsHero
                icon={LifeBuoy}
                title="Central de ajuda"
                subtitle="Perguntas frequentes, contato e suporte APOIS."
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5 max-[339px]:grid-cols-1">
            <section className="min-w-0 rounded-[22px] border border-white/[0.06] bg-[#101214]/95 p-4 shadow-[0_18px_46px_-34px_rgba(0,0,0,.95)] backdrop-blur-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#F6BE1C]/18 bg-[#F6BE1C]/10 text-[#F6BE1C] shadow-[0_10px_28px_-20px_rgba(246,190,28,.75)]" aria-hidden="true">
                <Headphones className="h-5 w-5" />
              </div>
              <p className="mt-3 break-words text-[11px] font-black leading-4 text-white">Suporte APOIS</p>
              <p className="mt-1 break-words text-[10px] font-medium leading-4 text-zinc-600">Ajuda para sua operação e conta.</p>
            </section>
            <section className="min-w-0 rounded-[22px] border border-white/[0.06] bg-[#101214]/95 p-4 shadow-[0_18px_46px_-34px_rgba(0,0,0,.95)] backdrop-blur-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#F6BE1C]/18 bg-[#F6BE1C]/10 text-[#F6BE1C] shadow-[0_10px_28px_-20px_rgba(246,190,28,.75)]" aria-hidden="true">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <p className="mt-3 break-words text-[11px] font-black leading-4 text-white">Ambiente seguro</p>
              <p className="mt-1 break-words text-[10px] font-medium leading-4 text-zinc-600">Privacidade e segurança em primeiro lugar.</p>
            </section>
          </div>

          <HelpCenterView
            role="driver"
            termsHref="/motorista/termos"
            privacyHref="/motorista/privacidade"
          />
        </SettingsPageShell>
      </div>
    </div>
  );
}
