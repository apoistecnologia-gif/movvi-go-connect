/**
 * MOVVI DS — Standardized loading primitives.
 */
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function DSSpinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={cn("inline-block animate-spin rounded-full border-2 border-current border-t-transparent", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function DSSkeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-md bg-muted/50", className)}
      {...rest}
    >
      <span
        className="absolute inset-0 -translate-x-full animate-movvi-indeterminate"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--color-foreground) 10%, transparent) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}

export function DSProgressIndeterminate({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-1 w-full overflow-hidden rounded-full bg-muted/60", className)}>
      <span
        className="absolute inset-y-0 left-0 w-2/5 rounded-full animate-movvi-indeterminate"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, var(--color-primary) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}

export function DSPlaceholder({ label = "Sem dados", className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-[20px] border border-dashed border-border/60 p-8 text-sm text-muted-foreground",
        className,
      )}
    >
      {label}
    </div>
  );
}
