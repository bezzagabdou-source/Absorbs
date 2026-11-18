module.exports = async (req, res) => {
  const { secret } = req.query || {};
  if (secret !== process.env.SETUP_SECRET) return res.status(401).json({ ok: false, error: 'bad secret' });
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timeout: 0 }),
  });
  const data = await r.json();
  const updates = (data.result || []).map((u) => {
    const m = u.message || u.edited_message || {};
    return { update_id: u.update_id, from: m.from || null, chat: m.chat || null, text: m.text || m.caption || '' };
  });
  res.status(200).json({ ok: data.ok, count: updates.length, updates });
};
