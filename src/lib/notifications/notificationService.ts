import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  getPushPermission,
  isPushSupported,
  requestPushPermission,
  showPush,
} from "@/lib/pushNotifications";
import {
  DEFAULT_PREFERENCES,
  fetchPreferences,
  type NotificationPreferences,
} from "./notificationPreferences";
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

async function getPrefs(): Promise<NotificationPreferences> {
  const fresh = Date.now() - cachedAt < 60_000;
  if (cachedPrefs && fresh) return cachedPrefs;
  cachedPrefs = await fetchPreferences().catch(() => DEFAULT_PREFERENCES);
  cachedAt = Date.now();
  return cachedPrefs;
}

export function invalidatePreferencesCache() {
  cachedPrefs = null;
  cachedAt = 0;
}

function vibrate(prefs: NotificationPreferences) {
  if (!prefs.vibration) return;
  try { navigator.vibrate?.([120, 60, 120]); } catch { /* ignore */ }
}

function beep(prefs: NotificationPreferences) {
  if (!prefs.sound) return;
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.05;
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      ctx.close().catch(() => {});
    }, 160);
  } catch { /* ignore */ }
}

async function log(payload: NotifyPayload, status: "sent" | "suppressed" | "error", errorMessage?: string) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return;

    const metadata = {
      ...(payload.data ?? {}),
      ...(errorMessage ? { delivery_error: errorMessage } : {}),
    } as NotificationLogData;

    await supabase.from("notification_logs").insert({
      user_id: userId,
      event: payload.event,
      channel: "web",
      title: payload.title,
      body: payload.body ?? null,
      data: metadata,
      status,
    });
  } catch {
    // Logging must never break the user flow.
  }
}

export async function notify(payload: NotifyPayload): Promise<void> {
  const prefs = await getPrefs();
  const category = categoryForEvent(payload.event);
  if (!prefs[category]) {
    void log(payload, "suppressed", "category_disabled");
    return;
  }

  showPush({
    title: payload.title,
    body: payload.body,
    tag: payload.tag ?? payload.event,
    url: payload.url,
    force: payload.force,
  });
  vibrate(prefs);
  beep(prefs);
  void log(payload, "sent");
}

export const notificationService = {
  notify,
  isSupported: isPushSupported,
  getPermission: getPushPermission,
  requestPermission: requestPushPermission,
  invalidatePreferencesCache,
};
