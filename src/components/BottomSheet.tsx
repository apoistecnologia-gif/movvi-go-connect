import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Bottom sheet com 3 alturas (snap points em % da viewport):
 * - peek: pequeno (mostra um cabeçalho)
 * - mid:  meio
 * - full: alto (sem cobrir totalmente o mapa)
 * Suporta arrastar verticalmente para alternar.
 */
type Snap = "peek" | "mid" | "full";
const HEIGHTS: Record<Snap, number> = { peek: 18, mid: 50, full: 82 };

export function BottomSheet({
  children,
  initial = "mid",
  snap,
  onSnapChange,
  handleLabel,
}: {
  children: ReactNode;
  initial?: Snap;
  snap?: Snap;
  onSnapChange?: (s: Snap) => void;
  handleLabel?: string;
}) {
  const [internal, setInternal] = useState<Snap>(initial);
  const current = snap ?? internal;
  const setSnap = (s: Snap) => {
    setInternal(s);
    onSnapChange?.(s);
  };

  const startY = useRef<number | null>(null);
  const startH = useRef<number>(HEIGHTS[current]);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [dragH, setDragH] = useState<number | null>(null);

  useEffect(() => setDragH(null), [current]);

  function onPointerDown(e: React.PointerEvent) {
    startY.current = e.clientY;
    startH.current = HEIGHTS[current];
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (startY.current == null) return;
    const dy = startY.current - e.clientY;
    const vh = window.innerHeight;
    const nextH = Math.min(
      HEIGHTS.full + 5,
      Math.max(HEIGHTS.peek - 5, startH.current + (dy / vh) * 100),
    );
    setDragH(nextH);
  }
  function onPointerUp() {
    if (dragH == null) {
      startY.current = null;
      return;
    }
    const order: Snap[] = ["peek", "mid", "full"];
    let best: Snap = "peek";
    let bestDiff = Infinity;
    for (const s of order) {
      const d = Math.abs(HEIGHTS[s] - dragH);
      if (d < bestDiff) { best = s; bestDiff = d; }
    }
    setSnap(best);
    startY.current = null;
  }

  const height = dragH ?? HEIGHTS[current];

  return (
    <div
      ref={sheetRef}
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-3xl bg-card text-foreground shadow-[0_-24px_60px_-12px_rgba(0,0,0,0.55)] ring-1 ring-border/70 backdrop-blur-xl transition-[height] duration-200 ease-out"
      style={{
        height: `${height}vh`,
        transitionProperty: dragH == null ? "height" : "none",
      }}
    >
      <div
        className="flex cursor-grab flex-col items-center pb-1 pt-3 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        {handleLabel && (
          <span className="mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            {handleLabel}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-2">
        {children}
      </div>
    </div>
  );
}
