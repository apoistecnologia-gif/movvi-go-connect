import {
  useCallback,
  useEffect,
  useImperativeHandle,
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
  snaps: SheetSnap[];               // ex: [30, 60, 88]
  initial?: SheetSnap;              // default = snaps[0]
  onSnapChange?: (s: SheetSnap) => void;
  children: ReactNode;
  /**
   * Optional pinned footer — stays visible at the bottom of the sheet regardless
   * of internal scroll, so primary CTAs (Confirm, Accept, Continue, Finish) are
   * never hidden behind the fold on small viewports.
   */
  footer?: ReactNode;
}

const SPRING_STIFFNESS = 0.18;
const SPRING_DAMPING = 0.78;
const VELOCITY_THRESHOLD = 0.32; // vh/ms

export const MovviSheet = forwardRef<MovviSheetHandle, Props>(function MovviSheet(
  { snaps, initial, onSnapChange, children, footer },
  ref,
) {
  const sortedSnaps = [...snaps].sort((a, b) => a - b);
  const minSnap = sortedSnaps[0];
  const maxSnap = sortedSnaps[sortedSnaps.length - 1];
  const initialSnap = initial ?? sortedSnaps[0];

  const [height, setHeight] = useState<number>(initialSnap);
  const heightRef = useRef<number>(initialSnap);
  const targetRef = useRef<number>(initialSnap);
  const velocityRef = useRef<number>(0); // vh/ms
  const draggingRef = useRef<boolean>(false);
  const rafRef = useRef<number | null>(null);
  const lastMoveRef = useRef<{ y: number; t: number } | null>(null);
  const startRef = useRef<{ y: number; h: number; t: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const setHeightBoth = useCallback((h: number) => {
    heightRef.current = h;
    setHeight(h);
  }, []);

  const animateTo = useCallback(
    (target: number) => {
      targetRef.current = target;
      if (rafRef.current != null) return;
      const step = () => {
        const cur = heightRef.current;
        const tgt = targetRef.current;
        const diff = tgt - cur;
        // spring physics
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
    [setHeightBoth],
  );

  const settle = useCallback(
    (releaseVelocity: number) => {
      const cur = heightRef.current;
      // velocity em vh/ms: positivo = subindo (aumenta height)
      let target = sortedSnaps[0];
      let bestDist = Infinity;
      for (const s of sortedSnaps) {
        const d = Math.abs(s - cur);
        if (d < bestDist) {
          bestDist = d;
          target = s;
        }
      }
      // flick override
      if (Math.abs(releaseVelocity) > VELOCITY_THRESHOLD) {
        if (releaseVelocity > 0) {
          // subindo: snap acima do atual
          target = sortedSnaps.find((s) => s > cur + 1) ?? maxSnap;
        } else {
          // descendo: snap abaixo do atual
          const below = [...sortedSnaps].reverse().find((s) => s < cur - 1);
          target = below ?? minSnap;
        }
      }
      velocityRef.current = releaseVelocity * 4; // converter para impulso do spring
      animateTo(target);
      onSnapChange?.(target);
    },
    [animateTo, maxSnap, minSnap, onSnapChange, sortedSnaps],
  );

  useImperativeHandle(
    ref,
    () => ({
      snapTo: (snap: SheetSnap) => {
        velocityRef.current = 0;
        animateTo(snap);
        onSnapChange?.(snap);
      },
      current: () => heightRef.current,
    }),
    [animateTo, onSnapChange],
  );

  function onPointerDown(e: React.PointerEvent) {
    // Não inicia drag se o usuário está rolando o conteúdo interno
    // (apenas o handle e cabeçalho disparam o drag — controlado pelo elemento).
    draggingRef.current = true;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    velocityRef.current = 0;
    startRef.current = { y: e.clientY, h: heightRef.current, t: performance.now() };
    lastMoveRef.current = { y: e.clientY, t: performance.now() };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current || !startRef.current) return;
    const vh = window.innerHeight;
    const dy = startRef.current.y - e.clientY; // positivo = subir
    let nextH = startRef.current.h + (dy / vh) * 100;

    // elástico nas bordas
    if (nextH > maxSnap) {
      const over = nextH - maxSnap;
      nextH = maxSnap + over * 0.35;
    } else if (nextH < minSnap) {
      const under = minSnap - nextH;
      nextH = minSnap - under * 0.35;
    }

    // calcular velocidade instantânea
    const now = performance.now();
    if (lastMoveRef.current) {
      const dt = Math.max(1, now - lastMoveRef.current.t);
      const dvh = ((lastMoveRef.current.y - e.clientY) / vh) * 100;
      velocityRef.current = dvh / dt; // vh/ms
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

  // Reset scroll do conteúdo quando colapsa
  useEffect(() => {
    if (heightRef.current <= minSnap + 2 && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [height, minSnap]);

  // ─── Keyboard-aware behavior (Android/iOS) ───────────────────────────────
  // When any input/textarea inside the sheet gains focus, expand to the
  // largest snap so the field is visible above the on-screen keyboard, and
  // apply a bottom offset equal to the keyboard height (via visualViewport).
  // Restore the previous snap after blur.
  const preFocusSnapRef = useRef<number | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);

  useEffect(() => {
    const root = sheetRef.current;
    if (!root) return;

    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        el.isContentEditable
      );
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isEditable(e.target)) return;
      if (preFocusSnapRef.current == null) {
        preFocusSnapRef.current = heightRef.current;
      }
      // Expand to max snap so field + suggestions are visible.
      if (heightRef.current < maxSnap - 1) {
        velocityRef.current = 0;
        animateTo(maxSnap);
        onSnapChange?.(maxSnap);
      }
      // Ensure the focused input is scrolled into view within the sheet,
      // but softly — avoid a jarring jump.
      requestAnimationFrame(() => {
        try {
          (e.target as HTMLElement).scrollIntoView({
            block: "nearest",
            behavior: "smooth",
          });
        } catch { /* noop */ }
      });
    };

    const onFocusOut = (e: FocusEvent) => {
      if (!isEditable(e.target)) return;
      // Restore previous snap only if focus leaves the sheet entirely.
      setTimeout(() => {
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
    };
  }, [animateTo, maxSnap, onSnapChange]);

  // Track keyboard height via visualViewport so the sticky footer / content
  // never sits behind the on-screen keyboard on Android.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(kb > 40 ? kb : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <div
      ref={sheetRef}
      className="absolute inset-x-0 z-30 flex flex-col rounded-t-[26px] bg-card text-foreground will-change-[height] animate-sheet-in"
      style={{
        // Use `dvh` (dynamic viewport height) so the sheet adapts to Android
        // URL-bar changes and safe-area insets — never a fixed pixel height.
        height: `${height}dvh`,
        // Cap the height so the sheet never covers the top status/safe area
        // AND never sits behind the on-screen keyboard.
        maxHeight: `calc(100dvh - env(safe-area-inset-top) - 12px - ${keyboardOffset}px)`,
        // When keyboard is open, lift the whole sheet above it so the sticky
        // footer / suggestions area stay visible.
        bottom: keyboardOffset > 0 ? `${keyboardOffset}px` : 0,
        boxShadow:
          "0 -32px 72px -36px rgba(0,0,0,0.6), 0 -1px 0 0 rgba(255,255,255,0.04) inset",
        borderTop: "1px solid color-mix(in oklab, var(--color-border) 45%, transparent)",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="shrink-0 flex items-center justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
        style={{ touchAction: "none" }}
      >
        <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
      </div>
      <div
        ref={scrollRef}
        data-scroll
        className="movvi-scroll flex-1 px-4"
        style={{
          paddingBottom: footer
            ? "160px"
            : `calc(env(safe-area-inset-bottom) + 24px)`,
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
            padding: "12px 24px calc(env(safe-area-inset-bottom) + 24px)",
            background:
              "linear-gradient(to top, var(--color-card) 82%, transparent)",
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
});

