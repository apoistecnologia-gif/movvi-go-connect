import { useEffect, useMemo, useState } from "react";
import { APOIS_LOGO_DATA_URL } from "@/assets/apoisLogoData";

interface BrandSplashProps {
  storageKey: string;
  tagline?: string;
  duration?: number;
}

export function BrandSplash({
  storageKey,
  tagline = "Apois, vamos?",
  duration = 1900,
}: BrandSplashProps) {
  const [phase, setPhase] = useState<"hidden" | "playing" | "leaving">("hidden");
  const safeDuration = Number.isFinite(duration) ? Math.min(5000, Math.max(900, duration)) : 1900;
  const safeStorageKey = storageKey.trim() || "apois:splash";
  const productLabel = useMemo(() => {
    const key = safeStorageKey.toLowerCase();
    if (key.includes("motorista") || key.includes("driver")) return "APOIS Motorista";
    if (key.includes("passageiro") || key.includes("passenger")) return "APOIS Passageiro";
    return "APOIS";
  }, [safeStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(safeStorageKey) === "1") return;
      sessionStorage.setItem(safeStorageKey, "1");
    } catch {
      // Storage indisponível não impede a abertura.
    }

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    setPhase("playing");
    if (reducedMotion) {
      const doneAt = window.setTimeout(() => setPhase("hidden"), Math.min(1000, safeDuration));
      return () => window.clearTimeout(doneAt);
    }

    const leaveAt = window.setTimeout(() => setPhase("leaving"), Math.max(520, safeDuration - 380));
    const doneAt = window.setTimeout(() => setPhase("hidden"), safeDuration);
    return () => {
      window.clearTimeout(leaveAt);
      window.clearTimeout(doneAt);
    };
  }, [safeStorageKey, safeDuration]);

  if (phase === "hidden") return null;

  return (
    <div
      className="apois-brand-splash pointer-events-none fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#050607] px-4"
      style={{
        opacity: phase === "leaving" ? 0 : 1,
        transition: "opacity 360ms cubic-bezier(0.22, 1, 0.36, 1)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-hidden="true"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(246,190,28,0.15) 0%, rgba(246,190,28,0.04) 28%, transparent 60%)",
        }}
      />

      <div className="relative flex min-w-0 max-w-full flex-col items-center px-4 text-center sm:px-8">
        <div
          className="relative flex h-[clamp(132px,42vw,172px)] w-[clamp(132px,42vw,172px)] items-center justify-center overflow-hidden rounded-full border border-[#F6BE1C]/20 bg-[#08090A] shadow-[0_26px_80px_-28px_rgba(246,190,28,0.55)]"
          style={{ animation: "apois-splash-logo 620ms cubic-bezier(0.22,1,0.36,1) both" }}
        >
          <img
            src={APOIS_LOGO_DATA_URL}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
            loading="eager"
            decoding="async"
          />
        </div>

        <div
          className="mt-6 min-w-0 max-w-full"
          style={{ animation: "apois-splash-copy 520ms cubic-bezier(0.22,1,0.36,1) 180ms both" }}
        >
          <p className="break-words text-xs font-black uppercase tracking-[0.22em] text-[#F6BE1C]">
            {productLabel}
          </p>
          {tagline.trim() ? (
            <p className="mt-2 break-words text-sm font-semibold tracking-wide text-white/75">{tagline.trim()}</p>
          ) : null}
        </div>

        <div className="mt-8 h-[3px] w-36 max-w-[55vw] overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 rounded-full bg-[#F6BE1C] shadow-[0_0_18px_rgba(246,190,28,0.55)] [animation:apois-splash-bar_1.15s_ease-in-out_infinite]" />
        </div>
      </div>

      <style>{`
        @keyframes apois-splash-logo {
          from { opacity: 0; transform: scale(.86) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes apois-splash-copy {
          from { opacity: 0; transform: translateY(9px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes apois-splash-bar {
          0% { transform: translateX(-130%); }
          100% { transform: translateX(430%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .apois-brand-splash, .apois-brand-splash * {
            animation: none !important;
            transition-duration: .001ms !important;
          }
        }
      `}</style>
    </div>
  );
}
