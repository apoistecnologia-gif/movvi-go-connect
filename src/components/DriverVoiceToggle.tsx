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
      aria-pressed={enabled}
      aria-label={enabled ? "Desativar voz da navegação" : "Ativar voz da navegação"}
      title={enabled ? "Desativar voz" : "Ativar voz"}
      className={`press-scale fixed right-4 z-[46] flex h-[50px] items-center gap-2 rounded-full border px-3 shadow-[0_16px_38px_-20px_rgba(0,0,0,0.95)] backdrop-blur-xl transition ${
        enabled
          ? "border-[#F6BE1C]/35 bg-[#0B0D0F]/94 text-[#F6BE1C]"
          : "border-white/10 bg-[#0B0D0F]/90 text-zinc-400"
      }`}
      style={{ top: "calc(env(safe-area-inset-top) + 76px)" }}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          enabled ? "bg-[#F6BE1C]/12" : "bg-white/5"
        }`}
      >
        {enabled ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
      </span>
      <span className="pr-1 text-[10px] font-black uppercase tracking-[0.13em]">
        {enabled ? "Voz ativa" : "Voz off"}
      </span>
    </button>
  );
}
