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
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklab, ${meta.color} 14%, var(--color-surface))`,
        border: `1px solid color-mix(in oklab, ${meta.color} 45%, transparent)`,
        boxShadow: `0 0 0 1px color-mix(in oklab, ${meta.color} 10%, transparent) inset`,
      }}
      {...rest}
    >
      {showDot && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full animate-pulse-soft"
          style={{
            backgroundColor: meta.color,
            boxShadow: `0 0 8px 0 color-mix(in oklab, ${meta.color} 60%, transparent)`,
          }}
        />
      )}
      <span style={{ color: meta.color }}>{label ?? meta.label}</span>
    </span>
  );
}
