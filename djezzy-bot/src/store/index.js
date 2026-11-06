/**
 * طبقة التخزين — واجهة موحّدة أمام محوّلين:
 *  1) kvStore   : Upstash / Vercel KV عبر REST (مناسب للإنتاج على Vercel)
 *  2) memoryStore: تخزين مؤقت داخل الذاكرة (للتطوير المحلي فقط)
 *
 * الشكل المخزَّن:
 *   key = `djezzy:user:<telegramId>`
 *   value = JSON { id, createdAt, updatedAt, activeMsisdn, accounts{}, state, meta }
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
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

/* --------------------------- محوّل ملف محلي --------------------------- */
/**
 * يُستخدم عند التشغيل من جهاز/خادم خاص (npm run poll) — الجلسات تبقى بعد إعادة التشغيل.
 * الملف: djezzy-bot/.data/store.json (مُستثنى من Git)
 */
function createFileAdapter(filePath = resolve(process.cwd(), '.data', 'store.json')) {
  let cache = null;
  let writing = Promise.resolve();

  const load = async () => {
    if (cache) return cache;
    try {
      cache = JSON.parse(await readFile(filePath, 'utf8'));
    } catch {
      cache = {};
    }
    return cache;
  };

  const persist = () => {
    const snapshot = JSON.stringify(cache ?? {});
    writing = writing.then(async () => {
      await mkdir(dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      await writeFile(tmp, snapshot, 'utf8');
      await rename(tmp, filePath);
    });
    return writing;
  };

  const alive = (entry) => entry && (!entry.expiresAt || entry.expiresAt > Date.now());

  return {
    name: 'file',
    path: filePath,
    async get(key) {
      const data = await load();
      const entry = data[key];
      if (!alive(entry)) return null;
      return entry.value ?? null;
    },
    async set(key, value, ttlSeconds = TTL) {
      const data = await load();
      data[key] = { value, expiresAt: Date.now() + ttlSeconds * 1000 };
      await persist();
    },
    async del(key) {
      const data = await load();
      delete data[key];
      await persist();
    },
    async ping() {
      return true;
    },
  };
}

/* ------------------------------ الواجهة ------------------------------ */
/**
 * المحوّل يُختار عند أول استخدام (وليس عند الاستيراد) حتى تصل متغيّرات البيئة
 * التي تضبطها سكربتات الاختبار قبل التحميل — مثل STORE_FILE.
 */
let adapterRef = null;

function resolveAdapter() {
  if (adapterRef) return adapterRef;

  if (config.storage.kvUrl && config.storage.kvToken) {
    adapterRef = createKvAdapter({ url: config.storage.kvUrl, token: config.storage.kvToken });
  } else if (!config.isVercel) {
    adapterRef = createFileAdapter(process.env.STORE_FILE);
  } else {
    adapterRef = createMemoryAdapter();
  }

  if (adapterRef.name === 'memory') {
    log.warn('تخزين مؤقت في الذاكرة — الجلسات ستُفقد عند إعادة تشغيل الدالة. اضبط KV_REST_API_URL/TOKEN للإنتاج.');
  } else if (adapterRef.name === 'file') {
    log.info(`تخزين على القرص: ${adapterRef.path} — الجلسات تبقى بعد إعادة التشغيل.`);
  }

  return adapterRef;
}

const adapter = () => resolveAdapter();

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
  get adapter() {
    return resolveAdapter().name;
  },
  get adapterPath() {
    return resolveAdapter().path ?? null;
  },

  async getUser(id) {
    const raw = await adapter().get(`${KEY_PREFIX}${id}`);
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
    await adapter().set(`${KEY_PREFIX}${record.id}`, JSON.stringify(record), TTL);
    return record;
  },

  async deleteUser(id) {
    await adapter().del(`${KEY_PREFIX}${id}`);
  },

  async ping() {
    try {
      return await adapter().ping();
    } catch (error) {
      log.warn(`فشل فحص التخزين: ${error.message}`);
      return false;
    }
  },

  /* ------ بيانات تشخيصية (آخر تحديث وصل، عدّاد…) ------ */
  async getMeta(name) {
    try {
      const raw = await adapter().get(`${META_PREFIX}${name}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async setMeta(name, value, ttlSeconds = 60 * 60 * 24 * 7) {
    try {
      await adapter().set(`${META_PREFIX}${name}`, JSON.stringify(value), ttlSeconds);
    } catch (error) {
      log.debug(`تعذّر حفظ الميتا ${name}: ${error.message}`);
    }
  },
};

export default store;
