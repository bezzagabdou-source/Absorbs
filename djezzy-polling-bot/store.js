/**
 * store.js — تخزين محلي دائم (ملف JSON) + تشفير رموز الجلسات
 * ============================================================================
 * • الجلسات تُحفظ في data/sessions.json فلا تعيد إدخال رمز OTP بعد إعادة التشغيل.
 * • كل Access/Refresh Token يُخزَّن مشفّراً AES-256-GCM (لا شيء صريحاً على القرص).
 * • مفتاح التشفير: SESSION_KEY من .env، أو يُولَّد مرة واحدة في data/.session-key.
 * ============================================================================
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const DATA_DIR = resolve(process.cwd(), 'data');
const STORE_FILE = resolve(DATA_DIR, 'sessions.json');
const KEY_FILE = resolve(DATA_DIR, '.session-key');

/* ------------------------------ مفتاح التشفير ------------------------------ */
function loadKey() {
  const fromEnv = (process.env.SESSION_KEY || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(fromEnv)) return Buffer.from(fromEnv, 'hex');
  if (fromEnv) return Buffer.from(fromEnv.padEnd(32, '0').slice(0, 32), 'utf8');

  mkdirSync(dirname(KEY_FILE), { recursive: true });
  if (existsSync(KEY_FILE)) return Buffer.from(readFileSync(KEY_FILE, 'utf8').trim(), 'hex');

  const key = randomBytes(32);
  writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
  try {
    chmodSync(KEY_FILE, 0o600);
  } catch {
    /* على Windows قد لا يعمل — لا مشكلة */
  }
  return key;
}

const KEY = loadKey();

/** يشفّر نصاً → "iv.tag.payload" (base64) */
export function encrypt(plain) {
  if (!plain) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const payload = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), payload.toString('base64')].join('.');
}

/** يفكّ التشفير؛ يُعيد null عند التلف */
export function decrypt(blob) {
  if (!blob) return null;
  try {
    const [iv, tag, payload] = String(blob).split('.');
    const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/* -------------------------------- التخزين -------------------------------- */
let cache = null;

function read() {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(STORE_FILE, 'utf8'));
  } catch {
    cache = { users: {} };
  }
  if (!cache.users) cache.users = {};
  return cache;
}

function write() {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2), { mode: 0o600 });
  renameSync(tmp, STORE_FILE);
}

const emptyUser = (id) => ({
  id: String(id),
  createdAt: Date.now(),
  active: null,
  accounts: {},
  state: null,
  lastWeeklyClaimAt: null,
  lastActionAt: null,
});

export const store = {
  file: STORE_FILE,

  getUser(id) {
    const data = read();
    const user = data.users[String(id)];
    return user ? { ...emptyUser(id), ...user, accounts: user.accounts || {} } : emptyUser(id);
  },

  saveUser(user) {
    const data = read();
    data.users[String(user.id)] = { ...user, updatedAt: Date.now() };
    write();
    return data.users[String(user.id)];
  },

  /* ------ حسابات الرقم داخل حساب المستخدم ------ */
  addAccount(userId, msisdn, { accessToken, refreshToken, expiresIn }) {
    const user = this.getUser(userId);
    user.accounts[msisdn] = {
      msisdn,
      label: `0${msisdn.slice(3, 5)} *** ** ${msisdn.slice(-2)}`,
      tokenEnc: encrypt(accessToken),
      refreshEnc: encrypt(refreshToken),
      expiresAt: Date.now() + (Number(expiresIn) || 3600) * 1000,
      addedAt: Date.now(),
    };
    user.active = msisdn;
    user.state = null;
    return this.saveUser(user);
  },

  removeAccount(userId, msisdn) {
    const user = this.getUser(userId);
    delete user.accounts[msisdn];
    if (user.active === msisdn) user.active = Object.keys(user.accounts)[0] || null;
    return this.saveUser(user);
  },

  setActive(userId, msisdn) {
    const user = this.getUser(userId);
    user.active = msisdn;
    return this.saveUser(user);
  },

  setState(userId, state) {
    const user = this.getUser(userId);
    user.state = state;
    return this.saveUser(user);
  },

  touch(userId, extra = {}) {
    const user = this.getUser(userId);
    Object.assign(user, { lastActionAt: Date.now() }, extra);
    return this.saveUser(user);
  },
};

export default store;
