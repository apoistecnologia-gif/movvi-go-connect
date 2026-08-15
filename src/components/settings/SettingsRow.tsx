import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSettingsVisual } from "./SettingsPageShell";

type SettingsRowProps = {
  icon?: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  className?: string;
  onClick?: () => void;
  as?: "div" | "button";
  disabled?: boolean;
  destructive?: boolean;
};

export function SettingsRow({
  icon: Icon,
  title,
  hint,
  right,
  className,
  onClick,
  as = "div",
  disabled,
  destructive,
}: SettingsRowProps) {
  const interactive = as === "button" || !!onClick;
  const driver = useSettingsVisual() === "driver";
  const rowClassName = cn(
    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition",
    driver && "max-[359px]:flex-wrap",
    interactive &&
      (driver
        ? "active:bg-white/5 disabled:pointer-events-none disabled:opacity-60"
        : "active:bg-[#F7F9F7] disabled:pointer-events-none disabled:opacity-60"),
    className,
  );

  const content = (
    <>
      {Icon ? (
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
            destructive
              ? "bg-red-500/10 text-red-400"
              : driver
                ? "bg-black text-[#F6BE1C] ring-1 ring-white/5"
                : "bg-[#76C139]/10 text-[#5A9A2A]",
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-[14px] font-semibold",
            destructive ? "text-red-400" : driver ? "text-zinc-100" : "text-[#1B1B1B]",
          )}
        >
          {title}
        </div>
        {hint ? (
          <div
            className={
              driver
                ? "text-[11.5px] leading-4 text-zinc-600 [overflow-wrap:anywhere]"
                : "truncate text-[12.5px] text-[#707070]"
            }
          >
            {hint}
          </div>
        ) : null}
      </div>
      {right ? (
        <div className={cn("shrink-0", driver && "max-[359px]:ml-[52px] max-[359px]:max-w-[calc(100%-52px)] max-[359px]:shrink max-[359px]:basis-full")}>
          {right}
        </div>
      ) : null}
    </>
  );

  if (as === "button") {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={rowClassName}>
        {content}
      </button>
    );
  }

  return (
    <div onClick={onClick} className={rowClassName}>
      {content}
    </div>
  );
}
