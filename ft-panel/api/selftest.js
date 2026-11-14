const crypto = require('node:crypto');
const bot = require('../lib/botBridge');
const { runAI } = require('../lib/ai');
const { allow } = require('../lib/rate');

/**
 * فحص تشغيل اللوحة عبر رابط آمن (?k=SCAN_KEY).
 * كل القراءات من FT-bot الحيّ (هدف الربط)، وليست من بيانات اللوحة القديمة.
 */
module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const key = String(process.env.SCAN_KEY || '');
  const supplied = String(req.query?.k || '');
  const a = crypto.createHash('sha256').update(key).digest();
  const b = crypto.createHash('sha256').update(supplied).digest();
  if (!key || !crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: 'no' });
  try {
    const allowance = await allow(req, false);
    if (!allowance.allowed) {
      res.setHeader('retry-after', String(allowance.retryAfter));
      return res.status(429).json({ error: 'طلبات كثيرة' });
    }
    const out = {};
    out.health = await bot.health();
    const overview = await bot.manageView('overview');
    out.bot = { stats: overview.stats, points: overview.points, storage: overview.storage };
    out.catalog = await bot.manageView('catalog');
    out.catalog = { rewards: (out.catalog.rewards || []).length, contests: (out.catalog.contests || []).length };
    out.ai_read = await runAI('كم عدد المستخدمين عندي وكم جائزة؟');
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || 'error').slice(0, 300) });
  }
};
