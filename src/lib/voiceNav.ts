import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * APOIS — voz de navegação para o motorista.
 *
 * No APK Android usa o plugin nativo DriverVoice, que prioriza o mecanismo
 * Speech Services by Google (com.google.android.tts) em pt-BR quando instalado.
 * No navegador mantém a Web Speech API como fallback.
 */

export type NavStep = {
  lat: number;
  lng: number;
  distanceMeters: number;
  instruction: string;
  maneuver?: string;
};

type DriverVoicePlugin = {
  prime(): Promise<{ ready?: boolean; engine?: string; language?: string }>;
  speak(options: { text: string; interrupt?: boolean }): Promise<{ spoken?: boolean; engine?: string }>;
  stop(): Promise<void>;
};

const NativeDriverVoice = registerPlugin<DriverVoicePlugin>("DriverVoice");

type SpokenKey = string;
const spoken = new Set<SpokenKey>();
const VOICE_PREF_KEY = "apois:motorista:voice-enabled";
let cachedVoice: SpeechSynthesisVoice | null = null;
let voicesReadyPromise: Promise<void> | null = null;

function readStoredVoicePreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(VOICE_PREF_KEY);
    return stored === null ? true : stored !== "false";
  } catch {
    return true;
  }
}

let enabled = readStoredVoicePreference();

function nativeVoiceAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

function loadVoices(): Promise<void> {
  const s = synth();
  if (!s) return Promise.resolve();
  if (voicesReadyPromise) return voicesReadyPromise;
  voicesReadyPromise = new Promise((resolve) => {
    const pick = () => {
      const list = s.getVoices();
      if (!list.length) return false;
      cachedVoice =
        list.find((v) => /google/i.test(v.name) && /pt-BR/i.test(v.lang)) ??
        list.find((v) => /pt-BR/i.test(v.lang)) ??
        list.find((v) => /^pt/i.test(v.lang)) ??
        null;
      return true;
    };
    if (pick()) return resolve();
    s.onvoiceschanged = () => { pick(); resolve(); };
    setTimeout(() => { pick(); resolve(); }, 1200);
  });
  return voicesReadyPromise;
}

export function setVoiceEnabled(v: boolean) {
  enabled = v;
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(VOICE_PREF_KEY, String(v)); } catch { /* noop */ }
  }
  if (!v) {
    synth()?.cancel();
    if (nativeVoiceAvailable()) void NativeDriverVoice.stop().catch(() => undefined);
  }
}

export function isVoiceEnabled(): boolean {
  return enabled;
}

export async function primeVoice(): Promise<void> {
  enabled = readStoredVoicePreference();
  if (nativeVoiceAvailable()) {
    try {
      await NativeDriverVoice.prime();
      return;
    } catch (error) {
      console.warn("[APOIS VOICE] TTS nativo indisponível; usando fallback web", error);
    }
  }
  await loadVoices();
}

export async function speak(text: string, opts?: { dedupKey?: string; interrupt?: boolean }) {
  if (!enabled || !text) return;

  if (opts?.dedupKey) {
    if (spoken.has(opts.dedupKey)) return;
    spoken.add(opts.dedupKey);
  }

  if (nativeVoiceAvailable()) {
    try {
      await NativeDriverVoice.speak({ text, interrupt: opts?.interrupt ?? false });
      return;
    } catch (error) {
      console.warn("[APOIS VOICE] fala nativa falhou; tentando Web Speech", error);
    }
  }

  const s = synth();
  if (!s) return;
  await loadVoices();
  const u = new SpeechSynthesisUtterance(text);
  if (cachedVoice) u.voice = cachedVoice;
  u.lang = cachedVoice?.lang ?? "pt-BR";
  u.rate = 1.0;
  u.pitch = 1.0;
  u.volume = 1.0;
  if (opts?.interrupt) s.cancel();
  s.speak(u);
}

export function resetSpokenCache() {
  spoken.clear();
  synth()?.cancel();
  if (nativeVoiceAvailable()) void NativeDriverVoice.stop().catch(() => undefined);
}

/** Anuncia manobras conforme o motorista se aproxima. Chamar a cada update de GPS. */
export function tickNavigation(
  driver: { lat: number; lng: number },
  steps: NavStep[],
  rideId: string,
) {
  if (!steps.length) return;
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const distTo = (s: NavStep) => {
    const dφ = toRad(s.lat - driver.lat);
    const dλ = toRad(s.lng - driver.lng);
    const a = Math.sin(dφ / 2) ** 2 +
      Math.cos(toRad(driver.lat)) * Math.cos(toRad(s.lat)) * Math.sin(dλ / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const distance = distTo(step);
    const preKey = `${rideId}:${i}:pre`;
    const nowKey = `${rideId}:${i}:now`;
    if (distance < 40 && !spoken.has(nowKey)) {
      void speak(step.instruction, { dedupKey: nowKey });
      return;
    }
    if (distance < 220 && distance >= 40 && !spoken.has(preKey)) {
      const meters = Math.round(distance / 10) * 10;
      void speak(`Em ${meters} metros, ${step.instruction}`, { dedupKey: preKey });
      return;
    }
  }
}
