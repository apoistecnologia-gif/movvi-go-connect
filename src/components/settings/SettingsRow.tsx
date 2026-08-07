import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * APOIS DS — Settings row.
 * Matches the Profile MenuRow: 40px rounded green icon tile,
 * 15px semibold title, 12.5px muted hint, right-aligned control.
 */
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
}: {
  icon?: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  className?: string;
  onClick?: () => void;
  as?: "div" | "button";
  disabled?: boolean;
  destructive?: boolean;
}) {
  const Tag = as as any;
  const interactive = as === "button" || !!onClick;
  return (
    <Tag
      type={as === "button" ? "button" : undefined}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3.5 text-left transition",
        interactive && "active:bg-[#F7F9F7] disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
    >
      {Icon ? (
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
            destructive
              ? "bg-[#FEE2E2] text-[#DC2626]"
              : "bg-[#76C139]/10 text-[#5A9A2A]",
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-[15px] font-semibold",
            destructive ? "text-[#DC2626]" : "text-[#1B1B1B]",
          )}
        >
          {title}
        </div>
        {hint ? (
          <div className="truncate text-[12.5px] text-[#707070]">{hint}</div>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </Tag>
  );
}
