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
    "flex min-h-11 w-full min-w-0 items-center gap-3 px-4 py-3.5 text-left transition",
    driver && "max-[359px]:flex-wrap",
    interactive &&
      (driver
        ? "active:bg-white/5 disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F6BE1C]"
        : "active:bg-[#F7F9F7] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#76C139]"),
    className,
  );

  const content = (
    <>
      {Icon ? (
        <div
          aria-hidden="true"
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
            "break-words text-[14px] font-semibold leading-5",
            destructive ? "text-red-400" : driver ? "text-zinc-100" : "text-[#1B1B1B]",
          )}
        >
          {title}
        </div>
        {hint ? (
          <div
            className={
              driver
                ? "break-words text-[11.5px] leading-4 text-zinc-600"
                : "break-words text-[12.5px] leading-5 text-[#707070]"
            }
          >
            {hint}
          </div>
        ) : null}
      </div>
      {right ? (
        <div className={cn("min-w-0 shrink-0", driver && "max-[359px]:ml-[52px] max-[359px]:max-w-[calc(100%-52px)] max-[359px]:shrink max-[359px]:basis-full")}>
          {right}
        </div>
      ) : null}
    </>
  );

  if (interactive) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={rowClassName}>
        {content}
      </button>
    );
  }

  return <div className={rowClassName}>{content}</div>;
}
