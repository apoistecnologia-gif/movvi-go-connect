import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { dsStatus } from "./tokens";

type StatusKey = keyof typeof dsStatus;

interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  status: StatusKey;
  label?: string;
  pulse?: boolean;
}

/** DSStatusPill — pill + optional pulsing dot bound to ds.status tokens. */
export function StatusPill({
  status,
  label,
  pulse = true,
  className,
  ...rest
}: StatusPillProps) {
  const s = dsStatus[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
        className,
      )}
      style={{
        color: s.color,
        borderColor: `color-mix(in oklab, ${s.color} 40%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${s.color} 12%, transparent)`,
      }}
      {...rest}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", pulse && "animate-pulse-soft")}
        style={{ backgroundColor: s.color }}
      />
      {label ?? s.label}
    </span>
  );
}
