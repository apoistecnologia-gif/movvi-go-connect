// APOIS — registro canônico de tokens de notificação do Motorista.
// O backend resolve a sessão para public.users.id dentro das RPCs oficiais,
// evitando misturar auth.users.id com o ID operacional usado pelo dispatch.

import { supabase } from "@/integrations/supabase/client";

export type DevicePlatform = "web" | "ios" | "android";
export type DevicePermissionStatus = "granted" | "provisional" | "denied";

export type DeviceToken = {
  platform: DevicePlatform;
  token: string;
  device_id?: string | null;
  permission_status?: DevicePermissionStatus;
};

type RpcError = { message: string };
type RpcResult = { data: unknown; error: RpcError | null };
type DynamicRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};

const rpcClient = supabase as unknown as DynamicRpcClient;

const TOKEN_STORAGE_KEY = "apois.notification.device_token";
const PLATFORM_STORAGE_KEY = "apois.notification.device_platform";
const DEVICE_ID_KEY = "apois.notification.device_id";
const MAX_TOKEN_LENGTH = 4096;
const MAX_DEVICE_ID_LENGTH = 160;

function clean(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function validPlatform(value: unknown): DevicePlatform {
  const normalized = clean(value, 20).toLowerCase();
  if (normalized === "ios" || normalized === "android" || normalized === "web") return normalized;
  return "web";
}

function validPermissionStatus(value: unknown): DevicePermissionStatus {
  const normalized = clean(value, 30).toLowerCase();
  if (normalized === "provisional" || normalized === "denied") return normalized;
  return "granted";
}

function validToken(value: unknown): string {
  const token = clean(value, MAX_TOKEN_LENGTH);
  if (!token || /[\u0000-\u001f\u007f]/.test(token)) return "";
  return token;
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // cai para fallback abaixo
  }
  const random = Math.random().toString(36).slice(2);
  return `device-${Date.now().toString(36)}-${random}`;
}

function detectPlatform(): DevicePlatform {
  if (typeof window === "undefined") return "web";
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    return validPlatform(cap?.getPlatform?.());
  } catch {
    return "web";
  }
}

function getDeviceId(): string {
  try {
    const existing = clean(localStorage.getItem(DEVICE_ID_KEY), MAX_DEVICE_ID_LENGTH);
    if (existing) return existing;
    const generated = randomId();
    localStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    return randomId();
  }
}

function rememberDeviceToken(token: string, platform: DevicePlatform): void {
  const safeToken = validToken(token);
  if (!safeToken) return;
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, safeToken);
    localStorage.setItem(PLATFORM_STORAGE_KEY, validPlatform(platform));
  } catch {
    // Persistência local é apenas auxiliar para logout/touch.
  }
}

function readRememberedToken(): { token: string; platform: DevicePlatform } | null {
  try {
    const token = validToken(localStorage.getItem(TOKEN_STORAGE_KEY));
    if (!token) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(PLATFORM_STORAGE_KEY);
      return null;
    }
    const platform = validPlatform(localStorage.getItem(PLATFORM_STORAGE_KEY));
    return { token, platform };
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

async function hasSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return Boolean(data.session);
}

export async function registerDeviceToken(input?: Partial<DeviceToken>): Promise<void> {
  if (!(await hasSession())) return;

  const platform = validPlatform(input?.platform ?? detectPlatform());
  let token = validToken(input?.token);

  // O fluxo real de FCM só usa Android/iOS. Mantemos web como fallback
  // compatível sem tratar esse identificador como token FCM no APK.
  if (!token && platform === "web") {
    try {
      token = validToken(localStorage.getItem(TOKEN_STORAGE_KEY));
    } catch {
      token = "";
    }
    if (!token) token = randomId();
  }
  if (!token) return;

  const permissionStatus = validPermissionStatus(input?.permission_status);
  const deviceId = clean(input?.device_id, MAX_DEVICE_ID_LENGTH) || getDeviceId();
  if (!deviceId) return;

  const { error } = await rpcClient.rpc("register_notification_token", {
    _token: token,
    _platform: platform,
    _device_id: deviceId,
    _permission_status: permissionStatus,
  });

  if (error) throw new Error("notification_token_registration_failed");
  rememberDeviceToken(token, platform);
}

export async function unregisterCurrentDevice(): Promise<void> {
  const remembered = readRememberedToken();
  if (!remembered) return;
  if (!(await hasSession())) return;

  const { error } = await rpcClient.rpc("deactivate_notification_token", {
    _token: remembered.token,
  });
  if (error) throw new Error("notification_token_deactivation_failed");
  forgetRememberedToken();
}

export async function touchCurrentDevice(): Promise<void> {
  const remembered = readRememberedToken();
  if (!remembered) return;
  if (!(await hasSession())) return;

  const deviceId = getDeviceId();
  if (!deviceId) return;

  // A RPC é idempotente e atualiza last_used_at/updated_at do token existente.
  const { error } = await rpcClient.rpc("register_notification_token", {
    _token: remembered.token,
    _platform: remembered.platform,
    _device_id: deviceId,
    _permission_status: "granted",
  });
  if (error) throw new Error("notification_token_touch_failed");
}
