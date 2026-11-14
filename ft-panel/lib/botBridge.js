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
async function json(response, path = '') {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('ربط البوت مرفوض؛ تحقّق من مفتاح اللوحة (PANEL_PUBLIC_KEY)');
    // 404 على مسارات /api/panel يعني نسخة بوت قديمة منشورة بلا واجهة اللوحة.
    if (response.status === 404 && (!path || path.startsWith('/api/panel'))) {
      const e = new Error(`البوت المنشور على ${botOrigin()} نسخة قديمة: لا يحتوي واجهة اللوحة (${path || '/api/panel'} → 404). انشر ft-contest-bot من نفس الفرع ثم أعد المحاولة.`);
      e.code = 'BOT_OUTDATED';
      throw e;
    }
    throw new Error(String(data.error || `تعذّر الاتصال بالبوت (${response.status})`).slice(0, 300));
  }
  return data;
}

/** فحص صحة الربط: هوية البوت + المسارات المدعومة (قراءة فقط). */
async function health(key) {
  const result = await json(await call('/api/panel/health', { key, timeout: 12000 }), '/api/panel/health');
  return {
    ok: true,
    origin: botOrigin(),
    commit: String(result.commit || ''),
    storage: result.storage || null,
    telegram: result.telegram || null,
    users: Number(result.users) || 0,
    capabilities: Array.isArray(result.capabilities) ? result.capabilities : [],
  };
}
async function connect(key) {
  key = String(key || '').trim();
  if (key.length < 8 || key.length > 512) throw new Error('مفتاح ربط البوت غير صالح');
  // Read-only handshake; do not store an unverified key or touch the bot webhook.
  let probe;
  try {
    probe = await json(await call('/api/panel/health', { key, timeout: 12000 }), '/api/panel/health');
  } catch (error) {
    if (error.code !== 'BOT_OUTDATED') throw error;
    // بوت قديم بلا /health: نتحقق بالمفتاح عبر مسار كان موجوداً دائماً.
    await json(await call('/api/panel/referrals?limit=1', { key }), '/api/panel/referrals');
    probe = null;
  }
  await redis().set(KEY, seal(key));
  return {
    configured: true,
    origin: botOrigin(),
    version: probe ? String(probe.commit || '') : '',
    capabilities: probe && Array.isArray(probe.capabilities) ? probe.capabilities : [],
    outdated: !probe || !(probe.capabilities || []).includes('manage'),
  };
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
  const result = await json(await call('/api/panel/manage?view=catalog'));
  return {
    contests: (Array.isArray(result.contests) ? result.contests : []).map(c => ({ id: String(c.id), title: String(c.title || ''), hasImage: !!c.hasImage })),
    rewards: (Array.isArray(result.rewards) ? result.rewards : []).map(r => ({ id: String(r.id), title: String(r.title || ''), hasImage: !!r.hasImage })),
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
async function uploadImage(kind, id, data, { timeout = 20000 } = {}) {
  if (!['contest', 'reward'].includes(kind) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(id))) throw new Error('المسابقة أو الجائزة غير صالحة');
  if (!validImage(data)) throw new Error('الصورة غير صالحة أو أكبر من 1.4 ميغا؛ استعمل JPG أو PNG أو WEBP أو GIF');
  return json(await call('/api/admin2', { body: { action: `${kind}_image`, id, dataUrl: data }, timeout }));
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
// The new management route has a fixed allowlist; never proxy arbitrary URLs or the bot's unrestricted AI endpoint.
const VIEWS = new Set(['catalog', 'overview', 'stats', 'requests', 'log', 'users', 'user', 'leaderboard', 'broadcast']);
const OPERATIONS = new Set(['reward_save', 'reward_delete', 'contest_save', 'contest_delete', 'user_points', 'user_ban', 'request_decide', 'points_config', 'settings_save', 'set_group', 'send_message', 'broadcast', 'broadcast_start', 'broadcast_step', 'broadcast_retry']);
async function manageView(view, id, { timeout = 15000 } = {}) {
  if (!VIEWS.has(view)) throw new Error('عرض البوت غير مسموح');
  if ((['user', 'leaderboard'].includes(view) || (view === 'broadcast' && id)) && !/^[A-Za-z0-9_-]{1,100}$/.test(String(id || ''))) throw new Error('المعرّف غير صالح');
  const query = new URLSearchParams({ view });
  if (id) query.set('id', String(id));
  return json(await call(`/api/panel/manage?${query}`, { timeout }));
}
async function manageOp(op, input = {}) {
  if (!OPERATIONS.has(op) || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('عملية البوت غير مسموحة');
  return json(await call('/api/panel/manage', { body: { ...input, op }, timeout: ['broadcast', 'broadcast_start', 'broadcast_step', 'broadcast_retry'].includes(op) ? 45000 : 20000 }));
}
async function analyzeImage(image, prompt) {
  if (!image || !validImage(image)) throw new Error('الصورة غير صالحة أو أكبر من 1.4 ميغا');
  const result = await json(await call('/api/panel/vision', { body: { image, prompt: String(prompt || '').slice(0, 3000) }, timeout: 24000 }));
  if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('مزوّد الصور لم يرجع وصفاً');
  return { text: result.text.slice(0, 5000), provider: String(result.provider || '') };
}
// Text-only fallback via the bot's existing Gemini/OpenRouter keys. The bot has
// a fixed provider allowlist and cannot execute tools on the panel's behalf.
async function chatCompletion(messages, tools, { timeout = 15000 } = {}) {
  const result = await json(await call('/api/panel/chat', { body: { messages, tools }, timeout }));
  const message = result.message;
  if (!message || typeof message !== 'object' || (!String(message.content || '').trim() && !message.tool_calls?.length)) throw new Error('المساعد لم يرجع رداً');
  return message;
}
// Fixed authenticated endpoint; the model cannot choose a URL or retrieve the key.
async function agent(op, input = {}, { timeout = 20000 } = {}) {
  if (!['db_query', 'db_update', 'db_undo', 'get_bot_info', 'set_commands', 'set_webhook', 'delete_webhook'].includes(op) || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('عملية الوكيل غير مسموحة');
  return json(await call('/api/panel/agent', { body: { ...input, op }, timeout }));
}
/** 🔁 ترحيل بيانات اللوحة القديمة إلى قاعدة بيانات البوت (معاينة افتراضياً). */
async function migrate(snapshot, options, { dryRun = true, confirm = false } = {}) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('لا توجد بيانات لترحيلها');
  const payload = { snapshot, options: options || {}, dryRun };
  if (!dryRun) {
    if (confirm !== true) throw new Error('تأكيد الترحيل مطلوب');
    payload.confirm = true;
  }
  const result = await json(await call('/api/panel/migrate', { body: payload, timeout: 55000 }), '/api/panel/migrate');
  return result.report;
}

function webhookUrl() { return botOrigin() + '/api/telegram/webhook'; }
module.exports = { connected, connect, health, migrate, referrals, referralConfig, setReferralConfig, media, uploadImage, photos, validImage, manageView, manageOp, analyzeImage, chatCompletion, agent, webhookUrl };
