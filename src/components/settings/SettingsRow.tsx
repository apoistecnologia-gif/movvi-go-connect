import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Base row for a settings item: icon + title + optional hint on the left,
 * arbitrary control (switch, button, chevron) on the right.
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
}: {
  icon?: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  className?: string;
  onClick?: () => void;
  as?: "div" | "button";
  disabled?: boolean;
}) {
  const Tag = as as any;
  const interactive = as === "button" || !!onClick;
  return (
    <Tag
      type={as === "button" ? "button" : undefined}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 py-3 text-left",
        interactive &&
          "rounded-lg -mx-1 px-1 transition-colors active:scale-[0.99] active:opacity-90 hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
    >
      {Icon ? (
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/50 text-foreground/80">
          <Icon className="h-4 w-4" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{title}</div>
        {hint ? (
          <div className="truncate text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </Tag>
  );
}
