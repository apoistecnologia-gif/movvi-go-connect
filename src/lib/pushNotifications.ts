// Lightweight push notifications using the Web Notifications API.
// Triggered only when the document is hidden (app in background / minimized / other tab).

const ICON = "/favicon.ico";
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 500;
const MAX_TAG_LENGTH = 120;

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  try {
    return Notification.permission;
  } catch {
    return "unsupported";
  }
}

/**
 * Request notification permission. Safe to call multiple times — browsers
 * only show the prompt once. Returns the resolved permission state.
 */
export async function requestPushPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  try {
    if (Notification.permission === "granted" || Notification.permission === "denied") {
      return Notification.permission;
    }
    return await Notification.requestPermission();
  } catch {
    return getPushPermission();
  }
}

export type PushOptions = {
  title: string;
  body?: string;
  tag?: string;
  /** Internal URL to open/focus when the notification is clicked. */
  url?: string;
  /** Force showing even when the document is visible (default: false). */
  force?: boolean;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function safeInternalUrl(value: unknown): string {
  if (typeof window === "undefined") return "/";
  const raw = String(value ?? "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin !== window.location.origin) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

/**
 * Show a system notification. By default, only fires when the document is
 * hidden — in-foreground updates rely on toasts. Notification clicks are
 * restricted to same-origin internal routes.
 */
export function showPush({ title, body, tag, url, force = false }: PushOptions): void {
  if (!isPushSupported()) return;
  if (getPushPermission() !== "granted") return;
  if (!force && typeof document !== "undefined" && document.visibilityState === "visible") return;

  const safeTitle = cleanText(title, MAX_TITLE_LENGTH);
  if (!safeTitle) return;
  const safeBody = cleanText(body, MAX_BODY_LENGTH) || undefined;
  const safeTag = cleanText(tag, MAX_TAG_LENGTH) || "apois-notification";
  const target = safeInternalUrl(url);

  try {
    const notification = new Notification(safeTitle, {
      body: safeBody,
      tag: safeTag,
      icon: ICON,
      badge: ICON,
      renotify: true,
      data: { url: target },
    } as NotificationOptions);
    notification.onclick = (event) => {
      event.preventDefault();
      try {
        const absolute = new URL(target, window.location.origin);
        if (absolute.origin !== window.location.origin) return;
        window.focus();
        if (window.location.href !== absolute.href) window.location.assign(absolute.href);
      } catch (error) {
        if (import.meta.env.DEV) console.warn("[APOIS Push] destino inválido", error);
      } finally {
        notification.close();
      }
    };
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[APOIS Push] falha ao exibir notificação", error);
  }
}
