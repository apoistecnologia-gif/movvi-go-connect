import { forwardRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** DSInput — unified text input. Preserves shadcn Input behavior (h-10, focus scrollIntoView). */
export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  ({ className, type, onFocus, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded-lg border border-input/70 bg-transparent px-3.5 py-1.5 text-base shadow-sm caret-primary",
        "transition-[border-color,box-shadow,background-color,transform] duration-200 ease-out",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-muted-foreground/75",
        "hover:border-input focus-visible:outline-none focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:bg-[color-mix(in_oklab,var(--color-surface)_60%,transparent)]",
        "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      onFocus={(e) => {
        const el = e.currentTarget;
        window.setTimeout(() => {
          try {
            el.scrollIntoView({ block: "center", behavior: "smooth" });
          } catch {
            /* noop */
          }
        }, 260);
        onFocus?.(e);
      }}
      {...props}
    />
  ),
);
Input.displayName = "DSInput";

export const DSInput = Input;
