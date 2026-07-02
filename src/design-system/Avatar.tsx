/**
 * MOVVI DS — Avatar component with standardized sizes.
 */
import { forwardRef, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { dsAvatar } from "./tokens";

export type DSAvatarSize = keyof typeof dsAvatar; // "mini" | "sm" | "md" | "driver" | "profile"

export interface DSAvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "size"> {
  size?: DSAvatarSize;
  fallback?: string;
  bordered?: boolean;
}

export const DSAvatar = forwardRef<HTMLImageElement, DSAvatarProps>(
  ({ size = "md", fallback, bordered, className, alt = "", ...rest }, ref) => {
    const px = dsAvatar[size];
    return (
      <img
        ref={ref}
        alt={alt}
        width={px}
        height={px}
        style={{ width: px, height: px }}
        className={cn(
          "rounded-full object-cover bg-muted shrink-0",
          bordered && "border-2 border-white/80 shadow-[var(--ds-shadow-card)]",
          className,
        )}
        onError={(e) => {
          if (fallback) (e.currentTarget as HTMLImageElement).src = fallback;
        }}
        {...rest}
      />
    );
  },
);
DSAvatar.displayName = "DSAvatar";
