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
const PERMISSION_STORAGE_KEY = "apois.notification.permission_status";
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

function validRememberedPermissionStatus(value: unknown): Exclude<DevicePermissionStatus, "denied"> {
  return validPermissionStatus(value) === "provisional" ? "provisional" : "granted";
}

function validToken(value: unknown): string {
  const token = clean(value, MAX_TOKEN_LENGTH);
  if (!token || token.length < 20 || /[\u0000-\u001f\u007f]/.test(token)) return "";
  return token;
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
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

function rememberDeviceToken(
  token: string,
  platform: DevicePlatform,
  permissionStatus: Exclude<DevicePermissionStatus, "denied">,
): void {
  const safeToken = validToken(token);
  if (!safeToken) return;
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, safeToken);
    localStorage.setItem(PLATFORM_STORAGE_KEY, validPlatform(platform));
    localStorage.setItem(PERMISSION_STORAGE_KEY, validRememberedPermissionStatus(permissionStatus));
  } catch {
    // Persistência local é apenas auxiliar para logout/touch.
  }
}

function readRememberedToken(): {
  token: string;
  platform: DevicePlatform;
  permissionStatus: Exclude<DevicePermissionStatus, "denied">;
} | null {
  try {
    const token = validToken(localStorage.getItem(TOKEN_STORAGE_KEY));
    if (!token) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(PLATFORM_STORAGE_KEY);
      localStorage.removeItem(PERMISSION_STORAGE_KEY);
      return null;
    }
    return {
      token,
      platform: validPlatform(localStorage.getItem(PLATFORM_STORAGE_KEY)),
      // Tokens gravados por versões antigas não tinham esta chave; nesse caso
      // mantemos o comportamento anterior (granted) sem transformar um valor
      // explicitamente provisional em granted em touches futuros.
      permissionStatus: validRememberedPermissionStatus(localStorage.getItem(PERMISSION_STORAGE_KEY)),
    };
  } catch {
    return null;
  }
}

function forgetRememberedToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(PLATFORM_STORAGE_KEY);
    localStorage.removeItem(PERMISSION_STORAGE_KEY);
  } catch {
    // no-op
  }
}

async function hasSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("notification_session_unavailable");
  return Boolean(data.session);
}

async function deactivateToken(token: string): Promise<void> {
  const safeToken = validToken(token);
  if (!safeToken) return;
  const { error } = await rpcClient.rpc("deactivate_notification_token", { _token: safeToken });
  if (error) throw new Error("notification_token_deactivation_failed");
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
  if (permissionStatus === "denied") {
    // O RPC canônico aceita somente granted/provisional. Permissão negada não é
    // um token registrável: desativa um token já conhecido e remove o cache local.
    await deactivateToken(token);
    const remembered = readRememberedToken();
    if (remembered?.token === token) forgetRememberedToken();
    return;
  }

  const deviceId = clean(input?.device_id, MAX_DEVICE_ID_LENGTH) || getDeviceId();
  if (!deviceId) return;

  const { error } = await rpcClient.rpc("register_notification_token", {
    _token: token,
    _platform: platform,
    _device_id: deviceId,
    _permission_status: permissionStatus,
  });

  if (error) throw new Error("notification_token_registration_failed");
  rememberDeviceToken(token, platform, permissionStatus);
}

/**
 * Desativa o token deste aparelho antes de encerrar a sessão. A RPC precisa do
 * JWT ainda válido, por isso esta função deve ser chamada ANTES de signOut().
 */
export async function unregisterCurrentDevice(): Promise<void> {
  const remembered = readRememberedToken();
  if (!remembered) return;
  if (!(await hasSession())) {
    // Sem sessão já não é possível autorizar a RPC; ao menos não carregamos o
    // token de uma conta anterior para um login futuro neste WebView.
    forgetRememberedToken();
    return;
  }

  await deactivateToken(remembered.token);
  forgetRememberedToken();
}

/**
 * Usado pelo "sair de todos os dispositivos". A própria RLS da tabela permite
 * ler somente tokens do usuário autenticado; cada token é então desativado pela
 * RPC canônica antes que o logout global invalide as sessões.
 */
export async function unregisterAllDevices(): Promise<void> {
  if (!(await hasSession())) {
    forgetRememberedToken();
    return;
  }

  const { data, error } = await supabase
    .from("user_notification_tokens")
    .select("token")
    .eq("is_active", true)
    .limit(100);
  if (error) throw new Error("notification_tokens_lookup_failed");

  const tokens = Array.from(
    new Set(
      (data ?? [])
        .map((row) => validToken(row.token))
        .filter((token): token is string => Boolean(token)),
    ),
  );

  for (const token of tokens) {
    await deactivateToken(token);
  }
  forgetRememberedToken();
}

export async function touchCurrentDevice(): Promise<void> {
  const remembered = readRememberedToken();
  if (!remembered || !(await hasSession())) return;

  const deviceId = getDeviceId();
  if (!deviceId) return;

  // A RPC é idempotente e atualiza last_used_at/updated_at do token existente
  // sem elevar silenciosamente uma autorização provisional para granted.
  const { error } = await rpcClient.rpc("register_notification_token", {
    _token: remembered.token,
    _platform: remembered.platform,
    _device_id: deviceId,
    _permission_status: remembered.permissionStatus,
  });
  if (error) throw new Error("notification_token_touch_failed");
}
