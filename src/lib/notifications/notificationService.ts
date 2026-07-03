// Provider-agnostic notification facade used across MOVVI.
//
// Front-end responsibility: show local system notifications when the app is
// backgrounded, log every event to `notification_logs`, and respect user
// preferences. Real server-side push delivery (Web Push, FCM, APNs) is
// dispatched by backend workers reading `user_notification_tokens` — this
// module is intentionally decoupled so the provider can change without any
// callsite change.

import { supabase } from "@/integrations/supabase/client";
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
import {
  categoryForEvent,
  type NotificationEvent,
} from "./events";

export type NotifyPayload = {
  event: NotificationEvent;
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
  /** Force system notification even when tab is visible. */
  force?: boolean;
};

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
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    /* ignore */
  }
}

function beep(prefs: NotificationPreferences) {
  if (!prefs.sound) return;
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g).connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close().catch(() => {});
    }, 160);
  } catch {
    /* ignore */
  }
}

async function log(payload: NotifyPayload, status: "sent" | "suppressed" | "error", error?: string) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return;
    await supabase.from("notification_logs").insert({
      user_id: uid,
      event: payload.event,
      channel: "web",
      title: payload.title,
      body: payload.body ?? null,
      data: payload.data ?? null,
      status,
      error: error ?? null,
    });
  } catch {
    /* logging must never break UX */
  }
}

/**
 * Deliver a notification through every enabled channel: system push (when
 * permitted and backgrounded), sound, vibration, and log. Silently no-ops
 * when the user has disabled the matching preference category.
 */
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
