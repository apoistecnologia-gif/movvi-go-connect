// APOIS — registro canônico de tokens de notificação do Motorista.
// O backend resolve a sessão para public.users.id dentro das RPCs oficiais,
// evitando misturar auth.users.id com o ID operacional usado pelo dispatch.

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
const DEVICE_ID_KEY = "apois.notification.device_id";

function detectPlatform(): DevicePlatform {
  if (typeof window === "undefined") return "web";
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const platform = cap?.getPlatform?.();
  if (platform === "ios") return "ios";
  if (platform === "android") return "android";
  return "web";
}

function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    return `driver-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
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
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;

  const platform = input?.platform ?? detectPlatform();
  let token = input?.token?.trim() ?? "";

  // O fluxo real de FCM só usa Android/iOS. Mantemos web como fallback
  // compatível sem tratar esse identificador como token FCM no APK.
  if (!token && platform === "web") {
    try {
      token = localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
      if (!token) token = crypto.randomUUID();
    } catch {
      token = crypto.randomUUID();
    }
  }
  if (!token) return;

  const permissionStatus = input?.permission_status ?? "granted";
  const { error } = await (supabase as any).rpc("register_notification_token", {
    _token: token,
    _platform: platform,
    _device_id: input?.device_id ?? getDeviceId(),
    _permission_status: permissionStatus,
  });

  if (error) throw error;
  rememberDeviceToken(token, platform);
}

export async function unregisterCurrentDevice(): Promise<void> {
  const remembered = readRememberedToken();
  if (!remembered) return;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;

  const { error } = await (supabase as any).rpc("deactivate_notification_token", {
    _token: remembered.token,
  });
  if (error) throw error;
  forgetRememberedToken();
}

export async function touchCurrentDevice(): Promise<void> {
  const remembered = readRememberedToken();
  if (!remembered) return;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;

  // A RPC é idempotente e atualiza last_used_at/updated_at do token existente.
  const { error } = await (supabase as any).rpc("register_notification_token", {
    _token: remembered.token,
    _platform: remembered.platform,
    _device_id: getDeviceId(),
    _permission_status: "granted",
  });
  if (error) throw error;
}
