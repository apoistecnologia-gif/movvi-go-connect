// APOIS — inicialização de recursos nativos (Capacitor).
// Só faz algo quando o app roda dentro do APK (Android/iOS). No web é no-op.
//
// FASE ATUAL:
//   - initNativeBridge()          → APENAS registra listeners passivos (deep-link).
//                                   NÃO pede permissões. NÃO chama Firebase.
//                                   NÃO usa Web Notifications no APK.
//   - requestPostAuthPermissions()→ Chamada pelo app DEPOIS da UI montada e
//                                   da sessão válida. Pede geolocalização e,
//                                   se VITE_ENABLE_NATIVE_PUSH=true, push.

import { registerDeviceToken } from "@/lib/notifications/deviceTokenService";

const ENABLE_NATIVE_PUSH = import.meta.env.VITE_ENABLE_NATIVE_PUSH === "true";
const APP_ROLE = String(import.meta.env.VITE_APP_ROLE ?? "").trim().toLowerCase();
const DRIVER_RIDE_CHANNEL_ID = "apois_rides";

type CapacitorGlobal = {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
};

type PushData = {
  url?: string;
  event?: string;
  ride_id?: string;
};

export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function nativePlatform(): string {
  if (typeof window === "undefined") return "web";
  try {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    const platform = String(cap?.getPlatform?.() ?? "web").trim().toLowerCase();
    return platform || "web";
  } catch {
    return "web";
  }
}

let initStarted = false;
let postAuthInFlight: Promise<void> | null = null;

function safeInternalPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  if (/^[\u0000-\u001f\u007f]/.test(path) || /[\u0000-\u001f\u007f]/.test(path)) return null;
  try {
    const parsed = new URL(path, "https://apois.invalid");
    if (parsed.origin !== "https://apois.invalid") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function resolvePushTarget(data: PushData | undefined): string | null {
  const rawUrl = safeInternalPath(data?.url);
  const event = typeof data?.event === "string" ? data.event.trim().toLowerCase().slice(0, 100) : "";

  // A mesma Edge Function atende Passageiro e Motorista. Eventos de corrida
  // destinados ao APK do Motorista nunca podem abrir uma rota do Passageiro.
  if (APP_ROLE === "motorista" || APP_ROLE === "driver") {
    if (rawUrl === "/motorista" || rawUrl?.startsWith("/motorista/")) return rawUrl;
    if (event.startsWith("driver.") || event.startsWith("ride.")) return "/motorista/app";
    if (rawUrl === "/corridas" || rawUrl?.startsWith("/corrida/")) return "/motorista/app";
    return "/motorista/app";
  }

  if (APP_ROLE === "passageiro" || APP_ROLE === "passenger") {
    if (rawUrl === "/passageiro" || rawUrl?.startsWith("/passageiro/")) return rawUrl;
    if (rawUrl === "/corridas" || rawUrl?.startsWith("/corrida/")) return rawUrl;
    return rawUrl ? "/passageiro/app" : null;
  }

  // O bundle web não deve transformar payload push em redirecionamento para
  // áreas administrativas. Apenas rotas não administrativas são aceitas.
  if (rawUrl?.startsWith("/admin")) return null;
  return rawUrl;
}

/**
 * Inicialização passiva — não pede nada ao usuário, não depende de sessão.
 * Segura para rodar antes do primeiro render.
 */
export function initNativeBridge(): void {
  if (initStarted || !isNative()) return;
  initStarted = true;

  if (ENABLE_NATIVE_PUSH) {
    void attachPushListenersOnly().catch((error) => {
      initStarted = false;
      if (import.meta.env.DEV) console.warn("[native] falha ao anexar listeners de push", error);
    });
  } else if (import.meta.env.DEV) {
    console.info("[native] push nativo desativado neste build.");
  }
}

/**
 * Pede/sincroniza permissões nativas somente depois da autenticação e com a UI
 * já visível. Chamadas concorrentes são colapsadas.
 */
export function requestPostAuthPermissions(): Promise<void> {
  if (!isNative()) return Promise.resolve();
  if (postAuthInFlight) return postAuthInFlight;

  postAuthInFlight = (async () => {
    try {
      await setupGeolocation();
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[native] geolocation warmup falhou", error);
    }

    if (ENABLE_NATIVE_PUSH) {
      try {
        await setupPush();
      } catch (error) {
        if (import.meta.env.DEV) console.warn("[native] push setup falhou", error);
      }
    }
  })().finally(() => {
    postAuthInFlight = null;
  });
  return postAuthInFlight;
}

async function attachPushListenersOnly(): Promise<void> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.addListener("registration", (token) => {
    const value = String(token?.value ?? "").trim();
    if (!value) return;
    void registerDeviceToken({ token: value }).catch((error) => {
      if (import.meta.env.DEV) console.warn("[native] registerDeviceToken falhou", error);
    });
  });
  await PushNotifications.addListener("registrationError", (error) => {
    if (import.meta.env.DEV) console.warn("[native] registrationError", error);
  });
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const target = resolvePushTarget(action.notification?.data as PushData | undefined);
    if (!target) return;
    try {
      window.location.assign(target);
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[native] falha ao abrir destino do push", error);
    }
  });
}

async function ensureDriverRideChannel(): Promise<void> {
  if (nativePlatform() !== "android") return;
  if (APP_ROLE !== "motorista" && APP_ROLE !== "driver") return;

  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.createChannel({
    id: DRIVER_RIDE_CHANNEL_ID,
    name: "Novas corridas",
    description: "Ofertas e eventos importantes de corridas APOIS.",
    importance: 5,
    vibration: true,
    visibility: 1,
  });
}

async function setupPush(): Promise<void> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return;

  await ensureDriverRideChannel();

  try {
    await PushNotifications.register();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[native] PushNotifications.register falhou; app segue sem push", error);
    }
  }
}

async function setupGeolocation(): Promise<void> {
  const { Geolocation } = await import("@capacitor/geolocation");
  let perm = await Geolocation.checkPermissions();
  if (perm.location === "prompt" || perm.location === "prompt-with-rationale") {
    perm = await Geolocation.requestPermissions({ permissions: ["location"] });
  }
  if (perm.location !== "granted" && import.meta.env.DEV) {
    console.info("[native] localização não autorizada pelo usuário.");
  }
}
