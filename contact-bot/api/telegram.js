// CHINWI بوت تواصل — Telegram webhook (full duplex + لوحة المالك)
// أي زبون يراسل البوت ← توصل للمالك (F_Q_Q_T) + نسخة في قاعدة البيانات
// المالك يرد بالـ Reply على البطاقة ← توصل للزبون
// أو المالك يبعث من لوحة التحكم /admin/contact ← /api/send ← توصل للزبون
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER = process.env.OWNER_CHAT_ID; // chat_id تاع المالك (F_Q_Q_T) — من env فقط
const SETUP_SECRET = process.env.SETUP_SECRET || '';
const BRIDGE_URL = process.env.BRIDGE_URL || 'https://chinwi-store.vercel.app/api/contact/bridge';
const BRIDGE_SECRET = process.env.CONTACT_BRIDGE_SECRET || '';
const POSTER = 'https://chinwi-store.vercel.app/catalog/chinwi-contact-poster.jpg?v=2';
const API = (method, payload) =>
  fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => r.json());

const WELCOME =
  '🌟 مرحبا بيك فـ CHINWI بوت تواصل!\n\n' +
  '💬 تواصل معانا — تواصل مع المالك مباشرة من هنا، وهو يرد عليك بنفسه.\n\n' +
  '✍️ اكتب رسالتك وبعثها الآن 👇';
const HELP =
  '🤖 CHINWI بوت تواصل — المساعدة\n\n' +
  '💬 تواصل معانا: اكتب أي رسالة وتوصل مباشرة لتواصل مع المالك\n' +
  '✅ راهو يرد عليك بنفسه\n\n' +
  '@chinwicontactbot';
const CUSTOMER_OK = '✅ تم إرسال رسالتك إلى المالك — المالك سيرد عليك قريباً 💚';
const OWNER_OK = '✅ وصل ردك للزبون بنجاح';
const OWNER_HINT = '↩️ ردّ على بطاقة رسالة الزبون (Reply) باش يوصله ردك\nأو استخدم لوحة التحكم ← بوت تواصل 💬';
const FALLBACK = '🛠️ وصلتنا رسالتك… عاود حاول بعد لحظات';

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const trunc = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
const sendText = (chat_id, text, extra = {}) =>
  API('sendMessage', { chat_id, text: trunc(String(text), 4096), parse_mode: 'HTML', ...extra });
const sendPoster = (chat_id, caption) =>
  API('sendPhoto', { chat_id, photo: POSTER, caption }).catch(() => sendText(chat_id, caption));
const copyMedia = (chat_id, from_chat_id, message_id) =>
  API('copyMessage', { chat_id, from_chat_id, message_id }).catch(() => {});
const hasMedia = (m) =>
  !!(m.photo || m.document || m.video || m.voice || m.audio || m.sticker || m.animation || m.video_note);
const mediaKind = (m) =>
  ['photo', 'document', 'video', 'voice', 'audio', 'sticker', 'animation', 'video_note'].find((k) => m[k]) || '';
const extractCustomerId = (reply) => {
  if (!reply) return null;
  const t = [reply.text, reply.caption].filter(Boolean).join('\n');
  const code = t.match(/🆔\s*<code>(\d{5,15})<\/code>/);
  if (code) return code[1];
  const line = t.match(/🆔[^\d]*(\d{5,15})/);
  if (line) return line[1];
  return null;
};

// نسخة من كل رسالة + تظهر للمالك
const notifyOwner = async (customer, msg, text) => {
  if (!OWNER) return;
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() || 'زبون';
  const username = customer.username ? `@${esc(customer.username)}` : '—';
  const card =
    `📩 <b>رسالة جديدة — CHINWI تواصل</b>\n\n` +
    `👤 <b>${esc(name)}</b> (${username})\n` +
    `🆔 <code>${customer.id}</code>\n\n` +
    (text ? esc(trunc(text, 3500)) : '<i>📎 ميديا</i>');
  await sendText(OWNER, card);
  if (hasMedia(msg)) await copyMedia(OWNER, customer.id, msg.message_id);
};

// تسجيل الرسالة في قاعدة البيانات (لا يكسر التدفق إذا فشل)
const logMessage = (entry) => {
  if (!BRIDGE_SECRET) return Promise.resolve();
  return fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bridge-secret': BRIDGE_SECRET },
    body: JSON.stringify({ action: 'log', ...entry }),
    signal: AbortSignal.timeout(8000),
  }).catch((e) => console.error('bridge log failed', e && e.message ? e.message : e));
};

module.exports = async (req, res) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.status(200).json({ ok: true, service: 'chinwi-contact-webhook' });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (SETUP_SECRET && secret !== SETUP_SECRET) return res.status(401).json({ ok: false, error: 'bad secret' });

  try {
    const update = req.body || {};
    const msg = update.message || update.edited_message;
    if (!msg) return res.status(200).json({ ok: true });
    const from = msg.from || {};
    const chatId = msg.chat && msg.chat.id;
    const text = (msg.text || msg.caption || '').trim();
    const media = mediaKind(msg);

    // ── المالك (F_Q_Q_T) ──────────────────────────────────────────────
    if (OWNER && String(from.id) === String(OWNER)) {
      if (text === '/start') {
        await sendText(chatId, '👑 مرحبا سيدي المالك — أي رسالة زبون توصل هنا، ردّ عليها بالـ Reply وهي توصلو.\nأو لوحة التحكم ← بوت تواصل 💬');
        return res.status(200).json({ ok: true });
      }
      const target = extractCustomerId(msg.reply_to_message);
      if (!target) {
        await sendText(chatId, OWNER_HINT);
        return res.status(200).json({ ok: true });
      }
      const name = [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || 'المالك';
      let delivered = true;
      if (text) {
        const r = await sendText(target, `💬 المالك — CHINWI\n\n${esc(trunc(text, 3900))}`);
        if (!r || r.ok === false) { delivered = false; }
      }
      if (hasMedia(msg)) await copyMedia(target, chatId, msg.message_id);
      if (!text && !hasMedia(msg)) await sendText(target, '💬 المالك — CHINWI');
      if (delivered) {
        await sendText(chatId, OWNER_OK);
        await logMessage({ tg_id: Number(target), dir: 'out', name, username: from.username || null, text, media });
      } else {
        await sendText(chatId, '⚠️ تعذر التوصيل — الشخص قد يكون حظر البوت أو لم يبدأه بعد');
      }
      return res.status(200).json({ ok: true });
    }

    // ── الزبون ─────────────────────────────────────────────────────────
    if (text === '/start' || text.startsWith('/start')) {
      if (!OWNER) { await sendText(chatId, FALLBACK); return res.status(200).json({ ok: true }); }
      await sendPoster(chatId, WELCOME);
      return res.status(200).json({ ok: true });
    }
    if (text === '/help') {
      await sendText(chatId, HELP);
      return res.status(200).json({ ok: true });
    }
    if (!OWNER) {
      await sendText(chatId, FALLBACK);
      return res.status(200).json({ ok: true });
    }
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || 'زبون';
    const username = from.username || null;
    await logMessage({ tg_id: Number(chatId), dir: 'in', name, username, text, media });
    await notifyOwner(from, msg, text);
    await sendText(chatId, CUSTOMER_OK);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('telegram webhook error', err);
    return res.status(200).json({ ok: true }); // نرد 200 باش تيليجرام ما يعاودش يبعث
  }
};
