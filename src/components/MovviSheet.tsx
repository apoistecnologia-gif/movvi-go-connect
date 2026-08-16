import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
  type ReactNode,
} from "react";

/**
 * MovviSheet — bottom sheet próprio do APOIS.
 *
 * - Snap points em % da altura da viewport.
 * - Acompanha o dedo em tempo real (pointer events + rAF).
 * - Elástico nas bordas (resistência além do snap extremo).
 * - Mola suave (spring) ao soltar, escolhe o snap mais próximo
 *   levando em conta a velocidade do gesto (flick).
 * - Conteúdo interno só rola quando o sheet está totalmente aberto,
 *   evitando conflito de gesto com o arraste.
 */

export type SheetSnap = number; // em vh (0-100)

export interface MovviSheetHandle {
  snapTo: (snap: SheetSnap) => void;
  current: () => SheetSnap;
}

interface Props {
  snaps: SheetSnap[];
  initial?: SheetSnap;
  onSnapChange?: (s: SheetSnap) => void;
  children: ReactNode;
  footer?: ReactNode;
}

const SPRING_STIFFNESS = 0.18;
const SPRING_DAMPING = 0.78;
const VELOCITY_THRESHOLD = 0.32;
const FALLBACK_SNAP = 30;

function normalizeSnaps(snaps: SheetSnap[]) {
  const valid = snaps
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.min(100, Math.max(0, value)));
  const unique = [...new Set(valid)].sort((a, b) => a - b);
  return unique.length ? unique : [FALLBACK_SNAP];
}

function nearestSnap(snaps: number[], value: number) {
  const safeValue = Number.isFinite(value) ? value : snaps[0];
  return snaps.reduce((best, snap) =>
    Math.abs(snap - safeValue) < Math.abs(best - safeValue) ? snap : best,
  snaps[0]);
}

export const MovviSheet = forwardRef<MovviSheetHandle, Props>(function MovviSheet(
  { snaps, initial, onSnapChange, children, footer },
  ref,
) {
  const sortedSnaps = useMemo(() => normalizeSnaps(snaps), [snaps]);
  const minSnap = sortedSnaps[0];
  const maxSnap = sortedSnaps[sortedSnaps.length - 1];
  const initialSnap = nearestSnap(sortedSnaps, initial ?? minSnap);

  const [height, setHeight] = useState<number>(initialSnap);
  const heightRef = useRef<number>(initialSnap);
  const targetRef = useRef<number>(initialSnap);
  const velocityRef = useRef<number>(0);
  const draggingRef = useRef<boolean>(false);
  const rafRef = useRef<number | null>(null);
  const focusRestoreTimerRef = useRef<number | null>(null);
  const lastMoveRef = useRef<{ y: number; t: number } | null>(null);
  const startRef = useRef<{ y: number; h: number; t: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const setHeightBoth = useCallback((h: number) => {
    if (!Number.isFinite(h)) return;
    heightRef.current = h;
    setHeight(h);
  }, []);

  const animateTo = useCallback(
    (requestedTarget: number) => {
      const target = nearestSnap(sortedSnaps, requestedTarget);
      targetRef.current = target;
      if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        velocityRef.current = 0;
        setHeightBoth(target);
        return;
      }
      if (rafRef.current != null) return;
      const step = () => {
        const cur = heightRef.current;
        const tgt = targetRef.current;
        const diff = tgt - cur;
        velocityRef.current += diff * SPRING_STIFFNESS;
        velocityRef.current *= SPRING_DAMPING;
        const next = cur + velocityRef.current;
        if (Math.abs(diff) < 0.05 && Math.abs(velocityRef.current) < 0.05) {
          setHeightBoth(tgt);
          velocityRef.current = 0;
          rafRef.current = null;
          return;
        }
        setHeightBoth(next);
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [setHeightBoth, sortedSnaps],
  );

  const settle = useCallback(
    (releaseVelocity: number) => {
      const cur = heightRef.current;
      let target = nearestSnap(sortedSnaps, cur);
      if (Math.abs(releaseVelocity) > VELOCITY_THRESHOLD) {
        if (releaseVelocity > 0) {
          target = sortedSnaps.find((s) => s > cur + 1) ?? maxSnap;
        } else {
          const below = [...sortedSnaps].reverse().find((s) => s < cur - 1);
          target = below ?? minSnap;
        }
      }
      velocityRef.current = Number.isFinite(releaseVelocity) ? releaseVelocity * 4 : 0;
      animateTo(target);
      onSnapChange?.(target);
    },
    [animateTo, maxSnap, minSnap, onSnapChange, sortedSnaps],
  );

  useImperativeHandle(
    ref,
    () => ({
      snapTo: (snap: SheetSnap) => {
        const target = nearestSnap(sortedSnaps, snap);
        velocityRef.current = 0;
        animateTo(target);
        onSnapChange?.(target);
      },
      current: () => nearestSnap(sortedSnaps, heightRef.current),
    }),
    [animateTo, onSnapChange, sortedSnaps],
  );

  useEffect(() => {
    const target = nearestSnap(sortedSnaps, heightRef.current);
    if (Math.abs(target - heightRef.current) > 0.05) {
      velocityRef.current = 0;
      setHeightBoth(target);
      onSnapChange?.(target);
    }
  }, [onSnapChange, setHeightBoth, sortedSnaps]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (focusRestoreTimerRef.current != null) window.clearTimeout(focusRestoreTimerRef.current);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    draggingRef.current = true;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    velocityRef.current = 0;
    const now = performance.now();
    startRef.current = { y: e.clientY, h: heightRef.current, t: now };
    lastMoveRef.current = { y: e.clientY, t: now };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current || !startRef.current) return;
    const vh = Math.max(1, window.innerHeight);
    const dy = startRef.current.y - e.clientY;
    let nextH = startRef.current.h + (dy / vh) * 100;

    if (nextH > maxSnap) {
      const over = nextH - maxSnap;
      nextH = maxSnap + over * 0.35;
    } else if (nextH < minSnap) {
      const under = minSnap - nextH;
      nextH = minSnap - under * 0.35;
    }

    const now = performance.now();
    if (lastMoveRef.current) {
      const dt = Math.max(1, now - lastMoveRef.current.t);
      const dvh = ((lastMoveRef.current.y - e.clientY) / vh) * 100;
      velocityRef.current = dvh / dt;
    }
    lastMoveRef.current = { y: e.clientY, t: now };
    setHeightBoth(nextH);
  }

  function onPointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const v = velocityRef.current;
    startRef.current = null;
    lastMoveRef.current = null;
    settle(v);
  }

  function moveByKeyboard(direction: 1 | -1) {
    const current = nearestSnap(sortedSnaps, heightRef.current);
    const index = sortedSnaps.indexOf(current);
    const nextIndex = Math.min(sortedSnaps.length - 1, Math.max(0, index + direction));
    const target = sortedSnaps[nextIndex];
    velocityRef.current = 0;
    animateTo(target);
    onSnapChange?.(target);
  }

  useEffect(() => {
    if (heightRef.current <= minSnap + 2 && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [height, minSnap]);

  const preFocusSnapRef = useRef<number | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);

  useEffect(() => {
    const root = sheetRef.current;
    if (!root) return;

    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isEditable(e.target)) return;
      if (focusRestoreTimerRef.current != null) {
        window.clearTimeout(focusRestoreTimerRef.current);
        focusRestoreTimerRef.current = null;
      }
      if (preFocusSnapRef.current == null) preFocusSnapRef.current = nearestSnap(sortedSnaps, heightRef.current);
      if (heightRef.current < maxSnap - 1) {
        velocityRef.current = 0;
        animateTo(maxSnap);
        onSnapChange?.(maxSnap);
      }
      requestAnimationFrame(() => {
        try {
          (e.target as HTMLElement).scrollIntoView({ block: "nearest", behavior: "smooth" });
        } catch { /* noop */ }
      });
    };

    const onFocusOut = (e: FocusEvent) => {
      if (!isEditable(e.target)) return;
      focusRestoreTimerRef.current = window.setTimeout(() => {
        focusRestoreTimerRef.current = null;
        const active = document.activeElement;
        if (root.contains(active) && isEditable(active)) return;
        const prev = preFocusSnapRef.current;
        preFocusSnapRef.current = null;
        if (prev != null && Math.abs(heightRef.current - prev) > 1) {
          velocityRef.current = 0;
          animateTo(prev);
          onSnapChange?.(prev);
        }
      }, 50);
    };

    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      if (focusRestoreTimerRef.current != null) {
        window.clearTimeout(focusRestoreTimerRef.current);
        focusRestoreTimerRef.current = null;
      }
    };
  }, [animateTo, maxSnap, onSnapChange, sortedSnaps]);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(Number.isFinite(kb) && kb > 40 ? kb : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const currentSnap = nearestSnap(sortedSnaps, height);

  return (
    <div
      ref={sheetRef}
      className="absolute inset-x-0 z-30 flex min-w-0 flex-col rounded-t-[26px] bg-card text-foreground will-change-[height] animate-sheet-in motion-reduce:animate-none"
      style={{
        height: `${height}dvh`,
        maxHeight: `calc(100dvh - env(safe-area-inset-top) - 12px - ${keyboardOffset}px)`,
        bottom: keyboardOffset > 0 ? `${keyboardOffset}px` : 0,
        boxShadow: "0 -32px 72px -36px rgba(0,0,0,0.6), 0 -1px 0 0 rgba(255,255,255,0.04) inset",
        borderTop: "1px solid color-mix(in oklab, var(--color-border) 45%, transparent)",
      }}
      aria-label="Painel de informações da corrida"
    >
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            moveByKeyboard(1);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            moveByKeyboard(-1);
          } else if (event.key === "Home") {
            event.preventDefault();
            velocityRef.current = 0;
            animateTo(minSnap);
            onSnapChange?.(minSnap);
          } else if (event.key === "End") {
            event.preventDefault();
            velocityRef.current = 0;
            animateTo(maxSnap);
            onSnapChange?.(maxSnap);
          }
        }}
        className="flex min-h-11 shrink-0 touch-none select-none items-center justify-center pb-1 pt-2 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        style={{ touchAction: "none" }}
        aria-label={`Ajustar painel. Altura atual ${Math.round(currentSnap)}%`}
        aria-valuemin={Math.round(minSnap)}
        aria-valuemax={Math.round(maxSnap)}
        aria-valuenow={Math.round(currentSnap)}
        role="slider"
      >
        <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
      </button>
      <div
        ref={scrollRef}
        data-scroll
        className="movvi-scroll min-w-0 flex-1 px-4"
        style={{
          paddingBottom: footer ? "24px" : `calc(env(safe-area-inset-bottom) + 24px)`,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>

      {footer && (
        <div
          className="shrink-0"
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 60,
            padding: "12px max(16px, env(safe-area-inset-right)) calc(env(safe-area-inset-bottom) + 16px) max(16px, env(safe-area-inset-left))",
            background: "linear-gradient(to top, var(--color-card) 82%, transparent)",
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
});
