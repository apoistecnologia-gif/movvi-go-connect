// Lightweight push notifications using the Web Notifications API.
// Triggered only when the document is hidden (app in background / minimized / other tab).

const ICON = "/favicon.ico";

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Request notification permission. Safe to call multiple times — browsers
 * only show the prompt once. Returns the resolved permission state.
 */
export async function requestPushPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export type PushOptions = {
  title: string;
  body?: string;
  tag?: string;
  /** Force showing even when the document is visible (default: false). */
  force?: boolean;
};

/**
 * Show a system notification. By default, only fires when the document is
 * hidden — in-foreground updates rely on toasts.
 */
export function showPush({ title, body, tag, force = false }: PushOptions): void {
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;
  if (!force && typeof document !== "undefined" && document.visibilityState === "visible") return;

  try {
    const n = new Notification(title, {
      body,
      tag: tag ?? "movvi-ride",
      icon: ICON,
      badge: ICON,
      renotify: true,
    } as NotificationOptions);
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* ignore notification errors */
  }
}
