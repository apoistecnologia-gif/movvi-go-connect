/**
 * MOVVI DS — Typography components.
 *
 * Thin semantic wrappers around the `dsText` presets. Use these in new screens
 * to guarantee consistent hierarchy without redesigning existing markup.
 */
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { dsText } from "./tokens";

type P = HTMLAttributes<HTMLElement>;
const make = (tag: keyof HTMLElementTagNameMap, cls: string, display: string) => {
  const Cmp = forwardRef<HTMLElement, P>(({ className, ...rest }, ref) => {
    const Tag = tag as any;
    return <Tag ref={ref} className={cn(cls, className)} {...rest} />;
  });
  Cmp.displayName = display;
  return Cmp;
};

export const Display    = make("h1",   dsText.display,   "DS.Display");
export const HeadingXL  = make("h1",   dsText.headingXL, "DS.HeadingXL");
export const HeadingL   = make("h2",   dsText.headingL,  "DS.HeadingL");
export const HeadingM   = make("h3",   dsText.headingM,  "DS.HeadingM");
export const HeadingS   = make("h4",   dsText.headingS,  "DS.HeadingS");
export const BodyLarge  = make("p",    dsText.bodyLarge, "DS.BodyLarge");
export const Body       = make("p",    dsText.body,      "DS.Body");
export const BodySmall  = make("p",    dsText.bodySmall, "DS.BodySmall");
export const Caption    = make("span", dsText.caption,   "DS.Caption");
export const Label      = make("span", dsText.label,     "DS.Label");
export const Metric     = make("span", dsText.metric,    "DS.Metric");
export const StatusText = make("span", dsText.status,    "DS.StatusText");
export const Code       = make("code", dsText.code,      "DS.Code");
