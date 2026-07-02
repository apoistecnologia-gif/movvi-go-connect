/**
 * MOVVI DS — Status pill and dot for ride/driver states.
 * Uses `dsStatus` tokens to guarantee consistent status appearance.
 */
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { dsStatus } from "./tokens";

export type DSStatusKey = keyof typeof dsStatus;

interface Props extends HTMLAttributes<HTMLSpanElement> {
  status: DSStatusKey;
  showDot?: boolean;
  label?: string;
}

export function DSStatusPill({ status, showDot = true, label, className, ...rest }: Props) {
  const meta = dsStatus[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
        "bg-[color-mix(in_oklab,var(--color-surface)_80%,transparent)] border border-border/60",
        className,
      )}
      {...rest}
    >
      {showDot && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full animate-pulse-soft"
          style={{ backgroundColor: meta.color }}
        />
      )}
      <span style={{ color: meta.color }}>{label ?? meta.label}</span>
    </span>
  );
}
