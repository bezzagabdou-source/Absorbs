/**
 * طبقات المسارات (Routes) — للوصول إلى خوادم جيزي مهما كان موقعك.
 *
 * خوادم apim.djezzy.dz تقبل الاتصال بشكل موثوق من الشبكات الجزائرية، وقد تحجب
 * عناوين سيرفرات السحابة. لذلك يجرّب هذا الموديل عدة مسارات بالترتيب ويعتمد
 * أول استجابة HTTP حقيقية (الأخطاء الشبكية فقط تُكيّف للمسار التالي):
 *
 *   1) relay      — خادم وسيط تشغّله أنت داخل الجزائر (DJEZZY_RELAY_URL)  [الأثبت]
 *   2) direct     — اتصال مباشر من الاستضافة (DJEZZY_DIRECT=1/0)
 *   3) env proxies— بروكسيات يضبطها المستخدم (DJEZZY_PROXIES)
 *   4) auto proxy — بروكسيات جزائرية عمومية تُكتشف تلقائياً (DJEZZY_AUTO_PROXY)
 *
 * كل محاولة تُسجَّل في routeStats حتى تعرضها صفحة /health و /api/probe.
 */
import axios from 'axios';
import config from '../config.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('djezzy/routes');

const AUTO_CACHE = { list: [], fetchedAt: 0 };
const AUTO_TTL_MS = 10 * 60 * 1000;
const MAX_AUTO = 6;

/** آخر مسار نجح + إحصاء المحاولات (للفحص والتشخيص) */
export const routeStats = { lastSuccess: null, attempts: [] };

/**
 * تطبيع بروكسي بالصيغ المدعومة:
 *   http://user:pass@host:port  |  host:port  |  host:port:user:pass  (صيغة kookeey)
 */
export function parseProxy(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const withScheme = /^https?:\/\//i.test(text) ? text : `http://${text}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname;
    const port = Number(url.port || 8080);
    if (!host || !Number.isFinite(port)) return null;
    const auth = url.username
      ? { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password || '') }
      : undefined;
    return { host, port, protocol: 'http', auth, label: `${host}:${port}` };
  } catch {
    // صيغة host:port:user:pass
    const parts = text.split(':');
    if (parts.length >= 4) {
      const [host, port, username, ...rest] = parts;
      return {
        host,
        port: Number(port),
        protocol: 'http',
        auth: { username, password: rest.join(':') },
        label: `${host}:${port}`,
      };
    }
    return null;
  }
}

/** اكتشاف بروكسيات جزائرية من قوائم عامة (best-effort) */
export async function discoverDzProxies() {
  if (!config.djezzy.autoProxy) return [];
  if (AUTO_CACHE.list.length && Date.now() - AUTO_CACHE.fetchedAt < AUTO_TTL_MS) {
    return AUTO_CACHE.list;
  }

  const found = new Map();
  const grab = async (url, parse) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { Accept: '*/*' } });
      if (!response.ok) return;
      const text = await response.text();
      for (const item of parse(text)) {
        const proxy = parseProxy(item);
        if (proxy?.host && proxy.port) found.set(proxy.label, proxy);
      }
    } catch {
      /* المصدر غير متاح — نتجاهله */
    }
  };

  await Promise.all([
    // GeoNode — بروكسيات مصنّفة بالبلد DZ
    grab(
      'https://proxylist.geonode.com/api/proxy-list?limit=100&page=1&sort_by=lastChecked&sort_type=desc&country=DZ&protocols=http%2Chttps',
      (text) => {
        try {
          const json = JSON.parse(text);
          return (json.data || []).map((item) => `${item.ip}:${item.port}`);
        } catch {
          return [];
        }
      },
    ),
    // ProxyScrape — قائمة نصية ip:port لبلد DZ
    grab('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=DZ&ssl=all&anonymity=all', (text) =>
      text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\d{1,3}(\.\d{1,3}){3}:\d{2,5}$/.test(line)),
    ),
  ]);

  AUTO_CACHE.list = [...found.values()].slice(0, 12);
  AUTO_CACHE.fetchedAt = Date.now();
  if (AUTO_CACHE.list.length) log.info(`تم اكتشاف ${AUTO_CACHE.list.length} بروكسي جزائري عمومي.`);
  return AUTO_CACHE.list;
}

/** بناء قائمة المسارات بالترتيب (الأثبت أولاً) */
export async function buildRoutes() {
  const routes = [];

  if (config.djezzy.relayUrl) {
    routes.push({ kind: 'relay', name: 'relay', url: config.djezzy.relayUrl, token: config.djezzy.relayToken });
  }
  if (config.djezzy.direct) {
    routes.push({ kind: 'direct', name: 'direct' });
  }
  for (const raw of config.djezzy.proxies) {
    const proxy = parseProxy(raw);
    if (proxy) routes.push({ kind: 'proxy', name: `env:${proxy.label}`, proxy });
  }
  if (config.djezzy.autoProxy) {
    for (const proxy of await discoverDzProxies()) {
      routes.push({ kind: 'proxy', name: `auto:${proxy.label}`, proxy });
    }
  }
  return routes;
}

const isNetworkError = (error) =>
  Boolean(error) &&
  !error.response &&
  ['ECONNABORTED', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ERR_CANCELED'].includes(
    error.code || error.cause?.code,
  );

/* 403/451 = البوابة تحجب هذه المنطقة/العنوان (حجب جغرافي) — ليس خطأ في الطلب،
   لذا نُجتاز المسار ونجرّب التالي (بروكسي/relay) بدل إسقاط الجلسة */
const isBlockedStatus = (status) => status === 403 || status === 451;

function axiosFor(route, timeoutMs) {
  const base = {
    timeout: route.kind === 'proxy' ? Math.min(timeoutMs, 10000) : Math.min(timeoutMs, 15000),
    validateStatus: () => true,
    responseType: 'text',
    transformResponse: [(data) => data],
    maxRedirects: 0,
    proxy: false,
  };

  if (route.kind === 'proxy') {
    base.proxy = {
      protocol: route.proxy.protocol || 'http',
      host: route.proxy.host,
      port: route.proxy.port,
      ...(route.proxy.auth ? { auth: route.proxy.auth } : {}),
    };
    // بروكسيات HTTP قد ترفض TLS-SNI المتطابق — نبقي التحقق من الشهادة مفعّلاً افتراضياً
  }
  return axios.create(base);
}

/**
 * تنفيذ طلب عبر أول مسار متاح.
 * @returns {Promise<{status:number,data:any,headers:object,route:string}>}
 */
export async function request({ method = 'POST', url, query, headers = {}, data, timeoutMs = 20000 }) {
  const routes = await buildRoutes();
  if (routes.length === 0) {
    const error = new Error('لا توجد أي مسار اتصال بخوادم جيزي (DJEZZY_DIRECT/PROXIES/RELAY).');
    error.code = 'ENOTFOUND';
    throw error;
  }

  let target = url;
  if (query && Object.keys(query).length) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) params.set(key, String(value));
    target += `${url.includes('?') ? '&' : '?'}${params.toString()}`;
  }

  let lastError = null;
  let lastBlocked = null;

  for (const route of routes) {
    const started = Date.now();
    try {
      let response;

      if (route.kind === 'relay') {
        const envelope = await fetch(route.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(route.token ? { 'x-relay-token': route.token } : {}),
          },
          body: JSON.stringify({ method, url: target, headers, body: typeof data === 'string' ? data : null }),
          signal: AbortSignal.timeout(Math.min(timeoutMs, 20000)),
        });
        const payload = await envelope.json().catch(() => null);
        if (!envelope.ok || !payload || typeof payload.status !== 'number') {
          const err = new Error(`relay HTTP ${envelope.status}`);
          err.code = 'ECONNRESET';
          throw err;
        }
        response = { status: payload.status, data: payload.body ?? '', headers: payload.headers || {} };
      } else {
        const http = axiosFor(route, timeoutMs);
        response = await http.request({ method, url: target, headers, data });
      }

      const record = { route: route.name, status: response.status, ms: Date.now() - started, at: Date.now() };
      routeStats.attempts.push(record);
      if (routeStats.attempts.length > 40) routeStats.attempts.shift();

      if (isBlockedStatus(response.status)) {
        // حجب جغرافي من هذا المسار — سجّله وجرّب المسار التالي
        lastBlocked = { status: response.status, data: response.data, headers: response.headers || {}, route: route.name };
        log.debug(`المسار ${route.name} محجوب (HTTP ${response.status}) — تجربة المسار التالي…`);
        continue;
      }

      routeStats.lastSuccess = record;
      return { status: response.status, data: response.data, headers: response.headers || {}, route: route.name };
    } catch (error) {
      const record = { route: route.name, error: error.code || error.message, ms: Date.now() - started, at: Date.now() };
      routeStats.attempts.push(record);
      if (routeStats.attempts.length > 40) routeStats.attempts.shift();

      if (isNetworkError(error)) {
        lastError = error;
        log.debug(`فشل المسار ${route.name} (${error.code || error.message}) — تجربة المسار التالي…`);
        continue;
      }
      // خطأ غير شبكي (إعداد/طلب) — نرفعه مباشرة
      throw error;
    }
  }

  // إن وصلنا رداً محجوباً من أي مسار نُرجعه (أوضح من خطأ شبكة) — والعميل يعرض الحجب بصدق
  if (lastBlocked) return lastBlocked;

  const failure = lastError || new Error('فشلت جميع مسارات الوصول إلى جيزي.');
  failure.routeExhausted = true;
  failure.routesTried = routeStats.attempts.slice(-routes.length).map((item) => item.route);
  throw failure;
}

/** ملخص المسارات للتشخيص (صفحة /health) */
export function describeRoutes() {
  return {
    configured: {
      relay: config.djezzy.relayUrl || null,
      direct: config.djezzy.direct,
      envProxies: config.djezzy.proxies.length,
      autoProxy: config.djezzy.autoProxy,
      discovered: AUTO_CACHE.list.length,
    },
    lastSuccess: routeStats.lastSuccess,
    recent: routeStats.attempts.slice(-8),
  };
}

export default { request, buildRoutes, parseProxy, describeRoutes, routeStats, discoverDzProxies };
