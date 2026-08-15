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
const APP_ROLE = import.meta.env.VITE_APP_ROLE;

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
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

let initStarted = false;
let postAuthInFlight: Promise<void> | null = null;

function resolvePushTarget(data: PushData | undefined): string | null {
  const rawUrl = typeof data?.url === "string" && data.url.startsWith("/") ? data.url : null;

  // A mesma Edge Function atende Passageiro e Motorista. Eventos de corrida
  // destinados ao APK do Motorista nunca podem abrir uma rota do Passageiro
  // como /corrida/:id ou /corridas. O app ressincroniza a oferta/corrida pelo
  // backend ao abrir /motorista/app.
  if (APP_ROLE === "motorista") {
    if (rawUrl?.startsWith("/motorista/")) return rawUrl;
    const event = typeof data?.event === "string" ? data.event : "";
    if (event.startsWith("driver.") || event.startsWith("ride.")) return "/motorista/app";
    if (rawUrl === "/corridas" || rawUrl?.startsWith("/corrida/")) return "/motorista/app";
    return rawUrl ?? "/motorista/app";
  }

  return rawUrl;
}

/**
 * Inicialização passiva — não pede nada ao usuário, não depende de sessão.
 * Segura para rodar antes do primeiro render.
 */
export function initNativeBridge(): void {
  if (initStarted) return;
  initStarted = true;
  if (!isNative()) return;
  // Anexa listener de clique em notificação assim que o plugin permitir,
  // sem forçar registro/permissão agora.
  if (ENABLE_NATIVE_PUSH) {
    void attachPushListenersOnly().catch((err) =>
      console.warn("[native] attachPushListenersOnly falhou (ignorado)", err),
    );
  } else {
    console.info("[native] push nativo desativado neste build.");
  }
}

/**
 * Pede/sincroniza permissões nativas somente depois da autenticação e com a UI
 * já visível. Pode ser chamado novamente depois de troca/restauração de sessão:
 * PushNotifications.register() devolve o token atual e a RPC canônica reassocia
 * esse token ao public.users.id correto. Chamadas concorrentes são colapsadas.
 */
export function requestPostAuthPermissions(): void {
  if (!isNative() || postAuthInFlight) return;

  postAuthInFlight = (async () => {
    try {
      await setupGeolocation();
    } catch (err) {
      console.warn("[native] geolocation warmup falhou", err);
    }

    if (ENABLE_NATIVE_PUSH) {
      try {
        await setupPush();
      } catch (err) {
        console.warn("[native] push setup falhou", err);
      }
    }
  })().finally(() => {
    postAuthInFlight = null;
  });
}

async function attachPushListenersOnly(): Promise<void> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  PushNotifications.addListener("registration", (token) => {
    void registerDeviceToken({ token: token.value }).catch((err) =>
      console.warn("[native] registerDeviceToken falhou", err),
    );
  });
  PushNotifications.addListener("registrationError", (err) => {
    console.warn("[native] registrationError", err);
  });
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const target = resolvePushTarget(action.notification?.data as PushData | undefined);
    if (target) window.location.assign(target);
  });
}

async function setupPush(): Promise<void> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return;
  try {
    await PushNotifications.register();
  } catch (err) {
    console.warn(
      "[native] PushNotifications.register falhou (Firebase ausente? app segue sem push)",
      err,
    );
  }
}

async function setupGeolocation(): Promise<void> {
  const { Geolocation } = await import("@capacitor/geolocation");
  const perm = await Geolocation.checkPermissions();
  if (perm.location === "prompt" || perm.location === "prompt-with-rationale") {
    await Geolocation.requestPermissions({ permissions: ["location"] });
  }
}
