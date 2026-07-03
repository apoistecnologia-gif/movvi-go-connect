import { useCallback, useEffect, useState } from "react";
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

export function useNotificationPermission(): State & {
  request: () => Promise<void>;
  dismiss: () => void;
} {
  const [state, setState] = useState<State>(() => ({
    supported: isPushSupported(),
    permission: getPushPermission(),
    shouldPrompt: false,
  }));

  useEffect(() => {
    if (!state.supported || state.permission !== "default") return;
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DISMISS_KEY) : null;
    const dismissedAt = raw ? Number(raw) : 0;
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_WINDOW_MS) return;
    const t = setTimeout(() => setState((s) => ({ ...s, shouldPrompt: true })), GRACE_MS);
    return () => clearTimeout(t);
  }, [state.supported, state.permission]);

  const request = useCallback(async () => {
    const perm = await requestPushPermission();
    setState((s) => ({ ...s, permission: perm, shouldPrompt: false }));
    if (perm === "granted") {
      try {
        await registerDeviceToken();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setState((s) => ({ ...s, shouldPrompt: false }));
  }, []);

  return { ...state, request, dismiss };
}
