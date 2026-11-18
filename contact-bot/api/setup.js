const call = async (method, payload) => {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
};

module.exports = async (req, res) => {
  const { secret, action, url } = req.query || {};
  if (secret !== process.env.SETUP_SECRET) return res.status(401).json({ ok: false, error: 'bad secret' });
  if (action === 'set') {
    if (!url) return res.status(400).json({ ok: false, error: 'missing url' });
    const out = await call('setWebhook', {
      url,
      secret_token: process.env.SETUP_SECRET,
      drop_pending_updates: false,
      allowed_updates: ['message', 'edited_message'],
    });
    const info = await call('getWebhookInfo', {});
    return res.status(200).json({ action: 'set', out, info });
  }
  if (action === 'delete') {
    const out = await call('deleteWebhook', { drop_pending_updates: false });
    const info = await call('getWebhookInfo', {});
    return res.status(200).json({ action: 'delete', out, info });
  }
  const info = await call('getWebhookInfo', {});
  return res.status(200).json({ action: 'info', info });
};
