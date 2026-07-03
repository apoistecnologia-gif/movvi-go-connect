/**
 * MOVVI DS — Empty state primitive.
 *
 * Consistent minimal empty screens (favorites, rides, earnings, notifications).
 * Provides an icon halo, headline, subtext, and an optional CTA slot.
 * Animates in softly to avoid jarring layout appearance.
 */
import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

interface DSEmptyStateProps {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function DSEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: DSEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center animate-fade-slide",
        className,
      )}
    >
      {Icon && (
        <div
          className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-primary)_10%,transparent)] text-primary"
          aria-hidden
        >
          <span className="absolute inset-0 rounded-full bg-[color-mix(in_oklab,var(--color-primary)_18%,transparent)] blur-lg opacity-60" />
          <Icon width={26} height={26} strokeWidth={1.75} className="relative" />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="max-w-[280px] text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
