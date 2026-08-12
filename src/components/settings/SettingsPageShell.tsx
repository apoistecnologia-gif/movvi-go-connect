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
      <div
        className={
          driver
            ? "relative flex min-h-dvh flex-col overflow-hidden bg-[#030405] text-white"
            : "flex min-h-dvh flex-col bg-[#F7F9F7]"
        }
      >
        {driver ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none fixed inset-x-0 top-0 h-[42vh]"
              style={{
                background:
                  "radial-gradient(circle at 82% 0%, rgba(246,190,28,.10), transparent 38%), linear-gradient(180deg, rgba(12,14,17,.88), transparent 72%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none fixed inset-x-0 bottom-0 h-[26vh] opacity-60"
              style={{ background: "linear-gradient(180deg,transparent,rgba(246,190,28,.025))" }}
            />
          </>
        ) : null}
        <div className="relative z-10">
          <MovviHeader logoutRedirect="/" />
        </div>
        <main
          className={driver ? "relative z-10 flex-1 px-4 pt-5 sm:px-5" : "flex-1 px-4 pt-4"}
          style={{ paddingBottom: hideBottomNav ? "2rem" : "max(8rem, env(safe-area-inset-bottom))" }}
        >
          <div className={driver ? "mx-auto w-full max-w-2xl space-y-6" : "mx-auto w-full max-w-2xl space-y-5"}>
            {children}
          </div>
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
      ? "border border-[#F6BE1C]/25 bg-[#F6BE1C]/10 text-[#F6BE1C] shadow-[0_14px_34px_-24px_rgba(246,190,28,.8)]"
      : "bg-[#76C139]/10 text-[#5A9A2A]";
  return (
    <section
      className={
        driver
          ? "animate-fade-in relative overflow-hidden rounded-[24px] border border-white/[0.07] bg-[linear-gradient(145deg,rgba(17,20,24,.96),rgba(7,9,11,.98))] px-4 py-4 shadow-[0_22px_54px_-36px_rgba(0,0,0,.98)]"
          : "animate-fade-in flex items-center justify-between gap-3 px-1"
      }
    >
      {driver ? (
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[#F6BE1C]/8 blur-2xl" />
      ) : null}
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconBg}`}>
            <Icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className={driver ? "truncate text-[25px] font-black tracking-[-0.03em] text-white" : "truncate text-[24px] font-bold tracking-tight text-[#1B1B1B]"}>{title}</h1>
            {subtitle ? <p className={driver ? "mt-1 truncate text-[12.5px] font-medium text-zinc-500" : "mt-0.5 truncate text-[13px] text-[#707070]"}>{subtitle}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </section>
  );
}
