import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";
import { HeadingS, Body } from "./Typography";

interface EmptyStateProps {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** DSEmptyState — friendly placeholder for empty lists / no-data screens. */
export function EmptyState({
  icon: IconCmp,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-border/60 bg-card/40 px-6 py-10 text-center",
        className,
      )}
    >
      {IconCmp ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <IconCmp width={22} height={22} aria-hidden="true" />
        </div>
      ) : null}
      <HeadingS>{title}</HeadingS>
      {description ? (
        <Body className="max-w-xs text-muted-foreground">{description}</Body>
      ) : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

export const DSEmptyState = EmptyState;
