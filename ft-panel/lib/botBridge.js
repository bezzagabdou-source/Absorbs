const crypto = require('node:crypto');
const { redis } = require('./db');

// A separate project and data store: never assume the panel's Redis is the bot's database.
const KEY = 'ft-panel:bot-connection:v1';
const DEFAULT_BOT = 'https://ft-bot-bice.vercel.app';
function botOrigin() {
  const url = new URL(process.env.BOT_BASE_URL || DEFAULT_BOT);
  if ((url.protocol !== 'https:' && !(process.env.NODE_ENV === 'test' && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('رابط البوت غير صالح؛ يجب ضبط BOT_BASE_URL كرابط HTTPS');
  }
  return url.origin;
}
function secretKey() {
  const secret = process.env.SESSION_SECRET || '';
  if (!secret) throw new Error('SESSION_SECRET غير مهيأ');
  return crypto.createHmac('sha256', secret).update('ft-panel bot connection v1').digest();
}
function seal(key) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([c.update(key, 'utf8'), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
}
function unseal(raw) {
  const a = JSON.parse(raw);
  if (!a || a.v !== 1) throw new Error('إعدادات ربط البوت غير صالحة');
  const c = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(a.iv, 'base64'));
  c.setAuthTag(Buffer.from(a.tag, 'base64'));
  return Buffer.concat([c.update(Buffer.from(a.data, 'base64')), c.final()]).toString('utf8');
}
async function botKey() {
  const raw = await redis().get(KEY);
  if (raw) {
    try { return unseal(raw); } catch { throw new Error('تعذّر فك ربط البوت؛ أعد ربطه من الإعدادات'); }
  }
  if (process.env.BOT_PANEL_KEY) return process.env.BOT_PANEL_KEY;
  throw new Error('اربط FT-bot أولاً من الإعدادات');
}
async function connected() {
  return { configured: !!(process.env.BOT_PANEL_KEY || await redis().get(KEY)), origin: botOrigin() };
}
async function call(path, { key, body, timeout = 15000 } = {}) {
  const credential = key || await botKey();
  const response = await fetch(botOrigin() + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-panel-key': credential, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error', signal: AbortSignal.timeout(timeout),
  });
  return response;
}
async function json(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('ربط البوت مرفوض؛ تحقّق من مفتاح اللوحة');
    throw new Error(String(data.error || `تعذّر الاتصال بالبوت (${response.status})`).slice(0, 300));
  }
  return data;
}
async function connect(key) {
  key = String(key || '').trim();
  if (key.length < 8 || key.length > 512) throw new Error('مفتاح ربط البوت غير صالح');
  // Read-only handshake; do not store an unverified key or touch the bot webhook.
  await json(await call('/api/panel/referrals?limit=1', { key }));
  await redis().set(KEY, seal(key));
  return { configured: true, origin: botOrigin() };
}
async function referrals(limit = 50) {
  const n = Math.min(100, Math.max(1, Math.floor(Number(limit) || 50)));
  const result = await json(await call(`/api/panel/referrals?limit=${n}`));
  return Array.isArray(result.referrals) ? result.referrals.slice(0, n) : [];
}
async function referralConfig() {
  const result = await json(await call('/api/panel/referrals?config=1'));
  return { perJoin: result.perJoin, enabled: result.enabled };
}
async function setReferralConfig(value) {
  const perJoin = Number(value);
  if (!Number.isInteger(perJoin) || perJoin < 0 || perJoin > 1000) throw new Error('نقاط الإحالة يجب أن تكون عدداً من 0 إلى 1000');
  const result = await json(await call('/api/panel/referrals', { body: { perJoin } }));
  return { perJoin: result.perJoin, enabled: result.enabled };
}
async function media() {
  const result = await json(await call('/api/panel/rewards'));
  return {
    contests: (Array.isArray(result.contests) ? result.contests : []).map(c => ({ id: String(c.id), title: String(c.title || ''), hasImage: !!c.imageUrl })),
    rewards: (Array.isArray(result.rewards) ? result.rewards : []).map(r => ({ id: String(r.id), title: String(r.title || ''), hasImage: !!r.image })),
  };
}
function validImage(data) {
  if (data === '') return true;
  if (typeof data !== 'string' || data.length > 1_950_000) return false;
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 1_400_000 || bytes.toString('base64') !== match[2]) return false;
  if (match[1] === 'png') return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (match[1] === 'jpeg') return bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  if (match[1] === 'gif') return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
  return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}
async function uploadImage(kind, id, data) {
  if (!['contest', 'reward'].includes(kind) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(id))) throw new Error('المسابقة أو الجائزة غير صالحة');
  if (!validImage(data)) throw new Error('الصورة غير صالحة أو أكبر من 1.4 ميغا؛ استعمل JPG أو PNG أو WEBP أو GIF');
  return json(await call('/api/admin2', { body: { action: `${kind}_image`, id, dataUrl: data }, timeout: 20000 }));
}
async function photos(ids) {
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(id => /^\d{1,20}$/.test(id)))].slice(0, 20);
  const out = {};
  let index = 0;
  async function worker() {
    while (index < unique.length) {
      const id = unique[index++];
      try {
        const response = await call(`/api/panel/referrals?photo=${id}`, { timeout: 10000 });
        const type = response.headers.get('content-type') || '';
        const length = Number(response.headers.get('content-length') || 0);
        if (!response.ok || !/^image\/(jpeg|png|webp|gif)(?:;|$)/i.test(type) || length > 250_000) continue;
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length && bytes.length <= 250_000) out[id] = `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`;
      } catch { /* missing/private photo: UI displays initials instead */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, worker));
  return out;
}
module.exports = { connected, connect, referrals, referralConfig, setReferralConfig, media, uploadImage, photos, validImage };
