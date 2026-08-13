/**
 * APOIS — Toque de chamada para novas ofertas de corrida.
 *
 * Gera um padrão de dois beeps via WebAudio (sem asset externo) e
 * repete em loop enquanto a oferta estiver na tela. Também dispara
 * vibração no celular quando disponível.
 */

let ctx: AudioContext | null = null;
let loopTimer: number | null = null;
let active = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function beep(freq: number, at: number, duration: number, gainPeak = 0.28) {
  const c = ctx!;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(gainPeak, at + 0.02);
  gain.gain.linearRampToValueAtTime(0, at + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

function playPattern() {
  const c = ensureCtx();
  if (!c) return;
  const t = c.currentTime + 0.02;
  // Padrão estilo "ding-dong" curto (~1s)
  beep(880, t, 0.18);
  beep(1180, t + 0.22, 0.22);
  try {
    (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.([180, 90, 180]);
  } catch { /* noop */ }
}

export function startRideRingtone() {
  if (active) return;
  active = true;
  playPattern();
  loopTimer = window.setInterval(() => {
    if (!active) return;
    playPattern();
  }, 1600);
}

export function stopRideRingtone() {
  active = false;
  if (loopTimer != null) {
    window.clearInterval(loopTimer);
    loopTimer = null;
  }
}
