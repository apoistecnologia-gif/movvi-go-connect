import { createContext, useContext, useId, type ComponentProps, type ReactNode } from "react";
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
        className={driver
          ? "flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-[#050607] text-white"
          : "flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-[#F7F9F7] text-[#1B1B1B]"}
      >
        <MovviHeader logoutRedirect="/" />
        <main
          className="min-w-0 flex-1 pt-4"
          style={{
            paddingLeft: "max(16px, env(safe-area-inset-left))",
            paddingRight: "max(16px, env(safe-area-inset-right))",
            paddingBottom: hideBottomNav
              ? "calc(env(safe-area-inset-bottom) + 32px)"
              : driver
                ? "calc(env(safe-area-inset-bottom) + 112px)"
                : "calc(env(safe-area-inset-bottom) + 128px)",
          }}
        >
          <div className="mx-auto w-full min-w-0 max-w-2xl space-y-5">{children}</div>
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
  const titleId = useId();
  const subtitleId = useId();
  const driver = variant === "driver";
  const safeTitle = title.trim() || "Configurações";
  const safeSubtitle = subtitle?.trim() || "";
  const iconBg = tone === "danger"
    ? "bg-red-500/10 text-red-400 ring-1 ring-red-500/20"
    : driver
      ? "bg-[#F6BE1C]/12 text-[#F6BE1C] ring-1 ring-[#F6BE1C]/20"
      : "bg-[#76C139]/10 text-[#5A9A2A] ring-1 ring-[#76C139]/15";

  return (
    <section
      className="animate-fade-in min-w-0 px-1 motion-reduce:animate-none"
      aria-labelledby={titleId}
      aria-describedby={safeSubtitle ? subtitleId : undefined}
    >
      <div className="flex min-w-0 flex-col gap-3 min-[380px]:flex-row min-[380px]:items-start min-[380px]:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconBg}`} aria-hidden="true">
            <Icon className="h-[22px] w-[22px]" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h1
              id={titleId}
              className={driver
                ? "break-words text-[clamp(22px,6vw,24px)] font-black leading-tight tracking-tight text-white"
                : "break-words text-[clamp(22px,6vw,24px)] font-bold leading-tight tracking-tight text-[#1B1B1B]"}
            >
              {safeTitle}
            </h1>
            {safeSubtitle ? (
              <p
                id={subtitleId}
                className={driver
                  ? "mt-1 break-words text-[13px] leading-5 text-zinc-400"
                  : "mt-1 break-words text-[13px] leading-5 text-[#606060]"}
              >
                {safeSubtitle}
              </p>
            ) : null}
          </div>
        </div>
        {action ? (
          <div className="min-w-0 self-start min-[380px]:max-w-[45%] min-[380px]:shrink-0">
            {action}
          </div>
        ) : null}
      </div>
    </section>
  );
}
