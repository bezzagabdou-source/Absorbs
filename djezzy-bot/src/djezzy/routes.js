/**
 * طبقات المسارات (Routes) — مسارات اتصال معدّة وموصى بها فقط، بلا اكتشاف أو تدوير:
 *
 *   1) relay      — خادم وسيط تشغّله أنت داخل الجزائر (DJEZZY_RELAY_URL)
 *   2) direct     — اتصال مباشر من الاستضافة (DJEZZY_DIRECT=1/0)
 *   3) env proxies— بروكسيات يضبطها المستخدم يدوياً (DJEZZY_PROXIES)
 *
 * القواعد الصارمة:
 *   - عند أول ردّ من الخادم (نجاح أو رفض أو حجب أو429) ينتهي الطلب فوراً — لا إعادة.
 *   - الانتقال لمسار آخر يحدث عند خطأ شبكي بحت فقط (لم يصل أي رد أصلاً).
 *   - لا بروكسيات عمومية مكتشفة تلقائياً ولا تدوير لتجاوز أي حجب.
 *
 * كل محاولة تُسجَّل في routeStats حتى تعرضها صفحة /health و /api/probe.
 */
import axios from 'axios';
import config from '../config.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('djezzy/routes');

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
  return routes;
}

const isNetworkError = (error) =>
  Boolean(error) &&
  !error.response &&
  ['ECONNABORTED', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ERR_CANCELED'].includes(
    error.code || error.cause?.code,
  );

/* حجب جغرافي = nginx يعيد نص "403 Forbidden" (أو451) — أما أخطاء التطبيق
   JSON (رصيد/باقة/eligibility) فلا تُجتاز وتُعرض للمستخدم فوراً */
const isBlockedStatus = (status, body) => {
  if (status === 451) return true;
  if (status !== 403) return false;
  return /403 forbidden|nginx/i.test(String(body ?? ''));
};

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
        const http = axiosFor(route, effectiveTimeout);
        response = await http.request({ method, url: target, headers, data });
      }

      const record = { route: route.name, status: response.status, ms: Date.now() - started, at: Date.now() };
      routeStats.attempts.push(record);
      if (routeStats.attempts.length > 40) routeStats.attempts.shift();

      if (isBlockedStatus(response.status, response.data)) {
        // حجب/رفض من الخادم — إيقاف فوري: لا مسارات أخرى ولا إعادة (القواعد الصارمة)
        const blocked = { status: response.status, data: response.data, headers: response.headers || {}, route: route.name };
        log.warn(`المسار ${route.name} محجوب (HTTP ${response.status}) — أُوقف الطلب فوراً.`);
        return blocked;
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

  const failure = lastError || new Error('فشل الاتصال بخوادم جيزي (لم يصل أي رد).');
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
    },
    lastSuccess: routeStats.lastSuccess,
    recent: routeStats.attempts.slice(-8),
  };
}

export default { request, buildRoutes, parseProxy, describeRoutes, routeStats };
