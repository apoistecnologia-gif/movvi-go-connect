import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { dsText } from "./tokens";

type Variant = keyof typeof dsText;

interface TypographyProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: Variant;
  className?: string;
  children?: ReactNode;
}

const defaultTag: Partial<Record<Variant, ElementType>> = {
  display: "h1",
  headingXL: "h1",
  headingL: "h2",
  headingM: "h3",
  headingS: "h4",
  bodyLarge: "p",
  body: "p",
  bodySmall: "p",
  caption: "span",
  button: "span",
  label: "span",
  metric: "span",
  status: "span",
  code: "code",
};

export function Typography({
  as,
  variant = "body",
  className,
  children,
  ...rest
}: TypographyProps) {
  const Tag = (as ?? defaultTag[variant] ?? "span") as ElementType;
  return (
    <Tag className={cn(dsText[variant], className)} {...rest}>
      {children}
    </Tag>
  );
}

/* Convenience aliases so screens can import a single named component. */
const make = (variant: Variant) =>
  function T(props: Omit<TypographyProps, "variant">) {
    return <Typography variant={variant} {...props} />;
  };

export const Display     = make("display");
export const HeadingXL   = make("headingXL");
export const HeadingL    = make("headingL");
export const HeadingM    = make("headingM");
export const HeadingS    = make("headingS");
export const BodyLarge   = make("bodyLarge");
export const Body        = make("body");
export const BodySmall   = make("bodySmall");
export const Caption     = make("caption");
export const Label       = make("label");
export const Metric      = make("metric");
export const StatusText  = make("status");
export const Code        = make("code");
