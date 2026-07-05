import { useEffect, useState } from "react";

interface BrandSplashProps {
  /** Unique key used to only show the splash once per session (per app). */
  storageKey: string;
  /** Optional tagline shown under the logo. */
  tagline?: string;
  /** Total duration in ms (default 2200). */
  duration?: number;
}

/**
 * MOVVI DRIVE — Brand opening animation.
 *
 * Full-screen overlay shown on app entry:
 *  - dark brand background
 *  - animated SVG logo (M draws, green D-curve sweeps in, road pulses)
 *  - wordmark fades up
 *  - final fade-out reveals the app
 *
 * Uses sessionStorage[storageKey] so it plays once per browser session.
 */
export function BrandSplash({
  storageKey,
  tagline = "Mobilidade que move você",
  duration = 2200,
}: BrandSplashProps) {
  const [phase, setPhase] = useState<"hidden" | "playing" | "leaving">(
    () => "hidden",
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(storageKey) === "1") return;
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // ignore storage errors — still play once
    }
    setPhase("playing");
    const leaveAt = window.setTimeout(() => setPhase("leaving"), duration - 400);
    const doneAt = window.setTimeout(() => setPhase("hidden"), duration);
    return () => {
      window.clearTimeout(leaveAt);
      window.clearTimeout(doneAt);
    };
  }, [storageKey, duration]);

  if (phase === "hidden") return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 50% 40%, oklch(0.20 0.02 260) 0%, oklch(0.10 0.018 260) 70%)",
        opacity: phase === "leaving" ? 0 : 1,
        transition: "opacity 380ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      aria-hidden="true"
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, color-mix(in oklab, var(--color-primary) 22%, transparent) 0%, transparent 55%)",
          animation: "brand-splash-glow 1600ms cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
      />

      <div className="relative flex flex-col items-center gap-6">
        <svg
          width="140"
          height="140"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            animation:
              "brand-splash-logo-in 700ms cubic-bezier(0.22, 1, 0.36, 1) both",
            filter:
              "drop-shadow(0 12px 30px color-mix(in oklab, var(--color-primary) 45%, transparent))",
          }}
        >
          {/* M — draws in */}
          <path
            d="M18 100 L18 28 L40 28 L60 70 L60 100 Z"
            fill="hsl(0 0% 100%)"
            style={{
              animation:
                "brand-splash-fade-up 620ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both",
            }}
          />
          {/* D — green curve sweep */}
          <path
            d="M60 28 Q100 28 100 64 Q100 100 60 100 L60 78 Q82 78 82 64 Q82 50 60 50 Z"
            fill="hsl(95 75% 51%)"
            style={{
              transformOrigin: "60px 64px",
              animation:
                "brand-splash-sweep 720ms cubic-bezier(0.22, 1, 0.36, 1) 260ms both",
            }}
          />
          {/* Road */}
          <path
            d="M28 82 Q60 60 95 82"
            stroke="hsl(220 30% 8%)"
            strokeWidth="8"
            strokeLinecap="round"
            fill="none"
            style={{
              strokeDasharray: 120,
              strokeDashoffset: 120,
              animation:
                "brand-splash-road 700ms cubic-bezier(0.22, 1, 0.36, 1) 520ms forwards",
            }}
          />
          <path
            d="M28 82 Q60 60 95 82"
            stroke="hsl(0 0% 100%)"
            strokeWidth="1.5"
            strokeDasharray="4 5"
            fill="none"
            style={{
              opacity: 0,
              animation:
                "brand-splash-fade-in 400ms ease-out 980ms forwards",
            }}
          />
        </svg>

        <div
          className="flex flex-col items-center gap-2"
          style={{
            animation:
              "brand-splash-fade-up 620ms cubic-bezier(0.22, 1, 0.36, 1) 700ms both",
          }}
        >
          <div
            className="font-display text-3xl font-bold tracking-wider text-foreground"
            style={{ letterSpacing: "0.08em" }}
          >
            MOVVI <span style={{ color: "hsl(95 75% 51%)" }}>DRIVE</span>
          </div>
          {tagline ? (
            <div
              className="text-[11px] uppercase text-primary"
              style={{ letterSpacing: "0.35em" }}
            >
              {tagline}
            </div>
          ) : null}
        </div>

        {/* Progress accent */}
        <div
          className="relative mt-4 h-[3px] w-40 overflow-hidden rounded-full"
          style={{ background: "color-mix(in oklab, white 8%, transparent)" }}
        >
          <div
            className="absolute inset-y-0 left-0 w-1/3 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-primary) 90%, transparent), transparent)",
              animation: "brand-splash-bar 1400ms cubic-bezier(0.65, 0, 0.35, 1) infinite",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes brand-splash-logo-in {
          from { opacity: 0; transform: scale(0.82) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes brand-splash-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes brand-splash-fade-in {
          to { opacity: 1; }
        }
        @keyframes brand-splash-sweep {
          from { opacity: 0; transform: scaleX(0.2); }
          to   { opacity: 1; transform: scaleX(1); }
        }
        @keyframes brand-splash-road {
          to { stroke-dashoffset: 0; }
        }
        @keyframes brand-splash-glow {
          from { opacity: 0; transform: scale(0.9); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes brand-splash-bar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(320%); }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-hidden="true"] * { animation-duration: 0.001ms !important; }
        }
      `}</style>
    </div>
  );
}
