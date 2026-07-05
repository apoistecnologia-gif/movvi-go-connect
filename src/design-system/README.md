# MOVVI DRIVE — Design System

The single source of visual truth for MOVVI. Consume tokens & components from
`@/design-system` instead of hardcoding colors, spacing, sizes or shadows.

```ts
import {
  ds,
  DSCard, DSAvatar, DSButton, DSBottomSheet, DSStatusPill, DSIcon,
  DSSpinner, DSSkeleton, DSProgressIndeterminate,
  DSBadge, DSInput, DSTextarea, DSLabel,
  DSSelect, DSSelectTrigger, DSSelectValue, DSSelectContent, DSSelectItem,
  DSLoading, DSEmptyState,
  HeadingXL, HeadingM, Body, Caption, Metric, Label,
} from "@/design-system";
```

## Tokens (`ds.*`)

| Group        | Access               | Example                                    |
| ------------ | -------------------- | ------------------------------------------ |
| Colors       | `ds.color.*`         | `ds.color.primary`, `ds.color.textMuted`   |
| Brand hex    | `ds.brand.*`         | `ds.brand.greenPrimary` (map polylines)    |
| Spacing (px) | `ds.space[1..12]`    | `ds.space[4]` → `16`                       |
| Radius       | `ds.radius.*`        | `ds.radius.lg` → `20`                      |
| Shadows      | `ds.shadow.*`        | `ds.shadow.floating`                       |
| Typography   | `ds.text.*`          | `ds.text.headingM` (Tailwind class string) |
| Icon sizes   | `ds.icon.md`         | `16`                                       |
| Avatar sizes | `ds.avatar.driver`   | `64`                                       |
| Sheet dims   | `ds.sheet.*`         | `ds.sheet.defaultSnaps` → `[32,60,88]`     |
| Map overlay  | `ds.map.*`           | `ds.map.safeTop`                           |
| Motion       | `ds.motion.*`        | `ds.motion.presets.pressScale`             |
| Status       | `ds.status.online`   | `{ color, label }`                         |

Tokens mirror CSS variables in `src/styles.css`, so switching theme values
propagates through every consumer automatically.

## Components

- **Typography**: `Display`, `HeadingXL/L/M/S`, `Body(Large|Small)`, `Caption`,
  `Label`, `Metric`, `StatusText`, `Code`.
- **DSCard** — variants: `default | driver | passenger | metric | address |
  payment | status | ride`. `elevated` boosts to floating shadow.
- **DSAvatar** — `size: mini(28) | sm(40) | md(48) | driver(64) | profile(96)`.
- **DSIcon** — enforces `sm | md | lg | xl | fab` for any Lucide icon.
- **DSStatusPill** — pill + animated dot bound to `ds.status.*`.
- **DSButton** — re-export of the premium shadcn Button (variants: `default,
  destructive, outline, secondary, ghost, link`; sizes: `sm, default, lg, icon`).
- **DSBottomSheet** — re-export of `MovviSheet` (spring physics, `ds.sheet` defaults).
- **DSSpinner / DSSkeleton / DSProgressIndeterminate / DSPlaceholder**.
- **DSBadge** — small status pill (`default | muted | primary | success | danger | warning | outline`). Prefer over ad-hoc span classNames.
- **DSInput / DSTextarea / DSLabel** — unified form primitives (h-10 input, focus scroll-into-view).
- **DSSelect + DSSelectTrigger/Value/Content/Item** — unified select primitives.
- **DSLoading** — centered spinner with optional label (`role="status"`, `aria-live="polite"`).
- **DSEmptyState** — icon + title + description + optional action for empty lists.

## Animation presets

CSS utilities defined in `styles.css`:
`animate-fade-in`, `animate-scale-in`, `animate-slide-in-right`,
`animate-sheet-in`, `animate-count-pop`, `animate-pulse-soft`,
`animate-ring-pulse`, `animate-card-in`, `animate-movvi-indeterminate`,
`animate-float`, plus `press-scale` and `active-press` for tap feedback.

## Rules for new screens

1. **Never hardcode colors** — use `ds.color.*` or Tailwind semantic classes
   (`bg-card`, `text-muted-foreground`, `border-border`).
2. **Never hardcode spacing/radius/shadow** — reference `ds.space`, `ds.radius`,
   `ds.shadow` (or their Tailwind equivalents).
3. **All buttons** go through `DSButton`.
4. **All bottom sheets** go through `DSBottomSheet` with `ds.sheet.defaultSnaps`
   unless the screen has a documented reason to differ.
5. **All avatars** go through `DSAvatar` with a token size.
6. **All ride/driver status labels** go through `DSStatusPill`.
7. **All map overlays** respect `ds.map.safeTop` / `ds.map.safeBottom` and use
   `ds.shadow.floating`.
8. **Typography** uses the DS components — no ad-hoc `text-xl font-bold` for
   headings.

## Non-goals

- This pass does **not** migrate existing screens. Current visuals remain
  identical; the DS is additive infrastructure to be consumed by all future
  work and gradually adopted during unrelated edits.
- The DS does **not** change ride flow, backend, routes, GPS, realtime,
  dispatch, RLS, or any business logic.
