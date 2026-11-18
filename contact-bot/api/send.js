// CHINWI بوت تواصل — /api/send
// يستقبل من لوحة التحكم (chinwi-store) المالك يختار شخص ويوصله رسالة من البوت
// الحماية: سر مشترك (x-bridge-secret) بين chinwi-store و chinwi-contact — لا جلسة عامة
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.CONTACT_BRIDGE_SECRET || '';
const BRIDGE_URL = process.env.BRIDGE_URL || 'https://chinwi-store.vercel.app/api/contact/bridge';

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const trunc = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const secret = req.headers['x-bridge-secret'] || '';
  if (!SECRET || secret !== SECRET) return res.status(401).json({ ok: false, error: 'bad secret' });

  const body = req.body || {};
  const tgId = Number(body.tg_id);
  const text = String(body.text ?? '').trim();
  if (!Number.isFinite(tgId) || tgId <= 0) {
    return res.status(400).json({ ok: false, error: 'tg_id غير صالح' });
  }
  if (!text) return res.status(400).json({ ok: false, error: 'النص فارغ' });

  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: tgId,
        text: `💬 المالك — CHINWI\n\n${esc(trunc(text, 3900))}`,
        parse_mode: 'HTML',
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json();
    if (!data.ok) {
      // 403: لم يبدأ البوت أو حظر البوت — نرجع السبب واضح للوحة التحكم
      return res.status(200).json({ ok: false, description: data.description || 'telegram error' });
    }
    // سجّل النسخة الصادرة (لا يكسر الرد إذا فشل)
    await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bridge-secret': SECRET },
      body: JSON.stringify({ action: 'log', tg_id: tgId, dir: 'out', name: 'المالك', username: null, text, media: '' }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => {});
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send.js error', err);
    return res.status(500).json({ ok: false, description: 'تعذر الاتصال بتيليجرام' });
  }
};
