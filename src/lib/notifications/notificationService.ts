import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  getPushPermission,
  isPushSupported,
  requestPushPermission,
  showPush,
} from "@/lib/pushNotifications";
import { fetchPreferences, type NotificationPreferences } from "./notificationPreferences";
import { categoryForEvent, type NotificationEvent } from "./events";

export type NotifyPayload = {
  event: NotificationEvent;
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
  force?: boolean;
};

type NotificationLogData = Database["public"]["Tables"]["notification_logs"]["Insert"]["data"];

let cachedPrefs: NotificationPreferences | null = null;
let cachedAt = 0;
let prefsInFlight: Promise<NotificationPreferences> | null = null;

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

async function getPrefs(): Promise<NotificationPreferences> {
  const now = Date.now();
  const fresh = cachedPrefs && cachedAt > 0 && now >= cachedAt && now - cachedAt < 60_000;
  if (fresh && cachedPrefs) return cachedPrefs;
  if (prefsInFlight) return prefsInFlight;

  prefsInFlight = fetchPreferences()
    .then((preferences) => {
      cachedPrefs = preferences;
      cachedAt = Date.now();
      return preferences;
    })
    .finally(() => {
      prefsInFlight = null;
    });
  return prefsInFlight;
}

export function invalidatePreferencesCache() {
  cachedPrefs = null;
  cachedAt = 0;
  prefsInFlight = null;
}

function vibrate(prefs: NotificationPreferences) {
  if (!prefs.vibration || typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[APOIS Notifications] vibração indisponível", error);
  }
}

function beep(prefs: NotificationPreferences) {
  if (!prefs.sound || typeof window === "undefined") return;
  try {
    const source = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx = source.AudioContext ?? source.webkitAudioContext;
    if (!Ctx) return;
    const context = new Ctx();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.05;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    window.setTimeout(() => {
      try {
        oscillator.stop();
      } catch {
        // Oscilador pode já ter sido encerrado pelo navegador.
      }
      void context.close().catch(() => undefined);
    }, 160);
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[APOIS Notifications] áudio indisponível", error);
  }
}

function logMetadata(payload: NotifyPayload, errorMessage?: string): NotificationLogData {
  const source = payload.data && typeof payload.data === "object" ? payload.data : {};
  const metadata: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(source)) {
    if (count >= 30) break;
    const safeKey = cleanText(key, 80);
    if (!safeKey || safeKey === "delivery_error") continue;
    if (
      value == null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      metadata[safeKey] = typeof value === "string" ? cleanText(value, 500) : value;
      count += 1;
    }
  }
  if (errorMessage) metadata.delivery_error = cleanText(errorMessage, 120);
  return metadata as NotificationLogData;
}

async function log(
  payload: NotifyPayload,
  status: "sent" | "suppressed" | "error",
  errorMessage?: string,
) {
  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) return;
    const userId = cleanText(auth?.user?.id, 128);
    if (!userId) return;

    const title = cleanText(payload.title, 120);
    const body = cleanText(payload.body, 500);
    if (!title) return;

    const { error } = await supabase.from("notification_logs").insert({
      user_id: userId,
      event: payload.event,
      channel: "web",
      title,
      body: body || null,
      data: logMetadata(payload, errorMessage),
      status,
    });
    if (error && import.meta.env.DEV) {
      console.warn("[APOIS Notifications] falha ao registrar entrega", error);
    }
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[APOIS Notifications] logging indisponível", error);
  }
}

export async function notify(payload: NotifyPayload): Promise<void> {
  const title = cleanText(payload.title, 120);
  if (!title) return;

  let prefs: NotificationPreferences;
  try {
    prefs = await getPrefs();
  } catch (error) {
    void log({ ...payload, title }, "suppressed", "preferences_unavailable");
    if (import.meta.env.DEV) console.warn("[APOIS Notifications] preferências indisponíveis", error);
    return;
  }

  const category = categoryForEvent(payload.event);
  if (!prefs[category]) {
    void log({ ...payload, title }, "suppressed", "category_disabled");
    return;
  }

  if (!isPushSupported()) {
    void log({ ...payload, title }, "suppressed", "push_unsupported");
    return;
  }
  if (getPushPermission() !== "granted") {
    void log({ ...payload, title }, "suppressed", "permission_not_granted");
    return;
  }
  if (
    !payload.force &&
    typeof document !== "undefined" &&
    document.visibilityState === "visible"
  ) {
    void log({ ...payload, title }, "suppressed", "foreground")
    return;
  }

  try {
    showPush({
      title,
      body: cleanText(payload.body, 500) || undefined,
      tag: cleanText(payload.tag ?? payload.event, 120),
      url: payload.url,
      force: payload.force === true,
    });
    vibrate(prefs);
    beep(prefs);
    void log({ ...payload, title }, "sent");
  } catch (error) {
    void log({ ...payload, title }, "error", "delivery_failed");
    if (import.meta.env.DEV) console.warn("[APOIS Notifications] entrega falhou", error);
  }
}

export const notificationService = {
  notify,
  isSupported: isPushSupported,
  getPermission: getPushPermission,
  requestPermission: requestPushPermission,
  invalidatePreferencesCache,
};
