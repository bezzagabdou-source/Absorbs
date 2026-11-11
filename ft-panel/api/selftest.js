const crypto = require('node:crypto');
const ops = require('../lib/ops');
const { runAI } = require('../lib/ai');
const { allow } = require('../lib/rate');
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
    out.stats = await ops.stats();
    out.prizes = (await ops.listPrizes()).map(p => p.title + ' / ' + p.cost);
    out.health = await ops.health(false);
    out.ai_read = await runAI('كم عدد المستخدمين عندي وكم جائزة؟');
    if (req.query.write === '1') {
      out.before = (await ops.listPrizes()).length;
      out.ai_add = await runAI('أضف جائزة اسمها اختبار-AI سعرها 1 نقطة');
      out.ai_del = await runAI('احذف جائزة اختبار-AI');
      out.after = (await ops.listPrizes()).length;
    }
    return res.status(200).json(out);
  } catch (e) { return res.status(500).json({ error: String(e && e.message || 'error').slice(0, 300) }); }
};
