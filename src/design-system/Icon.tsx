import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";
import { dsIcon } from "./tokens";

type LucideLike = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
type IconSize = keyof typeof dsIcon;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "size"> {
  as: LucideLike;
  size?: IconSize | number;
  className?: string;
}

/** DSIcon — enforces token sizes for any lucide-react icon. */
export function Icon({ as: Component, size = "md", className, ...rest }: IconProps) {
  const px = typeof size === "number" ? size : dsIcon[size];
  return (
    <Component
      width={px}
      height={px}
      className={cn("shrink-0", className)}
      aria-hidden="true"
      {...rest}
    />
  );
}

export const DSIcon = Icon;
