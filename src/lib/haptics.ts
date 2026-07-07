/**
 * MOVVI — Haptic feedback leve (vibração curta em Android/Chrome).
 *
 * Web Vibration API só existe em navegadores móveis; falha silenciosa
 * em desktop e iOS Safari. Nunca lança, nunca bloqueia.
 */
type HapticKind = "tap" | "select" | "success" | "warn";

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  select: 12,
  success: [10, 40, 18],
  warn: [20, 60, 20],
};

export function haptic(kind: HapticKind = "tap") {
  if (typeof navigator === "undefined") return;
  const v = (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate;
  if (typeof v !== "function") return;
  try {
    v.call(navigator, PATTERNS[kind] as number & number[]);
  } catch {
    /* noop */
  }
}
