/**
 * Nexus AI v15 — NOTIFICATIONS THAT ACTUALLY ARRIVE
 * =============================================================================
 * "وخلي اشعارات تشتغل باي طريقة"
 *
 * The old path was Web Push only, which silently did nothing because the
 * deployment has no VAPID keys. This replaces it with a delivery ladder that
 * degrades instead of disappearing:
 *
 *   TIER 1  Web Push      — real push, arrives with the tab closed.
 *                           Needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
 *   TIER 2  SW local      — service-worker showNotification(). Works with ZERO
 *                           keys and zero server. Fires while the PWA is
 *                           installed/backgrounded on Android + desktop.
 *   TIER 3  Page Notification — the plain Notification constructor.
 *   TIER 4  In-app toast  — always works, even when permission is denied or the
 *                           browser has no Notification API at all (iOS Safari
 *                           outside a home-screen PWA).
 *
 * Something is always delivered. That is the whole point.
 *
 * Client-side module.
 */

export type NotifyTier = "push" | "sw" | "page" | "toast" | "none";

export interface NotifyPayload {
  title: string;
  body: string;
  /** Deep link opened on click. */
  url?: string;
  tag?: string;
  /** Silent notifications never vibrate or sound. */
  silent?: boolean;
}

export interface NotifyResult {
  ok: boolean;
  tier: NotifyTier;
  detail?: string;
}

const ICON = "/icons/nexus-icon-192.png";
const BADGE = "/icons/nexus-icon-192.png";

/* ------------------------------------------------------------------ toasts */

type ToastListener = (p: NotifyPayload) => void;
const toastListeners = new Set<ToastListener>();

/** The in-app toast host subscribes here; this is tier 4. */
export function onToast(fn: ToastListener): () => void {
  toastListeners.add(fn);
  return () => {
    toastListeners.delete(fn);
  };
}

function fireToast(p: NotifyPayload): boolean {
  if (!toastListeners.size) return false;
  for (const fn of toastListeners) {
    try {
      fn(p);
    } catch {
      /* a broken listener must not break delivery */
    }
  }
  return true;
}

/* ------------------------------------------------------------- permission */

export function notificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function permissionState(): NotificationPermission | "unsupported" {
  if (!notificationSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Asks for permission. Must be called from a user gesture or Safari ignores it.
 * Never throws — a rejected prompt just returns "denied".
 */
export async function requestPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/* ------------------------------------------------------------------ push */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Subscribes to real Web Push. Returns false (quietly) when the server has no
 * VAPID key, which is the normal state for a self-hosted build.
 */
export async function enablePush(
  authFetch: (input: string, init?: RequestInit) => Promise<Response>
): Promise<{ ok: boolean; reason?: string }> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "UNSUPPORTED" };
  }
  const perm = await requestPermission();
  if (perm !== "granted") return { ok: false, reason: "DENIED" };

  try {
    const keyRes = await authFetch("/api/push/subscribe");
    const keyJson = (await keyRes.json().catch(() => ({}))) as { publicKey?: string };
    const publicKey = (keyJson.publicKey ?? "").trim();
    if (!publicKey) return { ok: false, reason: "NO_VAPID" };

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }));

    const r = await authFetch("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(sub.toJSON()),
    });
    return { ok: r.ok, reason: r.ok ? undefined : "SERVER" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ERROR" };
  }
}

/* -------------------------------------------------------------- delivery */

/**
 * Delivers one notification using the best tier available right now.
 * Always resolves; never throws.
 */
export async function notify(p: NotifyPayload): Promise<NotifyResult> {
  const perm = permissionState();

  // TIER 2 — service worker local notification (no keys, survives background)
  if (perm === "granted" && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(p.title, {
        body: p.body,
        icon: ICON,
        badge: BADGE,
        tag: p.tag ?? "nexus",
        silent: p.silent ?? false,
        data: { url: p.url ?? "/app" },
        dir: "rtl",
        lang: "ar",
      } as NotificationOptions);
      return { ok: true, tier: "sw" };
    } catch {
      /* fall through */
    }
  }

  // TIER 3 — plain page notification
  if (perm === "granted") {
    try {
      const n = new Notification(p.title, {
        body: p.body,
        icon: ICON,
        tag: p.tag ?? "nexus",
        silent: p.silent ?? false,
        dir: "rtl",
        lang: "ar",
      });
      n.onclick = () => {
        window.focus();
        if (p.url) window.location.href = p.url;
        n.close();
      };
      return { ok: true, tier: "page" };
    } catch {
      /* fall through */
    }
  }

  // TIER 4 — in-app toast. Works when permission is denied, when the API is
  // missing entirely (iOS Safari in a normal tab), and while the tab is focused
  // (where an OS notification would be suppressed anyway).
  if (fireToast(p)) return { ok: true, tier: "toast" };

  return { ok: false, tier: "none", detail: `permission=${perm}` };
}

/** Convenience wrappers used around the app. */
export const notifyBuildDone = (what: string, url = "/app") =>
  notify({ title: "اكتمل البناء ✅", body: `${what} جاهز. اضغط باش تشوفو.`, url, tag: "build" });

export const notifyBuildProgress = (pct: number, file: string) =>
  notify({ title: `جاري البناء — ${pct}%`, body: `يكتب ${file}`, tag: "build-progress", silent: true });

export const notifyError = (msg: string) =>
  notify({ title: "وقع خطأ", body: msg, tag: "error" });

/** A self test the settings page can run so the user SEES it work. */
export async function testNotification(): Promise<NotifyResult> {
  return notify({
    title: "Nexus AI",
    body: "الإشعارات تخدم مليح ✅ هذي تجربة.",
    tag: "test",
    url: "/app/settings/notifications",
  });
}
