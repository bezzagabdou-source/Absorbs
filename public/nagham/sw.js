/* =====================================================================
   نغم — sw.js · قشرة التطبيق بلا إنترنت + تحميل سريع للتكرار
   • يخزّن ملفات الواجهة (HTML/CSS/JS/الأيقونات) فيعمل التطبيق بدون شبكة
   • لا يمسّ روابط البثّ الموقّتة ولا واجهات الـAPI (تبقى حيّة)
   • التحميلات الصوتية تُخزَّن في IndexedDB من التطبيق نفسه، لا هنا
   ===================================================================== */
const VERSION = 'nagham-shell-v1';
const SHELL = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/core.js',
  './assets/js/api.js',
  './assets/js/store.js',
  './assets/js/player.js',
  './assets/js/ui.js',
  './assets/js/app.js',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => c.add(u)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isShell = (u) => u.origin === self.location.origin && !u.pathname.endsWith('/api/');
const isAsset = (u) => u.origin === self.location.origin && /\.(css|js|svg|png|jpg|jpeg|webp|woff2?)$/i.test(u.pathname);

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: false });
  const net = fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || net || cache.match('./offline.html');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);

  /* بثّ صوتي / نطاقات غيرنا / طلبات Range → مرّر كما هي */
  if (u.origin !== self.location.origin) return;
  if (req.headers.get('Range')) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      Promise.race([fetch(req).then(async (res) => {
        const cache = await caches.open(VERSION);
        cache.put('./index.html', res.clone());
        return res;
      }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 9000))])
        .catch(async () => (await caches.match('./index.html')) || (await caches.match('./offline.html')) || Response.error())
    );
    return;
  }

  if (isAsset(req) || isShell(u)) {
    e.respondWith(staleWhileRevalidate(req));
  }
});

/* إرسال رسالة عند توفر نسخة جديدة بعد التحديث */
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
