/**
 * MOVVI DS — Card primitives.
 *
 * Standardized card container + variant presets used across ride, driver,
 * passenger, address, payment, metric and status contexts. Existing screens
 * are not migrated automatically — new screens should prefer <DSCard variant="…">.
 */
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type DSCardVariant =
  | "default"
  | "driver"
  | "passenger"
  | "metric"
  | "address"
  | "payment"
  | "status"
  | "ride";

const base =
  "relative rounded-[20px] bg-card text-card-foreground border border-border/60 shadow-[var(--ds-shadow-card)] transition-colors";

const variants: Record<DSCardVariant, string> = {
  default:   "p-4",
  driver:    "p-5 flex items-center gap-4",
  passenger: "p-5 flex items-center gap-4",
  metric:    "p-4 flex flex-col gap-1",
  address:   "p-4 flex items-start gap-3",
  payment:   "p-4 flex items-center justify-between gap-3",
  status:    "p-3 flex items-center gap-2 rounded-full",
  ride:      "p-5 flex flex-col gap-3",
};

export interface DSCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: DSCardVariant;
  elevated?: boolean;
}

export const DSCard = forwardRef<HTMLDivElement, DSCardProps>(
  ({ variant = "default", elevated, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        base,
        variants[variant],
        elevated && "shadow-[var(--ds-shadow-floating)]",
        className,
      )}
      {...rest}
    />
  ),
);
DSCard.displayName = "DSCard";
