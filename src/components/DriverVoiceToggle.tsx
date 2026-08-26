import { useCallback, useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isVoiceEnabled, setVoiceEnabled, speak } from "@/lib/voiceNav";

export function DriverVoiceToggle({ visible = true }: { visible?: boolean }) {
  const [enabled, setEnabled] = useState(() => isVoiceEnabled());
  const [announcing, setAnnouncing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const sync = () => setEnabled(isVoiceEnabled());
    sync();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [visible]);

  const toggle = useCallback(async () => {
    if (announcing) return;
    const next = !enabled;
    setVoiceEnabled(next);
    setEnabled(next);
    if (!next) return;

    setAnnouncing(true);
    try {
      await speak("Voz de navegação ativada.", { interrupt: true });
    } catch (error) {
      console.warn("[APOIS DRIVER] voice confirmation failed", error);
    } finally {
      setAnnouncing(false);
    }
  }, [announcing, enabled]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={announcing}
      aria-pressed={enabled}
      aria-busy={announcing}
      aria-label={enabled ? "Desativar voz da navegação" : "Ativar voz da navegação"}
      title={enabled ? "Desativar voz" : "Ativar voz"}
      className="fixed z-[46] flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#0D0F11]/92 text-[#F6BE1C] shadow-[0_14px_32px_-18px_rgba(0,0,0,0.9)] backdrop-blur-md disabled:cursor-not-allowed disabled:opacity-60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      style={{
        top: "calc(env(safe-area-inset-top) + 78px)",
        right: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      {enabled ? <Volume2 className="h-5 w-5" aria-hidden="true" /> : <VolumeX className="h-5 w-5 text-zinc-400" aria-hidden="true" />}
    </button>
  );
}