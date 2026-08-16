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
  busy?: boolean;
  destructive?: boolean;
  titleId?: string;
  hintId?: string;
  ariaLabel?: string;
};

export function SettingsRow({
  icon: Icon,
  title,
  hint,
  right,
  className,
  onClick,
  as = "div",
  disabled = false,
  busy = false,
  destructive = false,
  titleId,
  hintId,
  ariaLabel,
}: SettingsRowProps) {
  const interactive = as === "button" || Boolean(onClick);
  const driver = useSettingsVisual() === "driver";
  const unavailable = disabled || busy;

  const rowClassName = cn(
    "flex min-h-12 w-full min-w-0 items-center gap-3 px-4 py-3.5 text-left transition motion-reduce:transition-none",
    driver && "max-[359px]:flex-wrap",
    interactive &&
      (driver
        ? "active:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F6BE1C] disabled:pointer-events-none disabled:opacity-60"
        : "active:bg-[#F7F9F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#76C139] disabled:pointer-events-none disabled:opacity-60"),
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
          id={titleId}
          className={cn(
            "break-words text-[14px] font-semibold leading-5",
            destructive ? "text-red-400" : driver ? "text-zinc-100" : "text-[#1B1B1B]",
          )}
        >
          {title}
        </div>
        {hint ? (
          <div
            id={hintId}
            className={
              driver
                ? "break-words text-[13px] leading-5 text-zinc-500"
                : "break-words text-[13px] leading-5 text-[#707070]"
            }
          >
            {hint}
          </div>
        ) : null}
      </div>

      {right ? (
        <div
          className={cn(
            "min-w-0 shrink-0",
            driver &&
              "max-[359px]:ml-[52px] max-[359px]:max-w-[calc(100%-52px)] max-[359px]:basis-full max-[359px]:shrink",
          )}
        >
          {right}
        </div>
      ) : null}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!unavailable) onClick?.();
        }}
        disabled={unavailable}
        aria-disabled={unavailable || undefined}
        aria-busy={busy || undefined}
        aria-label={ariaLabel}
        className={rowClassName}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={rowClassName}
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      aria-label={ariaLabel}
    >
      {content}
    </div>
  );
}
