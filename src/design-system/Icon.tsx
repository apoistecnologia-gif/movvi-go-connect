/**
 * MOVVI DS — Icon wrapper enforcing standard sizes.
 * Wraps any lucide-react (or generic SVG) icon component.
 */
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";
import { dsIcon } from "./tokens";

export type DSIconSize = keyof typeof dsIcon;

interface Props extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  as: ComponentType<SVGProps<SVGSVGElement>>;
  size?: DSIconSize;
}

export function DSIcon({ as: Component, size = "md", className, ...rest }: Props) {
  const px = dsIcon[size];
  return (
    <Component
      width={px}
      height={px}
      strokeWidth={1.75}
      className={cn("shrink-0", className)}
      {...rest}
    />
  );
}
