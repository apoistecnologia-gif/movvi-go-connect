import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
import { ApoisDriverBottomNav } from "@/components/ApoisDriverBottomNav";

type NavItems = ComponentProps<typeof BottomNav>["items"];
export type SettingsVisualVariant = "default" | "driver";
const SettingsVisualContext = createContext<SettingsVisualVariant>("default");
export const useSettingsVisual = () => useContext(SettingsVisualContext);

export function SettingsPageShell({
  children,
  hideBottomNav = false,
  nav = DRIVER_NAV,
  variant = "default",
}: {
  children: ReactNode;
  hideBottomNav?: boolean;
  nav?: NavItems;
  variant?: SettingsVisualVariant;
}) {
  const driver = variant === "driver";
  return (
    <SettingsVisualContext.Provider value={variant}>
      <div className={driver ? "flex min-h-dvh flex-col bg-[#050607] text-white" : "flex min-h-dvh flex-col bg-[#F7F9F7]"}>
        <MovviHeader logoutRedirect="/" />
        <main
          className="flex-1 px-4 pt-4"
          style={{ paddingBottom: hideBottomNav ? "2rem" : "max(8rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto w-full max-w-2xl space-y-5">{children}</div>
        </main>
        {!hideBottomNav ? (driver ? <ApoisDriverBottomNav /> : <BottomNav items={nav} />) : null}
      </div>
    </SettingsVisualContext.Provider>
  );
}

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
  const variant = useSettingsVisual();
  const driver = variant === "driver";
  const iconBg = tone === "danger"
    ? "bg-red-500/10 text-red-400"
    : driver
      ? "bg-[#F6BE1C]/12 text-[#F6BE1C] ring-1 ring-[#F6BE1C]/20"
      : "bg-[#76C139]/10 text-[#5A9A2A]";
  return (
    <section className="animate-fade-in flex items-center justify-between gap-3 px-1">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconBg}`}>
          <Icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h1 className={driver ? "truncate text-[24px] font-black tracking-tight text-white" : "truncate text-[24px] font-bold tracking-tight text-[#1B1B1B]"}>{title}</h1>
          {subtitle ? <p className={driver ? "mt-0.5 truncate text-[13px] text-zinc-500" : "mt-0.5 truncate text-[13px] text-[#707070]"}>{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  );
}
