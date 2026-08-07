import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isVoiceEnabled, setVoiceEnabled, speak } from "@/lib/voiceNav";

export function DriverVoiceToggle({ visible = true }: { visible?: boolean }) {
  const [enabled, setEnabled] = useState(() => isVoiceEnabled());
  if (!visible) return null;

  const toggle = () => {
    const next = !enabled;
    setVoiceEnabled(next);
    setEnabled(next);
    if (next) void speak("Voz de navegação ativada.", { interrupt: true });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={enabled ? "Desativar voz da navegação" : "Ativar voz da navegação"}
      title={enabled ? "Desativar voz" : "Ativar voz"}
      className="fixed right-4 z-[46] flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#0D0F11]/92 text-[#F6BE1C] shadow-[0_14px_32px_-18px_rgba(0,0,0,0.9)] backdrop-blur-md active:scale-95"
      style={{ top: "calc(env(safe-area-inset-top) + 78px)" }}
    >
      {enabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-zinc-400" />}
    </button>
  );
}
