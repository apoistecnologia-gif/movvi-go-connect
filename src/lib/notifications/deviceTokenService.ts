// APOIS — registro canônico de tokens de notificação.
// user_notification_tokens.user_id referencia public.users.id (não auth.users.id).

import { supabase } from "@/integrations/supabase/client";

export type DevicePlatform = "web" | "ios" | "android";

export type DeviceToken = {
  platform: DevicePlatform;
  token: string;
  device_id?: string | null;
  permission_status?: "granted" | "provisional" | "denied";
};

const TOKEN_STORAGE_KEY = "apois.notification.device_token";
const PLATFORM_STORAGE_KEY = "apois.notification.device_platform";

function detectPlatform(): DevicePlatform {
  if (typeof window === "undefined") return "web";
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const platform = cap?.getPlatform?.();
  if (platform === "ios") return "ios";
  if (platform === "android") return "android";
  return "web";
}

async function resolveOperationalUserId(): Promise<string | null> {
  // A própria função usada pelas policies devolve public.users.id para a
  // sessão atual. Usá-la aqui evita misturar auth.users.id com o ID operacional.
  const { data, error } = await (supabase as any).rpc("mobility_user_id");
  if (!error && typeof data === "string" && data.length > 0) return data;

  // Fallback compatível com bases antigas durante homologação.
  const { data: auth } = await supabase.auth.getUser();
  const authUserId = auth?.user?.id;
  if (!authUserId) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return profile?.id ?? null;
}

function rememberDeviceToken(token: string, platform: DevicePlatform): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(PLATFORM_STORAGE_KEY, platform);
  } catch {
    // Persistência local é apenas auxiliar para logout/touch.
  }
}

function readRememberedToken(): { token: string; platform: DevicePlatform } | null {
  try {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
    const rawPlatform = localStorage.getItem(PLATFORM_STORAGE_KEY) ?? "";
    const platform: DevicePlatform = rawPlatform === "android" || rawPlatform === "ios" ? rawPlatform : "web";
    return token ? { token, platform } : null;
  } catch {
    return null;
  }
}

function forgetRememberedToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(PLATFORM_STORAGE_KEY);
  } catch {
    // no-op
  }
}

export async function registerDeviceToken(input?: Partial<DeviceToken>): Promise<void> {
  const userId = await resolveOperationalUserId();
  if (!userId) return;

  const platform = input?.platform ?? detectPlatform();
  let token = input?.token?.trim() ?? "";

  // Web não usa FCM neste fluxo; o pseudo-token existe somente para manter a
  // API compatível e nunca deve ser confundido com um token nativo FCM.
  if (!token && platform === "web") {
    try {
      token = localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
      if (!token) token = crypto.randomUUID();
    } catch {
      token = crypto.randomUUID();
    }
  }
  if (!token) return;

  const now = new Date().toISOString();
  const { error } = await supabase.from("user_notification_tokens").upsert(
    {
      user_id: userId,
      token,
      platform,
      device_id: input?.device_id ?? null,
      permission_status: input?.permission_status ?? "granted",
      is_active: true,
      last_used_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,token" },
  );

  if (error) throw error;
  rememberDeviceToken(token, platform);
}

export async function unregisterCurrentDevice(): Promise<void> {
  const remembered = readRememberedToken();
  if (!remembered) return;
  const userId = await resolveOperationalUserId();
  if (!userId) return;

  const { error } = await supabase
    .from("user_notification_tokens")
    .update({ is_active: false, permission_status: "denied", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("token", remembered.token);

  if (error) throw error;
  forgetRememberedToken();
}

export async function touchCurrentDevice(): Promise<void> {
  const remembered = readRememberedToken();
  if (!remembered) return;
  const userId = await resolveOperationalUserId();
  if (!userId) return;

  const { error } = await supabase
    .from("user_notification_tokens")
    .update({
      is_active: true,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("token", remembered.token);

  if (error) throw error;
}
