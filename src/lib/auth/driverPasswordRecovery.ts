import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const DRIVER_PASSWORD_RECOVERY_REDIRECT = "apoismotorista://auth/redefinir-senha";

const MAX_RECOVERY_URL_LENGTH = 16_384;
const MAX_AUTH_VALUE_LENGTH = 8_192;

type RecoveryResult =
  | { handled: false }
  | { handled: true; success: true }
  | { handled: true; success: false; reason: string };

type RecoveryCallbacks = {
  onReady: () => void | Promise<void>;
  onError: (reason: string) => void | Promise<void>;
};

function cleanAuthValue(value: unknown, maxLength = MAX_AUTH_VALUE_LENGTH): string {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) return "";
  return text;
}

function readAuthParameters(url: URL): URLSearchParams {
  const parameters = new URLSearchParams();
  const appendSafe = (source: URLSearchParams) => {
    source.forEach((value, key) => {
      const safeKey = cleanAuthValue(key, 80).toLowerCase();
      const safeValue = cleanAuthValue(value);
      if (!safeKey || !safeValue || parameters.has(safeKey)) return;
      parameters.set(safeKey, safeValue);
    });
  };
  appendSafe(url.searchParams);
  const hash = url.hash.replace(/^#/, "");
  if (hash && hash.length <= MAX_RECOVERY_URL_LENGTH) appendSafe(new URLSearchParams(hash));
  return parameters;
}

function isDriverPasswordRecoveryUrl(url: URL): boolean {
  const protocol = url.protocol.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  return protocol === "apoismotorista:" && hostname === "auth" && pathname === "/redefinir-senha";
}

export function getDriverPasswordRecoveryRedirectTo(): string | undefined {
  if (Capacitor.isNativePlatform()) return DRIVER_PASSWORD_RECOVERY_REDIRECT;
  if (typeof window === "undefined") return undefined;
  try {
    const protocol = String(window.location.protocol ?? "").toLowerCase();
    const hostname = String(window.location.hostname ?? "").trim().toLowerCase();
    if (!["http:", "https:"].includes(protocol)) return undefined;
    if (!hostname || ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname)) return undefined;
    const origin = new URL(window.location.origin);
    if (!["http:", "https:"].includes(origin.protocol)) return undefined;
    return new URL("/motorista/redefinir-senha", origin).toString();
  } catch {
    return undefined;
  }
}

/** Consome somente links de recuperação pertencentes ao APOIS Motorista. */
export async function consumeDriverPasswordRecoveryUrl(rawUrl: string): Promise<RecoveryResult> {
  const candidate = String(rawUrl ?? "").trim();
  if (!candidate || candidate.length > MAX_RECOVERY_URL_LENGTH || /[\u0000-\u001f\u007f]/.test(candidate)) {
    return { handled: false };
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { handled: false };
  }

  if (!isDriverPasswordRecoveryUrl(url)) return { handled: false };

  const parameters = readAuthParameters(url);
  if (parameters.has("error_description") || parameters.has("error")) {
    return { handled: true, success: false, reason: "recovery_link_rejected" };
  }

  const type = cleanAuthValue(parameters.get("type"), 40).toLowerCase();
  if (type && type !== "recovery") {
    return { handled: true, success: false, reason: "recovery_type_invalid" };
  }

  const code = cleanAuthValue(parameters.get("code"));
  if (code) {
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.session) {
        return { handled: true, success: false, reason: "recovery_code_invalid" };
      }
      return { handled: true, success: true };
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[APOIS Auth] falha ao trocar código de recuperação", error);
      return { handled: true, success: false, reason: "recovery_code_exchange_failed" };
    }
  }

  const accessToken = cleanAuthValue(parameters.get("access_token"));
  const refreshToken = cleanAuthValue(parameters.get("refresh_token"));
  if (accessToken || refreshToken) {
    if (!accessToken || !refreshToken) {
      return { handled: true, success: false, reason: "recovery_credentials_incomplete" };
    }
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error || !data.session) {
        return { handled: true, success: false, reason: "recovery_session_invalid" };
      }
      return { handled: true, success: true };
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[APOIS Auth] falha ao restaurar sessão de recuperação", error);
      return { handled: true, success: false, reason: "recovery_session_failed" };
    }
  }

  return { handled: true, success: false, reason: "recovery_credentials_missing" };
}

export async function registerDriverPasswordRecoveryHandler({
  onReady,
  onError,
}: RecoveryCallbacks): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) return async () => undefined;

  let disposed = false;
  let lastHandledUrl: string | null = null;
  let inFlightUrl: string | null = null;

  const callError = async (reason: string) => {
    if (disposed) return;
    try {
      await onError(reason);
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[APOIS Auth] callback de erro falhou", error);
    }
  };

  const handle = async ({ url }: URLOpenListenerEvent) => {
    const candidate = String(url ?? "").trim();
    if (disposed || !candidate || candidate === lastHandledUrl || candidate === inFlightUrl) return;
    inFlightUrl = candidate;
    try {
      const result = await consumeDriverPasswordRecoveryUrl(candidate);
      if (disposed || !result.handled) return;
      lastHandledUrl = candidate;
      if (result.success) {
        try {
          await onReady();
        } catch (error) {
          if (import.meta.env.DEV) console.warn("[APOIS Auth] callback de recuperação falhou", error);
          await callError("recovery_ready_callback_failed");
        }
      } else {
        await callError(result.reason);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[APOIS Auth] falha inesperada no deep link", error);
      await callError("recovery_handler_failed");
    } finally {
      if (inFlightUrl === candidate) inFlightUrl = null;
    }
  };

  let listener: Awaited<ReturnType<typeof App.addListener>> | null = null;
  try {
    listener = await App.addListener("appUrlOpen", (event) => {
      void handle(event).catch((error) => {
        if (import.meta.env.DEV) console.warn("[APOIS Auth] listener de deep link falhou", error);
      });
    });

    try {
      const launchUrl = await App.getLaunchUrl();
      if (launchUrl?.url) await handle({ url: launchUrl.url });
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[APOIS Auth] não foi possível ler launch URL", error);
    }
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[APOIS Auth] não foi possível registrar listener", error);
    await callError("recovery_listener_failed");
  }

  return async () => {
    if (disposed) return;
    disposed = true;
    inFlightUrl = null;
    try {
      await listener?.remove();
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[APOIS Auth] falha ao remover listener", error);
    } finally {
      listener = null;
    }
  };
}
