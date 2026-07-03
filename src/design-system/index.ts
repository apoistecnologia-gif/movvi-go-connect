/**
 * MOVVI DRIVE — Design System
 * -----------------------------------------------------------------------------
 * Single source of truth for MOVVI's visual language.
 * Import from `@/design-system` (this barrel) in every new screen.
 *
 * Example:
 *   import { ds, DSCard, DSAvatar, DSStatusPill, HeadingM, Body } from "@/design-system";
 *
 * See `src/design-system/README.md` for full guidelines.
 */
export * from "./tokens";
export * from "./Typography";
export * from "./Card";
export * from "./Avatar";
export * from "./Icon";
export * from "./StatusPill";
export * from "./Loading";
export * from "./EmptyState";

// Re-export the shared premium Button + Sheet so consumers hit ONE import path.
export { Button as DSButton, buttonVariants as dsButtonVariants } from "@/components/ui/button";
export { MovviSheet as DSBottomSheet, type MovviSheetHandle as DSBottomSheetHandle } from "@/components/MovviSheet";
