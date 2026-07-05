import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-muted/20 text-foreground",
        muted: "border-border/60 text-muted-foreground",
        primary: "border-primary/40 bg-primary/15 text-primary",
        success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        danger: "border-red-500/30 bg-red-500/10 text-red-300",
        warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/** DSBadge — small status pill. Prefer over ad-hoc span classNames. */
export function Badge({ className, variant, ...rest }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...rest} />;
}

export const DSBadge = Badge;
export { badgeVariants };
