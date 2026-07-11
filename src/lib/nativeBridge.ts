// MOVVI — inicialização de recursos nativos (Capacitor).
// Só faz algo quando o app roda dentro do APK (Android/iOS). No web é no-op.
//
// Responsabilidades:
//  1. Solicitar permissão de push (FCM no Android, APNs no iOS).
//  2. Registrar o token FCM/APNs no backend via registerDeviceToken.
//  3. Pré-solicitar permissão de geolocalização (o mapa depende dela).
//  4. Encaminhar cliques em notificação (data.url) para a navegação do router.

import { registerDeviceToken } from "@/lib/notifications/deviceTokenService";

type CapacitorGlobal = {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
};

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

let initStarted = false;

export function initNativeBridge(): void {
  if (initStarted) return;
  initStarted = true;
  if (!isNative()) return;
  // Fire-and-forget: falhas aqui NUNCA devem quebrar o app.
  void setupPush().catch((err) => console.warn("[native] push setup falhou", err));
  void setupGeolocation().catch((err) =>
    console.warn("[native] geolocation warmup falhou", err),
  );
}

async function setupPush(): Promise<void> {
  const { PushNotifications } = await import("@capacitor/push-notifications");

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return;

  PushNotifications.addListener("registration", (token) => {
    void registerDeviceToken({ token: token.value }).catch((err) =>
      console.warn("[native] registerDeviceToken falhou", err),
    );
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.warn("[native] registrationError", err);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const url = (action.notification?.data as { url?: string } | undefined)?.url;
    if (typeof url === "string" && url.startsWith("/")) {
      // Deep-link via router; import dinâmico evita ciclo.
      window.location.assign(url);
    }
  });

  // PushNotifications.register() lança se o Firebase Android não estiver
  // configurado (sem google-services.json). Nesse caso apenas desativa push,
  // sem derrubar o app.
  try {
    await PushNotifications.register();
  } catch (err) {
    console.warn(
      "[native] PushNotifications.register falhou (Firebase ausente? app continua sem push)",
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
