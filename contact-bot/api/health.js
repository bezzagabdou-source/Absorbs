module.exports = (req, res) => {
  const secret = (req.query && req.query.secret) || '';
  if (secret !== process.env.SETUP_SECRET) return res.status(401).json({ ok: false, error: 'bad secret' });
  res.status(200).json({
    ok: true,
    service: 'chinwi-contact',
    owner_configured: !!process.env.OWNER_CHAT_ID,
    time: new Date().toISOString(),
  });
};
