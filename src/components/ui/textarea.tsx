import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[64px] w-full rounded-lg border border-input/70 bg-transparent px-3.5 py-2 text-base shadow-sm caret-primary",
          "transition-[border-color,box-shadow,background-color] duration-200 ease-out",
          "placeholder:text-muted-foreground/75",
          "hover:border-input focus-visible:outline-none focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:bg-[color-mix(in_oklab,var(--color-surface)_60%,transparent)]",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
