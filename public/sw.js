/* برق — service worker (offline shell + fast repeat visits) */
const CACHE = "barq-v8-pro2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest"];
const MAX_ENTRIES = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/* keep the cache from growing forever */
async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_ENTRIES) {
    await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((k) => cache.delete(k)));
  }
}

async function store(request, res) {
  if (!res || !res.ok || res.type === "opaque") return;
  const cache = await caches.open(CACHE);
  await cache.put(request, res.clone());
  await trim(cache);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache API

  // Pages: network first, then cache, then the offline page
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          event.waitUntil(store(request, res.clone()));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (await caches.match(OFFLINE_URL));
        })
    );
    return;
  }

  // Hashed build files never change: cache first (instant)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            event.waitUntil(store(request, res.clone()));
            return res;
          })
      )
    );
    return;
  }

  // Everything else (icons, fonts, images): answer from cache at once, refresh in background
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          event.waitUntil(store(request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
