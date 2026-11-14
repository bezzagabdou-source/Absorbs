'use strict';
/**
 * 🗄️ مخزن اللوحة — Redis إلا كان، وإلا ذاكرة محلية.
 *
 * علاش: `REDIS_URL` كان فارغ (sensitive بلا قيمة) فكل الصفحات كانت كتطيح.
 * دابا: كنحاولو Redis (رجيع عبر TCP جوج)، وإلا فشل كنكملو بذاكرة العملية —
 * اللوحة كتخدم، والمفاتيح كتبان فالفحص بلي مؤقتة.
 */
const { createRedis } = require('./redis-lite');

const URL_RAW = () => String(process.env.REDIS_URL || process.env.KV_URL || '').trim();

let memory = null;
function mem() {
  if (!memory) {
    const g = globalThis;
    if (!g.__ftPanelMemory) {
      g.__ftPanelMemory = { kv: new Map(), lists: new Map(), degraded: false, since: 0, lastError: '', writes: 0 };
    }
    memory = g.__ftPanelMemory;
  }
  return memory;
}

let client = null;
let lastFailure = 0;

function redis() {
  const url = URL_RAW();
  if (!url) {
    const m = mem();
    m.degraded = true;
    m.since = m.since || Date.now();
    m.lastError = m.lastError || 'REDIS_URL غير مهيّأ';
  } else if (!client && Date.now() - lastFailure > 5000) {
    try {
      client = createRedis(url, { commandTimeout: 8000 });
      client.on('error', (error) => {
        lastFailure = Date.now();
        const m = mem();
        if (!m.degraded) { m.degraded = true; m.since = Date.now(); }
        m.lastError = String(error?.message || error).slice(0, 200);
      });
    } catch (error) {
      lastFailure = Date.now();
    }
  }
  return client || memClient();
}

/** واجهة مطابقة كتخدم على الذاكرة — إلا طاح Redis اللوحة كتبقى خدّامة */
function memClient() {
  return {
    _memory: true,
    async get(key) { const m = mem(); return m.kv.has(key) ? m.kv.get(key) : null; },
    async set(key, value, ...rest) {
      const m = mem(); m.writes += 1;
      const nx = rest.some((x) => String(x).toUpperCase() === 'NX');
      if (nx && m.kv.has(key)) return null;
      m.kv.set(key, String(value));
      return 'OK';
    },
    async del(...keys) { const m = mem(); let n = 0; for (const k of keys.flat()) if (m.kv.delete(k)) n += 1; return n; },
    /* نفس واجهة RedisClient باش الكود اللي كيسدّي الاتصال ما يطيحش في وضع الذاكرة */
    async quit() { return 'OK'; },
    disconnect() { /* بلا اتصال أصلاً */ },
    on() { /* بلا أحداث في الذاكرة */ },
    async mget(...keys) { const m = mem(); return keys.flat().map((k) => (m.kv.has(k) ? m.kv.get(k) : null)); },
    async lindex(key, index) { const m = mem(); const list = m.lists.get(key) || []; const i = Number(index) < 0 ? list.length + Number(index) : Number(index); return list[i] ?? null; },
    async lrange(key, start, stop) { const m = mem(); const list = m.lists.get(key) || []; const end = Number(stop) < 0 ? list.length : Number(stop) + 1; return list.slice(Number(start), end); },
    async lpush(key, ...values) { const m = mem(); const list = m.lists.get(key) || []; list.unshift(...values.flat().reverse()); m.lists.set(key, list); return list.length; },
    async eval(script, numKeys, ...args) {
      // النسخ اللي كتستعملها اللوحة: مقارنة-ثم-حذف/دفع. كننفّذو على الذاكرة.
      const [key] = args;
      const expected = args[1];
      const m = mem();
      if (/LINDEX/i.test(script)) {
        const list = m.lists.get(key) || [];
        if (list[0] !== expected) return null;
        list.shift(); m.lists.set(key, list); return expected;
      }
      if (/GET/i.test(script) && /DEL/i.test(script)) {
        if (m.kv.get(key) !== expected) return 0;
        m.kv.delete(key); return 1;
      }
      return null;
    },
    async scan(cursor, ...args) {
      const m = mem(); const pattern = args[1] || '*';
      const re = new RegExp(`^${String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      const keys = [...m.kv.keys(), ...m.lists.keys()].filter((k) => re.test(k));
      return ['0', keys];
    },
    multi() {
      const ops = [];
      const self = this;
      const b = {
        set: (k, v, ...r) => { ops.push(['set', [k, v, ...r]]); return b; },
        del: (...k) => { ops.push(['del', k.flat()]); return b; },
        lpush: (k, ...v) => { ops.push(['lpush', [k, ...v.flat()]]); return b; },
        lrem: (k, count, value) => { ops.push(['lrem', [k, count, value]]); return b; },
        lpop: (k) => { ops.push(['lpop', [k]]); return b; },
        /* نفس عقد ioredis: exec() كيرجّع [error, reply] لكل أمر */
        exec: async () => {
          const out = [];
          for (const [fn, args] of ops) {
            try { out.push([null, await self[fn](...args)]); }
            catch (error) { out.push([error, null]); }
          }
          return out;
        },
      };
      return b;
    },
    async lpop(key) { const m = mem(); const list = m.lists.get(key) || []; const value = list.shift() ?? null; m.lists.set(key, list); return value; },
    async lrem(key, count, value) {
      const m = mem(); const list = m.lists.get(key) || [];
      const target = String(value); let removed = 0;
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (list[i] === target) { list.splice(i, 1); removed += 1; if (count > 0 && removed >= count) break; }
      }
      m.lists.set(key, list); return removed;
    },
    ping() { return 'PONG'; },
  };
}

/**
 * 🗄️ اتصال ثاني اختياري: قاعدة اللوحة *القديمة*.
 * كيخلّي النقل (legacy_scan) يقرا من Redis قديم مستقل بلا ما نلمسو تخزين اللوحة الحالية.
 */
let legacyClient = null;
function legacyRedis() {
  const url = String(process.env.LEGACY_REDIS_URL || process.env.OLD_REDIS_URL || '').trim();
  if (!url) return redis();
  if (!legacyClient) {
    try {
      legacyClient = createRedis(url, { commandTimeout: 8000 });
      legacyClient.on('error', () => {});
    } catch { return redis(); }
  }
  return legacyClient;
}

async function getJ(k, def = null) {
  try {
    const v = await redis().get(k);
    if (v == null) return def;
    try { return JSON.parse(v); } catch { return def; }
  } catch { return def; }
}

async function setJ(k, v) {
  await redis().set(k, JSON.stringify(v));
  return true;
}

async function scanKeys(pattern) {
  const out = [];
  try {
    let cur = '0';
    do {
      const res = await redis().scan(cur, 'MATCH', pattern, 'COUNT', 1000);
      cur = res[0];
      out.push(...res[1]);
    } while (cur !== '0');
  } catch { /* اللوحة كتخدم بلا مفاتيح */ }
  return out;
}

async function mgetJ(keys) {
  const out = [];
  try {
    for (let i = 0; i < keys.length; i += 200) {
      const vals = await redis().mget(keys.slice(i, i + 200));
      for (const v of vals) { try { out.push(JSON.parse(v)); } catch { /* skip */ } }
    }
  } catch { /* skip */ }
  return out;
}

function storageInfo() {
  const m = mem();
  const hasUrl = !!URL_RAW();
  const usingMemory = !client || m.degraded;
  return {
    backend: hasUrl ? 'redis' : 'memory',
    persistent: hasUrl && !usingMemory,
    degraded: usingMemory,
    pendingWrites: m.writes,
    lastError: m.lastError,
  };
}

module.exports = { redis, legacyRedis, getJ, setJ, scanKeys, mgetJ, storageInfo };
