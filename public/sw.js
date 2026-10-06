/* Nexus AI v8.4 — service worker (offline shell + fast repeat visits) */
const CACHE = "nexus-v9-5-models";
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


/* ---------- hourly notifications ---------- */
const MESSAGES = [
  "⚡ Nexus AI جاهز! اسأله أي سؤال والجواب يوصلك في ثواني.",
  "📚 عندك فرض أو تمرين؟ صوّره وNexus يحلّه بطريقة الأستاذ الجزائري.",
  "🎨 ولّد صورة من كلامك الآن: اكتب وصفك والذكاء يرسمه بالضبط.",
  "🚀 جرّب Nexus AI: أسرع جواب، بالدارجة والعربية والفرنسية.",
  "💡 فكرة، ترجمة، تلخيص أو كود؟ Nexus يخدمك دوك!",
  "🇩🇿 ذكاء اصطناعي جزائري في جيبك. افتح Nexus وابدأ محادثة.",
];

function showHourly() {
  const text = MESSAGES[Math.floor(Date.now() / 3600000) % MESSAGES.length];
  return self.registration.showNotification("Nexus AI", {
    body: text,
    icon: "/icons/nexus-icon-192.png",
    badge: "/icons/nexus-icon-192.png",
    tag: "nexus-hourly", // replaces the previous one instead of stacking
    renotify: true,
    dir: "rtl",
    lang: "ar",
    data: { url: "/app" },
  });
}

self.addEventListener("push", (event) => {
  event.waitUntil(showHourly());
});

/* Chrome installed apps: wake up in the background even without the server push */
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "nexus-hourly") event.waitUntil(showHourly());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate && c.navigate(target).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

/* the browser rotated the subscription: re-subscribe so hourly messages keep coming */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    fetch("/api/push/subscribe")
      .then((r) => r.json())
      .then(({ key }) => {
        const pad = "=".repeat((4 - (key.length % 4)) % 4);
        const raw = atob((key + pad).replace(/-/g, "+").replace(/_/g, "/"));
        const arr = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        return self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: arr });
      })
      .then((sub) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        })
      )
      .catch(() => undefined)
  );
});
