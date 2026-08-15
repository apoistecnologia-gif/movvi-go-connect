/**
 * APOIS Design System — official entry point.
 *
 * Consume components and tokens from `@/design-system` only. Never import
 * the underlying implementation files directly from feature code.
 */

/* Tokens */
export * from "./tokens";
export { ds } from "./tokens";

/* Typography */
export {
  Typography,
  Display,
  HeadingXL,
  HeadingL,
  HeadingM,
  HeadingS,
  BodyLarge,
  Body,
  BodySmall,
  Caption,
  Label,
  Metric,
  StatusText,
  Code,
} from "./Typography";

/* Buttons (official DS button = premium shadcn Button) */
export { Button as DSButton, buttonVariants } from "@/components/ui/button";

/* Cards */
export {
  Card as DSCard,
  CardHeader as DSCardHeader,
  CardTitle as DSCardTitle,
  CardDescription as DSCardDescription,
  CardContent as DSCardContent,
  CardFooter as DSCardFooter,
} from "@/components/ui/card";

/* Bottom sheet */
export { MovviSheet, type MovviSheetHandle, type SheetSnap } from "@/components/MovviSheet";
export { MovviSheet as DSBottomSheet } from "@/components/MovviSheet";

/* Avatar */
export { Avatar } from "@/components/Avatar";
export { Avatar as DSAvatar } from "@/components/Avatar";

/* Icon */
export { Icon, DSIcon } from "./Icon";

/* Status pill */
export { StatusPill } from "./StatusPill";
export { StatusPill as DSStatusPill } from "./StatusPill";

/* Loading */
export { Loading, DSLoading } from "./Loading";

/* Empty state */
export { EmptyState, DSEmptyState } from "./EmptyState";

/* Badge */
export { Badge as DSBadge, badgeVariants } from "./Badge";

/* Input */
export { Input as DSInput } from "./Input";

/* Textarea */
export { Textarea as DSTextarea } from "./Textarea";

/* Label */
export { Label as DSLabel } from "./Label";

/* Select */
export {
  Select as DSSelect,
  SelectValue as DSSelectValue,
  SelectTrigger as DSSelectTrigger,
  SelectContent as DSSelectContent,
  SelectItem as DSSelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "./Select";
