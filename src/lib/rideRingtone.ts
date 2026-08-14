/**
 * APOIS — Toque de chamada para novas ofertas de corrida.
 *
 * A voz "Nova corrida" é disparada pelo componente da oferta imediatamente.
 * Este módulo inicia o toque 900 ms depois, exatamente na ordem operacional
 * definida para o Motorista, e repete enquanto a oferta permanecer visível.
 */

let ctx: AudioContext | null = null;
let startTimer: number | null = null;
let loopTimer: number | null = null;
let active = false;

const RINGTONE_DELAY_MS = 900;
const RINGTONE_REPEAT_MS = 1600;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = (window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

function beep(freq: number, at: number, duration: number, gainPeak = 0.28) {
  const c = ctx;
  if (!c) return;
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
  beep(880, t, 0.18);
  beep(1180, t + 0.22, 0.22);
  try {
    (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.([180, 90, 180]);
  } catch {
    // Vibração é auxiliar; não pode interromper a oferta.
  }
}

function clearTimers() {
  if (startTimer != null) {
    window.clearTimeout(startTimer);
    startTimer = null;
  }
  if (loopTimer != null) {
    window.clearInterval(loopTimer);
    loopTimer = null;
  }
}

export function startRideRingtone() {
  if (active || typeof window === "undefined") return;
  active = true;
  clearTimers();

  startTimer = window.setTimeout(() => {
    startTimer = null;
    if (!active) return;
    playPattern();
    loopTimer = window.setInterval(() => {
      if (active) playPattern();
    }, RINGTONE_REPEAT_MS);
  }, RINGTONE_DELAY_MS);
}

export function stopRideRingtone() {
  active = false;
  clearTimers();
}
