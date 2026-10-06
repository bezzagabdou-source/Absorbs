"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bell, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __barqPwaPrompt?: BeforeInstallPromptEvent | null;
  }
}

/** Registers the service worker and captures the install prompt. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      window.__barqPwaPrompt = e as BeforeInstallPromptEvent;
      window.dispatchEvent(new CustomEvent("barq:pwa-ready"));
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  return null;
}

/** A button that triggers the PWA install prompt (hides itself if unsupported). */
export function InstallButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (window.__barqPwaPrompt) setAvailable(true);
    const ready = () => setAvailable(true);
    const installed = () => setAvailable(false);
    window.addEventListener("barq:pwa-ready", ready);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("barq:pwa-ready", ready);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!available) return null;

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const prompt = window.__barqPwaPrompt;
        if (!prompt) return;
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === "accepted") {
          window.__barqPwaPrompt = null;
          setAvailable(false);
        }
      }}
    >
      {children}
    </button>
  );
}

/* ---------- hourly notifications (Web Push) ---------- */

function urlB64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Asks permission, subscribes this device and registers it for the hourly notification. Returns true on success. */
export async function enableHourlyNotifications(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return false;
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    let sub = existing;
    if (!sub) {
      const k = await fetch("/api/push/subscribe", { cache: "no-store" });
      if (!k.ok) return false;
      const { key } = (await k.json()) as { key: string };
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });
    }
    const r = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    // Chrome installed apps can also wake up on their own (no server needed)
    try {
      const anyReg = reg as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, o: { minInterval: number }) => Promise<void> } };
      await anyReg.periodicSync?.register("nexus-hourly", { minInterval: 60 * 60 * 1000 });
    } catch {
      /* not supported: server push is enough */
    }
    try { localStorage.setItem("nexus_push", "1"); } catch {}
    return r.ok;
  } catch {
    return false;
  }
}

export async function disableHourlyNotifications(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => undefined);
      await sub.unsubscribe();
    }
    localStorage.setItem("nexus_push", "0");
  } catch {}
}

/** Small dismissible banner (shown once, after a short delay) that invites the user to turn the notifications on. */
export function PushPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!pushSupported() || process.env.NODE_ENV !== "production") return;
    if (Notification.permission !== "default") return;
    try {
      if (localStorage.getItem("nexus_push_dismissed")) return;
    } catch {}
    const t = setTimeout(() => setShow(true), 25_000);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;
  const close = () => {
    setShow(false);
    try { localStorage.setItem("nexus_push_dismissed", String(Date.now())); } catch {}
  };
  return (
    <div dir="rtl" className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-[#140c33]/95 p-3 text-sm text-white shadow-2xl backdrop-blur">
      <Bell className="h-5 w-5 shrink-0 text-amber-300" />
      <p className="flex-1 leading-6">فعّل الإشعارات ليذكّرك Nexus كل ساعة بأسرع طريقة لاستخدامه.</p>
      <button
        type="button"
        className="rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-bold text-black"
        onClick={async () => {
          await enableHourlyNotifications();
          close();
        }}
      >
        تفعيل
      </button>
      <button type="button" aria-label="إغلاق" onClick={close} className="p-1 text-white/60">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
