/// <reference lib="webworker" />
import { z } from "zod";
const CACHE = "dz-exchange-static-v3";
const OFFLINE = "/offline";
const payloadSchema = z.object({ title: z.string().min(1).max(120), body: z.string().max(300), url: z.string().max(300), tag: z.string().max(100), locale: z.enum(["ar", "en", "fr"]).default("fr") });
const scope = self as unknown as ServiceWorkerGlobalScope;
scope.addEventListener("install", (event) => { event.waitUntil((async () => { const cache = await caches.open(CACHE); await cache.addAll([OFFLINE, "/icons/icon.svg"]); await scope.skipWaiting(); })()); });
scope.addEventListener("activate", (event) => { event.waitUntil((async () => { const keys = await caches.keys(); await Promise.all(keys.filter((key) => key.startsWith("dz-exchange-") && key !== CACHE).map((key) => caches.delete(key))); await scope.clients.claim(); })()); });
scope.addEventListener("fetch", (event) => {
  const request = event.request; const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== scope.location.origin || url.pathname.startsWith("/api/") || request.headers.has("authorization") || request.cache === "no-store") return;
  if (request.mode === "navigate") { event.respondWith(fetch(request).catch(async () => await caches.match(OFFLINE) ?? Response.error())); return; }
  // Only immutable build assets and our local icon; never cache personalized HTML or API responses.
  if (!url.pathname.startsWith("/_next/static/") && url.pathname !== "/icons/icon.svg") return;
  event.respondWith((async () => { const cache = await caches.open(CACHE); const cached = await cache.match(request); if (cached) return cached; const response = await fetch(request); if (response.ok && response.type === "basic") await cache.put(request, response.clone()); return response; })());
});
scope.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload; try { payload = payloadSchema.parse(event.data?.json()); } catch { return; }
    const url = new URL(payload.url, scope.location.origin);
    if (url.origin !== scope.location.origin || !/^\/(product\/[a-f0-9-]{36}|dashboard|chat|settings)?$/.test(url.pathname)) return;
    await scope.registration.showNotification(payload.title, { body: payload.body, icon: "/icons/icon.svg", badge: "/icons/icon.svg", tag: payload.tag, lang: payload.locale, dir: payload.locale === "ar" ? "rtl" : "ltr", data: { url: `${url.pathname}${url.search}` } });
  })());
});
scope.addEventListener("notificationclick", (event) => {
  event.notification.close(); const raw = String(event.notification.data?.url ?? "/"); const target = new URL(raw, scope.location.origin);
  const safe = target.origin === scope.location.origin && !target.pathname.startsWith("/api/") ? `${target.pathname}${target.search}${target.hash}` : "/";
  event.waitUntil((async () => { const windows = await scope.clients.matchAll({ type: "window", includeUncontrolled: true }); for (const client of windows) { if (new URL(client.url).origin === scope.location.origin && "focus" in client) { await client.focus(); if ("navigate" in client) await (client as WindowClient).navigate(safe); return; } } await scope.clients.openWindow(safe); })());
});
scope.addEventListener("message", (event) => { if (event.data?.type === "SKIP_WAITING") void scope.skipWaiting(); });
export {};
