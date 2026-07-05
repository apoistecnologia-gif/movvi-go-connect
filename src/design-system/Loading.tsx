import type { HTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  label?: string;
}

/** DSLoading — centered spinner with optional label. */
export function Loading({ size = 24, label, className, ...rest }: LoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground", className)}
      {...rest}
    >
      <Loader2 className="animate-spin" style={{ width: size, height: size }} />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  );
}

export const DSLoading = Loading;
