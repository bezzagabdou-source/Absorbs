/**
 * خادم وسيط (Relay) لبوت جيزي — يشغّله أنت على جهاز داخل الجزائر
 * (كمبيوتر، Raspberry Pi، أو هاتف عبر Termux) ليصل البوت على Vercel
 * إلى apim.djezzy.dz من خلال شبكة جزائرية موثوقة.
 *
 * التشغيل:
 *   cd djezzy-bot/relay
 *   npm install
 *   RELAY_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))") npm start
 *
 * ثم على Vercel:
 *   DJEZZY_RELAY_URL=https://YOUR-RELAY-DOMAIN   (أو http://IP:8787)
 *   DJEZZY_RELAY_TOKEN=نفس الرمز
 *
 * الويبهوك نفسه يبقى على Vercel — هذا الخادم يمرّر طلبات جيزي فقط.
 */
import express from 'express';

const app = express();
const TOKEN = process.env.RELAY_TOKEN || '';
const PORT = Number(process.env.PORT || 8787);
const ALLOWED_HOSTS = (process.env.RELAY_ALLOW_HOSTS || 'apim.djezzy.dz').split(',').map((h) => h.trim()).filter(Boolean);
const MAX_BODY = '256kb';

if (!TOKEN) {
  console.error('⚠️  ضع RELAY_TOKEN قبل التشغيل (مثال: randomBytes(24).toString("base64url"))');
  process.exit(1);
}

app.use(express.json({ limit: MAX_BODY }));

const auth = (req, res, next) => {
  if (req.headers['x-relay-token'] !== TOKEN) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
};

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'djezzy-relay', allowed: ALLOWED_HOSTS, ts: Date.now() });
});

app.post('/', auth, async (req, res) => {
  const { method = 'POST', url, headers = {}, body } = req.body || {};

  let target;
  try {
    target = new URL(String(url));
  } catch {
    res.status(400).json({ error: 'bad url' });
    return;
  }

  if (!ALLOWED_HOSTS.includes(target.hostname)) {
    res.status(403).json({ error: `host not allowed: ${target.hostname}` });
    return;
  }

  const outboundHeaders = {};
  for (const [key, value] of Object.entries(headers || {})) {
    // نمرّر الترويسات كما هي (Authorization, User-Agent, Content-Type…)
    if (typeof value === 'string') outboundHeaders[key] = value;
  }

  try {
    const response = await fetch(target, {
      method: String(method || 'POST').toUpperCase(),
      headers: outboundHeaders,
      body: body == null ? undefined : String(body),
      signal: AbortSignal.timeout(25000),
    });
    const text = await response.text();
    res.status(200).json({ status: response.status, body: text });
  } catch (error) {
    res.status(502).json({ error: String(error?.message || error) });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'not found' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🟢 djezzy-relay يعمل على المنفذ ${PORT} — يسمح بـ: ${ALLOWED_HOSTS.join(', ')}`);
  console.log(`   استخدمه على Vercel عبر DJEZZY_RELAY_URL=http://<عنوانك>:${PORT}`);
});
