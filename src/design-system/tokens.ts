/**
 * MOVVI DRIVE — Design Tokens (single source of truth)
 *
 * All values here MIRROR the CSS custom properties defined in `src/styles.css`.
 * Consume these tokens from TS/TSX code so future screens never hardcode
 * colors, spacing, radius, shadows or sizes.
 *
 * NOTHING here changes runtime behavior of existing screens — it centralizes
 * values so new code can reference `ds.color.primary` instead of `#8DD92B`.
 */

/* -------------------------------------------------------------------------- */
/*  COLORS — semantic tokens (bind to CSS vars, theme-aware)                  */
/* -------------------------------------------------------------------------- */
export const dsColor = {
  // Surfaces
  background: "var(--color-background)",
  surface: "var(--color-surface)",
  surfaceElevated: "var(--color-surface-2)",
  surfaceOverlay: "color-mix(in oklab, var(--color-surface) 92%, transparent)",
  card: "var(--color-card)",
  popover: "var(--color-popover)",

  // Text
  textPrimary: "var(--color-foreground)",
  textSecondary: "color-mix(in oklab, var(--color-foreground) 78%, transparent)",
  textMuted: "var(--color-muted-foreground)",

  // Brand
  primary: "var(--color-primary)",
  primaryHover: "color-mix(in oklab, var(--color-primary) 88%, white)",
  primaryActive: "color-mix(in oklab, var(--color-primary) 82%, black)",
  primaryForeground: "var(--color-primary-foreground)",
  primaryGlow: "var(--color-primary-glow)",
  secondary: "var(--color-secondary)",

  // Feedback
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  error: "var(--color-destructive)",

  // Structure
  border: "var(--color-border)",
  divider: "color-mix(in oklab, var(--color-border) 60%, transparent)",
  input: "var(--color-input)",
  ring: "var(--color-ring)",
  disabled: "color-mix(in oklab, var(--color-muted-foreground) 55%, transparent)",

  // Map + status
  mapAccent: "var(--color-map-accent)",
  online: "var(--color-online)",
  offline: "var(--color-offline)",
  shadow: "rgba(0, 0, 0, 0.5)",
} as const;

/* Raw MOVVI brand hex values (use only for map polylines, markers, SVGs) */
export const dsBrand = {
  greenPrimary: "#8DD92B",
  greenSecondary: "#5FAF1A",
  black: "#05070D",
  darkGray: "#121826",
  white: "#FFFFFF",
} as const;

/* -------------------------------------------------------------------------- */
/*  SPACING — 4px base scale                                                  */
/* -------------------------------------------------------------------------- */
export const dsSpace = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

/* -------------------------------------------------------------------------- */
/*  RADIUS                                                                    */
/* -------------------------------------------------------------------------- */
export const dsRadius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  xxl: 36,
  pill: 999,
  circle: "50%",
} as const;

/* -------------------------------------------------------------------------- */
/*  SHADOWS / ELEVATION                                                       */
/* -------------------------------------------------------------------------- */
export const dsShadow = {
  card: "var(--ds-shadow-card)",
  floating: "var(--ds-shadow-floating)",
  sheet: "var(--ds-shadow-sheet)",
  fab: "var(--ds-shadow-fab)",
  header: "var(--ds-shadow-header)",
  modal: "var(--ds-shadow-modal)",
} as const;

/* -------------------------------------------------------------------------- */
/*  TYPOGRAPHY                                                                */
/* -------------------------------------------------------------------------- */
export const dsFont = {
  display: "var(--font-display)",
  sans: "var(--font-sans)",
} as const;

/**
 * Reusable text style presets (Tailwind class strings so components can
 * spread them directly: `<h1 className={dsText.headingXL}>`).
 */
export const dsText = {
  display:    "font-display text-4xl font-semibold tracking-tight",
  headingXL:  "font-display text-3xl font-semibold tracking-tight",
  headingL:   "font-display text-2xl font-semibold tracking-tight",
  headingM:   "font-display text-xl font-semibold tracking-tight",
  headingS:   "font-display text-lg font-semibold tracking-tight",
  bodyLarge:  "text-base font-normal",
  body:       "text-sm font-normal",
  bodySmall:  "text-[13px] font-normal",
  caption:    "text-xs font-normal text-muted-foreground",
  button:     "text-sm font-medium",
  label:      "text-xs font-medium uppercase tracking-wide text-muted-foreground",
  metric:     "font-display text-2xl font-semibold tabular-nums tracking-tight",
  status:     "text-[11px] font-semibold uppercase tracking-wider",
  code:       "font-mono text-sm tabular-nums",
} as const;

/* -------------------------------------------------------------------------- */
/*  ICON + AVATAR SIZES (px)                                                  */
/* -------------------------------------------------------------------------- */
export const dsIcon = { sm: 14, md: 16, lg: 20, xl: 24, fab: 28 } as const;
export const dsAvatar = { mini: 28, sm: 40, md: 48, driver: 64, profile: 96 } as const;

/* -------------------------------------------------------------------------- */
/*  BOTTOM SHEET / MAP / BUTTON DIMENSIONS                                    */
/* -------------------------------------------------------------------------- */
export const dsSheet = {
  radius: 36,                // top corner radius (px)
  handleWidth: 40,           // drag handle width (px)
  handleHeight: 4,
  paddingX: 24,
  paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
  defaultSnaps: [32, 60, 88] as number[], // vh
} as const;

export const dsMap = {
  overlayGap: 12,            // gap between floating map overlays
  safeTop: "calc(env(safe-area-inset-top) + 12px)",
  safeBottom: "calc(env(safe-area-inset-bottom) + 24px)",
  floatingButtonSize: 44,
  markerShadow: "0 6px 14px -6px rgba(0,0,0,0.4)",
} as const;

export const dsButton = {
  height: { sm: 36, md: 44, lg: 48, icon: 44 },
  radius: { sm: 10, md: 12, lg: 20, icon: 999 },
  paddingX: { sm: 14, md: 20, lg: 32 },
} as const;

/* -------------------------------------------------------------------------- */
/*  ANIMATIONS — duration + easing tokens                                     */
/* -------------------------------------------------------------------------- */
export const dsMotion = {
  duration: {
    instant: 120,
    fast: 180,
    base: 240,
    slow: 320,
    slower: 480,
  },
  easing: {
    standard: "cubic-bezier(0.22, 1, 0.36, 1)",
    press:    "cubic-bezier(0.4, 0, 0.2, 1)",
    linear:   "linear",
  },
  /** Tailwind class presets already defined in styles.css */
  presets: {
    fadeIn:        "animate-fade-in",
    slideIn:       "animate-slide-in-right",
    scaleIn:       "animate-scale-in",
    pressScale:    "press-scale",
    activePress:   "active-press",
    pulseSoft:     "animate-pulse-soft",
    ringPulse:     "animate-ring-pulse",
    sheetIn:       "animate-sheet-in",
    countPop:      "animate-count-pop",
    cardIn:        "animate-card-in",
    indeterminate: "animate-movvi-indeterminate",
    float:         "animate-float",
  },
} as const;

/* -------------------------------------------------------------------------- */
/*  OPACITY + BORDERS                                                         */
/* -------------------------------------------------------------------------- */
export const dsOpacity = {
  disabled: 0.5,
  muted: 0.7,
  overlay: 0.55,
  scrim: 0.35,
} as const;

export const dsBorder = {
  thin: "1px solid var(--color-border)",
  hairline: "1px solid color-mix(in oklab, var(--color-border) 50%, transparent)",
  strong: "1px solid color-mix(in oklab, var(--color-border) 90%, transparent)",
  focus: "2px solid var(--color-ring)",
} as const;

/* -------------------------------------------------------------------------- */
/*  RIDE STATUS COLORS — status → semantic color                              */
/* -------------------------------------------------------------------------- */
export const dsStatus = {
  searching:      { color: dsColor.warning, label: "Buscando" },
  accepted:       { color: dsColor.primary, label: "Aceita" },
  driverComing:   { color: dsColor.primary, label: "A caminho" },
  arrived:        { color: dsColor.primaryGlow, label: "Chegou" },
  trip:           { color: dsColor.primary, label: "Em viagem" },
  finished:       { color: dsColor.success, label: "Finalizada" },
  cancelled:      { color: dsColor.error, label: "Cancelada" },
  online:         { color: dsColor.online, label: "Online" },
  offline:        { color: dsColor.offline, label: "Offline" },
} as const;

/* -------------------------------------------------------------------------- */
/*  Aggregate export — `import { ds } from "@/design-system/tokens"`          */
/* -------------------------------------------------------------------------- */
export const ds = {
  color: dsColor,
  brand: dsBrand,
  space: dsSpace,
  radius: dsRadius,
  shadow: dsShadow,
  font: dsFont,
  text: dsText,
  icon: dsIcon,
  avatar: dsAvatar,
  sheet: dsSheet,
  map: dsMap,
  button: dsButton,
  motion: dsMotion,
  opacity: dsOpacity,
  border: dsBorder,
  status: dsStatus,
} as const;

export type DesignSystem = typeof ds;
