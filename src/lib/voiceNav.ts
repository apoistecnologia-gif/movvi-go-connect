/**
 * APOIS — Voz de navegação para o motorista.
 *
 * Usa a Web Speech API nativa (SpeechSynthesis). Preferimos vozes pt-BR
 * da Google (femininas por padrão no Android/Chrome), com fallback para
 * qualquer voz pt-BR disponível. Sem dependência de rede.
 */

export type NavStep = {
  lat: number;
  lng: number;
  distanceMeters: number;
  instruction: string;
  maneuver?: string;
};

type SpokenKey = string;
const spoken = new Set<SpokenKey>();
let cachedVoice: SpeechSynthesisVoice | null = null;
let voicesReadyPromise: Promise<void> | null = null;
let enabled = true;

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
      // Preferência: Google pt-BR (feminina) → qualquer pt-BR → qualquer pt.
      cachedVoice =
        list.find((v) => /google/i.test(v.name) && /pt-BR/i.test(v.lang)) ??
        list.find((v) => /pt-BR/i.test(v.lang)) ??
        list.find((v) => /^pt/i.test(v.lang)) ??
        null;
      return true;
    };
    if (pick()) return resolve();
    s.onvoiceschanged = () => { pick(); resolve(); };
    // Alguns navegadores não disparam onvoiceschanged — força após timeout.
    setTimeout(() => { pick(); resolve(); }, 1200);
  });
  return voicesReadyPromise;
}

export function setVoiceEnabled(v: boolean) {
  enabled = v;
  if (!v) synth()?.cancel();
}

export function isVoiceEnabled(): boolean {
  return enabled;
}

export async function primeVoice(): Promise<void> {
  await loadVoices();
}

export async function speak(text: string, opts?: { dedupKey?: string; interrupt?: boolean }) {
  if (!enabled) return;
  const s = synth();
  if (!s || !text) return;
  await loadVoices();
  if (opts?.dedupKey) {
    if (spoken.has(opts.dedupKey)) return;
    spoken.add(opts.dedupKey);
  }
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

  // Procura o próximo passo dentro de 400m que ainda não foi anunciado.
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const d = distTo(s);
    const preKey = `${rideId}:${i}:pre`;
    const nowKey = `${rideId}:${i}:now`;
    if (d < 40 && !spoken.has(nowKey)) {
      void speak(s.instruction, { dedupKey: nowKey });
      return;
    }
    if (d < 220 && d >= 40 && !spoken.has(preKey)) {
      const meters = Math.round(d / 10) * 10;
      void speak(`Em ${meters} metros, ${s.instruction}`, { dedupKey: preKey });
      return;
    }
  }
}
