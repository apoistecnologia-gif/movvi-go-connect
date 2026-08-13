import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// APOIS DS — unified button (56px height / 18px radius / consistent press animation).
const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[18px] text-[15px] font-semibold cursor-pointer select-none [-webkit-tap-highlight-color:transparent] transition-[transform,background-color,box-shadow,filter,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] active:opacity-95 [&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_0_0_color-mix(in_oklab,#fff_18%,transparent)_inset,0_14px_30px_-16px_color-mix(in_oklab,var(--color-primary)_75%,transparent),0_6px_14px_-10px_rgba(0,0,0,0.45)] hover:brightness-[1.05] hover:shadow-[0_1px_0_0_color-mix(in_oklab,#fff_22%,transparent)_inset,0_18px_36px_-16px_color-mix(in_oklab,var(--color-primary)_85%,transparent),0_8px_16px_-10px_rgba(0,0,0,0.5)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_8px_20px_-12px_color-mix(in_oklab,var(--color-destructive)_55%,transparent)] hover:brightness-[1.05]",
        outline:
          "border border-border/70 bg-transparent hover:bg-muted/40 hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/85",
        ghost: "hover:bg-muted/50 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Mobile-density pass: 48px primary CTA (was 56) — thumb-comfortable but no wasted height.
        default: "h-12 px-5",
        sm: "h-9 rounded-[12px] px-3.5 text-[13px]",
        lg: "h-12 rounded-[16px] px-7 text-[15px]",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);


export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
