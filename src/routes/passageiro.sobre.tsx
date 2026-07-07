import { createFileRoute, Link } from "@tanstack/react-router";
import { Globe2, Heart, Info, Shield, Zap } from "lucide-react";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import { PASSENGER_NAV } from "@/components/BottomNav";
import { MovviLogo } from "@/components/MovviLogo";

export const Route = createFileRoute("/passageiro/sobre")({
  head: () => ({ meta: [{ title: "Sobre — MOVVI" }, { name: "robots", content: "noindex" }] }),
  component: SobrePage,
});

const APP_VERSION = "1.0.0";

function SobrePage() {
  return (
    <SettingsPageShell nav={PASSENGER_NAV}>
      <SettingsHero
        icon={Info}
        title="Sobre a MOVVI"
        subtitle="Mobilidade urbana premium para todo o Brasil."
      />

      <section className="flex flex-col items-center gap-3 rounded-[24px] bg-white p-8 text-center shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
        <MovviLogo />
        <p className="text-[13px] text-[#707070]">
          Versão do app: <span className="font-mono text-[#1B1B1B]">{APP_VERSION}</span>
        </p>
        <p className="text-[12px] text-[#707070]">
          © {new Date().getFullYear()} MOVVI Tecnologia. Todos os direitos reservados.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Feature icon={Shield} title="Segurança em primeiro lugar" text="Verificação de motoristas, PIN de segurança e suporte 24/7." />
        <Feature icon={Zap} title="Tecnologia premium" text="Rastreamento em tempo real, despacho inteligente e mapas precisos." />
        <Feature icon={Globe2} title="Brasil inteiro" text="Operação em todas as regiões com tarifas justas e transparentes." />
        <Feature icon={Heart} title="Feito com carinho" text="Construído por quem se importa com passageiros e motoristas." />
      </div>

      <section className="overflow-hidden rounded-[24px] bg-white shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
        <LinkRow href="mailto:suporte@movvi.app" label="suporte@movvi.app" external />
        <LinkRow to="/passageiro/termos" label="Termos de Uso" />
        <LinkRow to="/passageiro/privacidade" label="Política de Privacidade" />
      </section>
    </SettingsPageShell>
  );
}

function Feature({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; title: string; text: string }) {
  return (
    <div className="rounded-[24px] bg-white p-5 shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#76C139]/10 text-[#5A9A2A]">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <h3 className="text-[14px] font-semibold text-[#1B1B1B]">{title}</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[#707070]">{text}</p>
    </div>
  );
}

function LinkRow({ href, to, label, external }: { href?: string; to?: string; label: string; external?: boolean }) {
  const cls = "block border-b border-[#F0F2F0] px-5 py-3.5 text-[14px] font-medium text-[#1B1B1B] transition last:border-b-0 hover:bg-[#F7F9F7] active:bg-[#F7F9F7]";
  if (to) return <Link to={to} className={cls}>{label}</Link>;
  return <a href={href} className={cls} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>{label}</a>;
}
