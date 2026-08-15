import { useEffect, useState } from "react";
import { APOIS_LOGO_DATA_URL } from "@/assets/apoisLogoData";

interface BrandSplashProps {
  storageKey: string;
  tagline?: string;
  duration?: number;
}

/**
 * Abertura oficial APOIS.
 * Mantém o comportamento leve do splash anterior, mas usa a identidade visual
 * real do projeto: preto profundo, dourado/amarelo e a marca oficial.
 */
export function BrandSplash({
  storageKey,
  tagline = "Apois, vamos?",
  duration = 1900,
}: BrandSplashProps) {
  const [phase, setPhase] = useState<"hidden" | "playing" | "leaving">("hidden");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(storageKey) === "1") return;
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // Se o storage estiver indisponível, o splash continua funcionando.
    }

    setPhase("playing");
    const leaveAt = window.setTimeout(() => setPhase("leaving"), Math.max(900, duration - 380));
    const doneAt = window.setTimeout(() => setPhase("hidden"), duration);
    return () => {
      window.clearTimeout(leaveAt);
      window.clearTimeout(doneAt);
    };
  }, [storageKey, duration]);

  if (phase === "hidden") return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#050607]"
      style={{
        opacity: phase === "leaving" ? 0 : 1,
        transition: "opacity 360ms cubic-bezier(0.22, 1, 0.36, 1)",
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

      <div className="relative flex flex-col items-center px-8 text-center">
        <div
          className="relative flex h-[172px] w-[172px] items-center justify-center overflow-hidden rounded-full border border-[#F6BE1C]/20 bg-[#08090A] shadow-[0_26px_80px_-28px_rgba(246,190,28,0.55)]"
          style={{ animation: "apois-splash-logo 620ms cubic-bezier(0.22,1,0.36,1) both" }}
        >
          <img
            src={APOIS_LOGO_DATA_URL}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        </div>

        <div
          className="mt-6"
          style={{ animation: "apois-splash-copy 520ms cubic-bezier(0.22,1,0.36,1) 180ms both" }}
        >
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#F6BE1C]">
            APOIS Motorista
          </p>
          {tagline ? (
            <p className="mt-2 text-sm font-semibold tracking-wide text-white/75">{tagline}</p>
          ) : null}
        </div>

        <div className="mt-8 h-[3px] w-36 overflow-hidden rounded-full bg-white/10">
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
          [aria-hidden="true"] * { animation-duration: .001ms !important; }
        }
      `}</style>
    </div>
  );
}
