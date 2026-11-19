module.exports = async (req, res) => {
  const { secret, to } = req.query || {};
  if (secret !== process.env.SETUP_SECRET) return res.status(401).json({ ok: false, error: 'bad secret' });
  const chat = to || process.env.OWNER_CHAT_ID;
  if (!chat) return res.status(400).json({ ok: false, error: 'missing OWNER_CHAT_ID and no to=' });
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: '🧪 رسالة اختبار من بوت CHINWI تواصل — يمكن تجاهلها' }),
  });
  const data = await r.json();
  res.status(200).json(data);
};
