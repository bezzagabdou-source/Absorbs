import { apiFetch } from "./api-client";
import type { Locale } from "./i18n/config";
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> { const binary = atob(base64.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
export async function enablePush(locale: Locale): Promise<"pushEnabled" | "pushUnsupported" | "pushDenied" | "pushNotConfigured"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "pushUnsupported";
  const config = await apiFetch<{ configured: boolean; publicKey: string | null }>("/api/push/config"); if (!config.configured || !config.publicKey) return "pushNotConfigured";
  const permission = await Notification.requestPermission(); if (permission !== "granted") return "pushDenied";
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey) });
  const json = subscription.toJSON(); await apiFetch("/api/push/subscriptions", { method: "POST", json: { endpoint: json.endpoint, keys: json.keys, locale } }); return "pushEnabled";
}
export async function disablePush(): Promise<void> { if (!("serviceWorker" in navigator)) return; const registration = await navigator.serviceWorker.getRegistration(); const subscription = await registration?.pushManager.getSubscription(); if (!subscription) return; await apiFetch("/api/push/subscriptions", { method: "DELETE", json: { endpoint: subscription.endpoint } }); await subscription.unsubscribe(); }
