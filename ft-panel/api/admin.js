const crypto = require('node:crypto');
const ops = require('../lib/ops');
const { redis } = require('../lib/db');
const { runAI } = require('../lib/ai');
const auth = require('../lib/auth');
const rate = require('../lib/rate');
const bot = require('../lib/botBridge');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runAIOnce(b, token) {
  // Repeated HTTP requests reuse the same ID; a running/uncertain operation is never replayed.
  const id = String(b.requestId || crypto.randomUUID());
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(id)) throw new Error('معرّف الطلب غير صالح');
  const key = 'ft-panel:ai:' + crypto.createHash('sha256').update(token + ':' + id).digest('hex');
  const claimed = await redis().set(key, 'running', 'EX', 86400, 'NX');
  if (!claimed) {
    const saved = await redis().get(key);
    if (saved && saved !== 'running') {
      const value = JSON.parse(saved);
      if (value.error) throw new Error(value.error);
      return value.data;
    }
    const e = new Error('الطلب قيد التنفيذ أو نتيجته غير مؤكدة؛ راجع النتائج قبل إعادة الطلب');
    e.status = 409;
    throw e;
  }
  try {
    const data = await runAI(b.prompt, b.history);
    await redis().set(key, JSON.stringify({ data }), 'EX', 86400);
    return data;
  } catch (e) {
    // Keep the request claimed even if the result is uncertain; retrying must not duplicate writes.
    const message = String(e.message || 'تعذّر إتمام الطلب').slice(0, 300);
    await redis().set(key, JSON.stringify({ error: message }), 'EX', 86400).catch(() => {});
    throw new Error(message);
  }
}

async function handle(b, token) {
  switch (b.action) {
    case 'stats': return { data: await ops.stats() };
    case 'top': return { data: await ops.topUsers(b.by, b.limit) };
    case 'health': return { data: await ops.health(!!b.light) };
    case 'prizes': return { data: await ops.listPrizes() };
    case 'save_prize': return { data: await ops.savePrize(b.prize || {}) };
    case 'delete_prize': return { data: await ops.deletePrize(b.ref) };
    case 'set_available': return { data: await ops.setAvailable(b.ref, !!b.available) };
    case 'requests': return { data: await ops.listRequests(b.status || '') };
    case 'set_request': return { data: await ops.setRequest(b.id, b.status, !!b.refund) };
    case 'find_user': return { data: await ops.userInfo(b.user) };
    case 'add_points': return { data: await ops.addPoints(b.user, b.points) };
    case 'ban': return { data: await ops.setBan(b.user, !!b.banned) };
    case 'send': return { data: await ops.sendTo(b.user, b.text) };
    case 'broadcast': return { data: await ops.broadcast(b.text) };
    case 'settings_get': return { data: await ops.getSettings() };
    case 'settings_set': return { data: await ops.updateSettings(b) };
    case 'channels_get': return { data: await ops.getChannels() };
    case 'channels_set': return { data: await ops.setChannels(b.channels || []) };
    case 'password_set': return { token: await auth.changePassword(b.oldPassword, b.newPassword) };
    case 'bot_connection': return { data: await bot.connected() };
    case 'bot_connect': return { data: await bot.connect(b.key) };
    case 'referrals': return { data: await bot.referrals(b.limit) };
    case 'referral_config': return { data: await bot.referralConfig() };
    case 'referral_config_set': return { data: await bot.setReferralConfig(b.perJoin) };
    case 'referral_photos': return { data: await bot.photos(b.ids) };
    case 'bot_media': return { data: await bot.media() };
    case 'bot_image': return { data: await bot.uploadImage(b.kind, b.id, b.dataUrl) };
    case 'ai': return { data: await runAIOnce(b, token) };
    default: throw new Error('أمر غير معروف');
  }
}
module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  try {
    const allowance = await rate.allow(req, b.action === 'login');
    if (!allowance.allowed) {
      res.setHeader('retry-after', String(allowance.retryAfter));
      return res.status(429).json({ ok: false, error: 'طلبات كثيرة؛ حاول بعد قليل' });
    }
    if (b.action === 'login') {
      const token = await auth.login(b.password);
      if (token) return res.status(200).json({ ok: true, token });
      await sleep(700);
      return res.status(401).json({ ok: false, error: 'كلمة السر غلط' });
    }
    const token = String(req.headers['x-token'] || '');
    if (!(await auth.authorize(token))) return res.status(401).json({ ok: false, error: 'غير مصرّح' });
    const out = await handle(b, token);
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return res.status(e.status || 400).json({ ok: false, error: String(e.message || 'تعذّر تنفيذ الطلب').slice(0, 300) });
  }
};
