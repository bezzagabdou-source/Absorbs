/**
 * طبقة التخزين — واجهة موحّدة أمام محوّلين:
 *  1) kvStore   : Upstash / Vercel KV عبر REST (مناسب للإنتاج على Vercel)
 *  2) memoryStore: تخزين مؤقت داخل الذاكرة (للتطوير المحلي فقط)
 *
 * الشكل المخزَّن:
 *   key = `djezzy:user:<telegramId>`
 *   value = JSON { id, createdAt, updatedAt, activeMsisdn, accounts{}, state, meta }
 */
import config from '../config.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('store');
const KEY_PREFIX = 'djezzy:user:';
const META_PREFIX = 'djezzy:meta:';
const TTL = config.storage.userTtlSeconds;

/* ------------------------------ محوّل KV ------------------------------ */
function createKvAdapter({ url, token }) {
  const base = url.replace(/\/+$/, '');

  async function command(args) {
    const response = await fetch(`${base}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([args]),
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`KV ${response.status}: ${detail.slice(0, 200)}`);
    }

    const payload = await response.json();
    const first = Array.isArray(payload) ? payload[0] : payload;
    if (first && first.error) throw new Error(`KV error: ${first.error}`);
    return first ? first.result : null;
  }

  return {
    name: 'kv',
    async get(key) {
      const value = await command(['GET', key]);
      return value ?? null;
    },
    async set(key, value, ttlSeconds = TTL) {
      await command(['SET', key, value, 'EX', String(ttlSeconds)]);
    },
    async del(key) {
      await command(['DEL', key]);
    },
    async ping() {
      const result = await command(['PING']);
      return result === 'PONG' || result === 'PONG\n' || Boolean(result);
    },
  };
}

/* ---------------------------- محوّل الذاكرة ---------------------------- */
function createMemoryAdapter() {
  const data = new Map(); // key -> { value, expiresAt }

  const alive = (entry) => entry && (!entry.expiresAt || entry.expiresAt > Date.now());

  return {
    name: 'memory',
    async get(key) {
      const entry = data.get(key);
      if (!alive(entry)) {
        data.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, ttlSeconds = TTL) {
      data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async del(key) {
      data.delete(key);
    },
    async ping() {
      return true;
    },
  };
}

/* ------------------------------ الواجهة ------------------------------ */
const adapter =
  config.storage.kvUrl && config.storage.kvToken
    ? createKvAdapter({ url: config.storage.kvUrl, token: config.storage.kvToken })
    : createMemoryAdapter();

if (adapter.name === 'memory') {
  log.warn('تخزين مؤقت في الذاكرة — الجلسات ستُفقد عند إعادة تشغيل الدالة. اضبط KV_REST_API_URL/TOKEN للإنتاج.');
}

function emptyUser(id) {
  return {
    id: String(id),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    activeMsisdn: null,
    accounts: {},
    state: null,
    meta: { claimCount: 0, claimWindowStart: Date.now(), cooldowns: {} },
  };
}

/** ترحيل/تصحيح بنية مستخدم قديمة أو ناقصة */
function normalizeUser(user, id) {
  const base = emptyUser(id);
  if (!user || typeof user !== 'object') return base;
  return {
    ...base,
    ...user,
    id: String(id),
    accounts: user.accounts && typeof user.accounts === 'object' ? user.accounts : {},
    meta: { ...base.meta, ...(user.meta || {}) },
  };
}

export const store = {
  adapter: adapter.name,

  async getUser(id) {
    const raw = await adapter.get(`${KEY_PREFIX}${id}`);
    if (!raw) return emptyUser(id);
    try {
      return normalizeUser(JSON.parse(raw), id);
    } catch {
      log.warn(`سجل تالف للمستخدم ${id} — سيُعاد إنشاؤه.`);
      return emptyUser(id);
    }
  },

  async saveUser(user) {
    const record = { ...user, updatedAt: Date.now() };
    await adapter.set(`${KEY_PREFIX}${record.id}`, JSON.stringify(record), TTL);
    return record;
  },

  async deleteUser(id) {
    await adapter.del(`${KEY_PREFIX}${id}`);
  },

  async ping() {
    try {
      return await adapter.ping();
    } catch (error) {
      log.warn(`فشل فحص التخزين: ${error.message}`);
      return false;
    }
  },

  /* ------ بيانات تشخيصية (آخر تحديث وصل، عدّاد…) ------ */
  async getMeta(name) {
    try {
      const raw = await adapter.get(`${META_PREFIX}${name}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async setMeta(name, value, ttlSeconds = 60 * 60 * 24 * 7) {
    try {
      await adapter.set(`${META_PREFIX}${name}`, JSON.stringify(value), ttlSeconds);
    } catch (error) {
      log.debug(`تعذّر حفظ الميتا ${name}: ${error.message}`);
    }
  },
};

export default store;
