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
  /** URL to open/focus when the notification is clicked. */
  url?: string;
  /** Force showing even when the document is visible (default: false). */
  force?: boolean;
};

/**
 * Show a system notification. By default, only fires when the document is
 * hidden — in-foreground updates rely on toasts. Clicking the notification
 * focuses an existing tab on `url` (or navigates to it) and opens a new tab
 * otherwise.
 */
export function showPush({ title, body, tag, url, force = false }: PushOptions): void {
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
      data: { url },
    } as NotificationOptions);
    n.onclick = (event) => {
      event.preventDefault();
      try {
        const target = url ?? "/";
        const absolute = new URL(target, window.location.origin).href;
        // If we're already on the target path, just focus the tab.
        if (window.location.href === absolute) {
          window.focus();
        } else if (window.location.origin === new URL(absolute).origin) {
          // Same-origin: focus + client-side navigate via history to avoid full reload.
          window.focus();
          window.location.assign(absolute);
        } else {
          window.open(absolute, "_blank");
        }
      } finally {
        n.close();
      }
    };
  } catch {
    /* ignore notification errors */
  }
}
