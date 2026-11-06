/**
 * proxy.js — بروكسي جزائري مع تجميع (Pool) وفشل تلقائي (Failover)
 * ============================================================================
 * لماذا؟
 *   خوادم جيزي (apim.djezzy.dz) ترفض أي IP خارج الجزائر. لكي يعمل البوت على
 *   استضافة سحابية (خارج الجزائر) يجب أن تمرّ كل طلبات جيزي عبر بروكسي جزائري.
 *
 * المزايا:
 *   • يدعم HTTP/HTTPS CONNECT و SOCKS4/5 (بيانات مصادقة اختيارية).
 *   • تجميع عدة بروكسيات + توزيع دوري (round-robin) + تعليم الصالح/الفاشل.
 *   • Cooldown تلقائي للبروكسي الذي يفشل 3 مرات (120 ثانية) ثم يُعاد تجريبه.
 *   • keepAlive على مستوى البروكسي (أقل زمن استجابة على شبكات الهاتف).
 *   • عند فشل الكل: رجوع اختياري لاتصال مباشر (مفيد داخل الجزائر).
 *
 * الاستعمال:
 *   DJEZZY_PROXIES="http://user:pass@41.x.x.x:8080,socks5://user:pass@41.x.x.x:1080"
 * ============================================================================
 */
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

const COOLDOWN_MS = 120_000; // مدة استبعاد البروكسي بعد 3 إخفاقات
const MAX_FAILS = 3;

/** يحوّل نص/مصفوفة إلى قائمة بروكسيات صالحة (ويحذف المكرّر) */
export function parseProxyList(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/);
  const seen = new Set();
  const list = [];

  for (const item of raw) {
    const text = String(item || '').trim();
    if (!text || text.startsWith('#')) continue;

    const normalized = /^[a-z0-9+.-]+:\/\//i.test(text) ? text : `http://${text}`;
    let url;
    try {
      url = new URL(normalized);
    } catch {
      continue;
    }
    if (!url.hostname) continue;

    // رفض الأسماء غير الصالحة (نص عربي/رموز) بدل اعتبارها مضيفاً
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const isV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    const isV6 = host.includes(':') && /^[0-9a-f:.]+$/i.test(host);
    const isName =
      host === 'localhost' ||
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host);
    if (!isV4 && !isV6 && !isName) continue;

    const protocol = url.protocol.replace(':', '').toLowerCase();
    if (!['http', 'https', 'socks', 'socks4', 'socks5', 'socks5h'].includes(protocol)) continue;

    const key = `${host}:${url.port || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    list.push({
      raw: normalized,
      protocol,
      host,
      port: Number(url.port) || (protocol === 'https' ? 443 : protocol.startsWith('socks') ? 1080 : 80),
      username: url.username ? decodeURIComponent(url.username) : null,
      password: url.password ? decodeURIComponent(url.password) : null,
      agent: null,
      fails: 0,
      ok: 0,
      lastError: null,
      lastLatency: null,
      blockedUntil: 0,
    });
  }

  return list;
}

/** ينشئ الوكيل المناسب (يُخزَّن داخل العنصر لإعادة الاستعمال) */
export function agentFor(entry, options = {}) {
  if (!entry) return null;
  if (entry.agent) return entry.agent;

  const timeout = Number(options.timeoutMs) || 30_000;
  if (entry.protocol.startsWith('socks')) {
    entry.agent = new SocksProxyAgent(entry.raw, { timeout });
  } else {
    entry.agent = new HttpsProxyAgent(entry.raw, { timeout, keepAlive: true, keepAliveMsecs: 1000 });
  }
  return entry.agent;
}

export class ProxyPool {
  constructor(list = [], options = {}) {
    this.entries = list.map((item) =>
      typeof item === 'string'
        ? { ...parseProxyList(item)[0], agent: null }
        : item,
    ).filter(Boolean);

    this.entries = this.entries.filter((entry) => entry && entry.host);
    for (const entry of this.entries) agentFor(entry, options);

    this.options = options;
    this.index = 0;
    this.directFallback = options.directFallback !== false;
  }

  get size() {
    return this.entries.length;
  }

  get enabled() {
    return this.entries.length > 0;
  }

  /** البروكسي التالي في الدورة — يتجاهل المستبعَد مؤقتاً إن وُجد بديل */
  next(now = Date.now()) {
    if (!this.entries.length) return null;

    const healthy = this.entries.filter((entry) => entry.blockedUntil <= now);
    if (!healthy.length) {
      // الكل مستبعَد: جرّب الأقرب لانتهاء الـ cooldown بدل الاستسلام
      const soonest = [...this.entries].sort((a, b) => a.blockedUntil - b.blockedUntil)[0];
      return this.directFallback ? null : soonest;
    }

    const entry = healthy[this.index % healthy.length];
    this.index = (this.index + 1) % Math.max(healthy.length, 1);
    return entry;
  }

  markOk(entry, latencyMs) {
    if (!entry) return;
    entry.fails = 0;
    entry.ok += 1;
    entry.blockedUntil = 0;
    entry.lastError = null;
    if (Number.isFinite(latencyMs)) entry.lastLatency = Math.round(latencyMs);
  }

  markFail(entry, error) {
    if (!entry) return;
    entry.fails += 1;
    entry.lastError = String(error || 'error').slice(0, 90);
    if (entry.fails >= MAX_FAILS) {
      entry.blockedUntil = Date.now() + COOLDOWN_MS;
      entry.fails = 0;
    }
  }

  /** تقرير مختصر للعرض في /diag و pm2 logs */
  status(now = Date.now()) {
    if (!this.entries.length) {
      return { enabled: false, total: 0, healthy: 0, text: 'بدون بروكسي — اتصال مباشر' };
    }
    const healthy = this.entries.filter((entry) => entry.blockedUntil <= now).length;
    const text = this.entries
      .map((entry) => {
        const state = entry.blockedUntil > now ? '⛔' : '✅';
        const latency = entry.lastLatency ? ` ${entry.lastLatency}ms` : '';
        const fails = entry.lastError ? ` (${entry.lastError})` : '';
        return `${state} ${entry.protocol}://${entry.host}:${entry.port}${latency}${fails}`;
      })
      .join('\n');
    return { enabled: true, total: this.entries.length, healthy, text };
  }
}

export default ProxyPool;
