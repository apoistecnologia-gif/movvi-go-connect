import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";

/**
 * MOVVI DS — Shell padrão de toda tela secundária do motorista.
 * Fundo #F7F9F7, header MOVVI fixo, largura máxima 2xl,
 * espaçamento inferior seguro para a BottomNav.
 */
export function SettingsPageShell({
  children,
  hideBottomNav = false,
}: {
  children: ReactNode;
  hideBottomNav?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#F7F9F7]">
      <MovviHeader logoutRedirect="/" />
      <main
        className="flex-1 px-4 pt-4"
        style={{ paddingBottom: hideBottomNav ? "2rem" : "max(8rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto w-full max-w-2xl space-y-5">{children}</div>
      </main>
      {!hideBottomNav ? <BottomNav items={DRIVER_NAV} /> : null}
    </div>
  );
}

/**
 * MOVVI DS — Hero header padrão das telas secundárias.
 * Título grande, subtítulo pequeno, ícone verde em tile arredondado.
 * Mesma proporção da tela de Perfil.
 */
export function SettingsHero({
  icon: Icon,
  title,
  subtitle,
  action,
  tone = "primary",
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  tone?: "primary" | "danger";
}) {
  const iconBg = tone === "danger" ? "bg-[#FEE2E2] text-[#DC2626]" : "bg-[#76C139]/10 text-[#5A9A2A]";
  return (
    <section
      className="animate-fade-in flex items-center justify-between gap-3 px-1"
      style={{ animationDelay: "0ms", animationFillMode: "backwards" }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconBg}`}>
          <Icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-[24px] font-bold tracking-tight text-[#1B1B1B]">{title}</h1>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[13px] text-[#707070]">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  );
}
