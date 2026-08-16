import { useCallback, useEffect, useRef, useState } from "react";
import { getPushPermission, isPushSupported, requestPushPermission } from "@/lib/pushNotifications";
import { registerDeviceToken } from "@/lib/notifications/deviceTokenService";

const DISMISS_KEY = "movvi.push_prompt_dismissed_at";
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// Politeness: only surface the prompt after the user has been in the app for a bit.
const GRACE_MS = 45_000;

type State = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  shouldPrompt: boolean;
};

function readDismissedAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > Date.now() + 60_000) {
      window.localStorage.removeItem(DISMISS_KEY);
      return 0;
    }
    return parsed;
  } catch {
    return 0;
  }
}

function clearDismissedAt() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DISMISS_KEY);
  } catch {
    // armazenamento pode estar indisponível em alguns WebViews
  }
}

export function useNotificationPermission(): State & {
  request: () => Promise<void>;
  dismiss: () => void;
} {
  const [state, setState] = useState<State>(() => ({
    supported: isPushSupported(),
    permission: getPushPermission(),
    shouldPrompt: false,
  }));
  const requestingRef = useRef(false);

  useEffect(() => {
    if (!state.supported || state.permission !== "default") return;
    const dismissedAt = readDismissedAt();
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_WINDOW_MS) return;
    const t = window.setTimeout(() => {
      setState((s) => s.supported && s.permission === "default" ? { ...s, shouldPrompt: true } : s);
    }, GRACE_MS);
    return () => window.clearTimeout(t);
  }, [state.supported, state.permission]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const supported = isPushSupported();
      const permission = getPushPermission();
      setState((current) => ({
        supported,
        permission,
        shouldPrompt: supported && permission === "default" ? current.shouldPrompt : false,
      }));
      if (permission === "granted") clearDismissedAt();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const request = useCallback(async () => {
    if (requestingRef.current) return;
    const supported = isPushSupported();
    if (!supported) {
      setState({ supported: false, permission: "unsupported", shouldPrompt: false });
      return;
    }

    requestingRef.current = true;
    try {
      const perm = await requestPushPermission();
      setState({ supported: true, permission: perm, shouldPrompt: false });
      if (perm === "granted") {
        clearDismissedAt();
        try {
          await registerDeviceToken();
        } catch (error) {
          if (import.meta.env.DEV) console.warn("[APOIS] token de push não foi sincronizado", error);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[APOIS] solicitação de notificações falhou", error);
      setState((current) => ({
        ...current,
        supported: isPushSupported(),
        permission: getPushPermission(),
        shouldPrompt: false,
      }));
    } finally {
      requestingRef.current = false;
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // armazenamento indisponível não deve impedir o fechamento do aviso
    }
    setState((s) => ({ ...s, shouldPrompt: false }));
  }, []);

  return { ...state, request, dismiss };
}
