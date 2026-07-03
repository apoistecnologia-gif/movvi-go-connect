// Device token registry. Abstracts web-push subscriptions and future
// Capacitor (iOS/Android) native tokens behind a single register/unregister API.

import { supabase } from "@/integrations/supabase/client";

export type DevicePlatform = "web" | "ios" | "android";

export type DeviceToken = {
  platform: DevicePlatform;
  token: string;
  endpoint?: string | null;
  p256dh?: string | null;
  auth_key?: string | null;
  user_agent?: string | null;
};

function detectPlatform(): DevicePlatform {
  if (typeof window === "undefined") return "web";
  // Future: detect Capacitor via (window as any).Capacitor?.getPlatform()
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const p = cap?.getPlatform?.();
  if (p === "ios") return "ios";
  if (p === "android") return "android";
  return "web";
}

/**
 * Register the current device with the backend. For web, we store a stable
 * pseudo-token derived from the browser's Push subscription endpoint when
 * available, otherwise a random per-device UUID persisted in localStorage.
 * On native (future) this will store the FCM/APNs token.
 */
export async function registerDeviceToken(input?: Partial<DeviceToken>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return;

  const platform = input?.platform ?? detectPlatform();
  let token = input?.token;

  if (!token && platform === "web") {
    const KEY = "movvi.device_token";
    token = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) ?? "" : "";
    if (!token) {
      token = crypto.randomUUID();
      try {
        localStorage.setItem(KEY, token);
      } catch {
        /* ignore */
      }
    }
  }
  if (!token) return;

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
  await supabase.from("user_notification_tokens").upsert(
    {
      user_id: uid,
      platform,
      token,
      endpoint: input?.endpoint ?? null,
      p256dh: input?.p256dh ?? null,
      auth_key: input?.auth_key ?? null,
      user_agent: input?.user_agent ?? ua,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,token" },
  );
}

export async function unregisterCurrentDevice(): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return;
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("movvi.device_token") : null;
  if (!token) return;
  await supabase
    .from("user_notification_tokens")
    .delete()
    .eq("user_id", uid)
    .eq("token", token);
}

export async function touchCurrentDevice(): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return;
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("movvi.device_token") : null;
  if (!token) return;
  await supabase
    .from("user_notification_tokens")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("user_id", uid)
    .eq("token", token);
}
