import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-md bg-muted/40", className)}
      {...props}
    >
      <span
        aria-hidden
        className="absolute inset-0 -translate-x-full animate-movvi-indeterminate"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--color-foreground) 10%, transparent) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}

export { Skeleton };
