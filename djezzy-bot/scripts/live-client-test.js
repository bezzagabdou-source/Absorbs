#!/usr/bin/env node
/**
 * اختبار الوضع المباشر (Live) ضد سيرفر وهمي يحاكي واجهة جيزي عبر HTTP حقيقي.
 * يتحقق من: الترويسات، Bearer، تجديد الجلسة عند 401، وتحويل الأخطاء.
 *
 *   node scripts/live-client-test.js
 */
process.env.SESSION_ENCRYPTION_KEY = 'test-key-0123456789abcdef0123456789abcdef';
process.env.ACTION_COOLDOWN_MS = '0';
process.env.MAX_CLAIMS_PER_DAY = '100';

const assert = (await import('node:assert/strict')).default;
const http = await import('node:http');
const { DjezzyClient } = await import('../src/djezzy/client.js');
const { DjezzyEngine } = await import('../src/djezzy/engine.js');
const { ERROR_CODES } = await import('../src/djezzy/errors.js');
const store = (await import('../src/store/index.js')).default;

/* ------------------------- سيرفر وهمي لواجهة جيزي ------------------------- */
const seenHeaders = [];
const calls = [];
let validToken = 'live_token_1';
let claimCount = 0;

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const body = await readBody(req);
  calls.push({ method: req.method, url: req.url });
  seenHeaders.push(req.headers);

  const send = (status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  const auth = req.headers.authorization || '';

  if (req.url === '/api/request-otp' && req.method === 'POST') {
    assert.equal(body.msisdn, '213551234567');
    return send(200, { sessionId: 'live-session-1', expiresIn: 120, masked: '055 *** ** 67' });
  }

  if (req.url === '/api/verify-otp' && req.method === 'POST') {
    if (body.otp !== '123456') return send(401, { message: 'OTP invalide' });
    return send(200, { accessToken: validToken, refreshToken: 'refresh_abc', expiresIn: 3600 });
  }

  if (req.url === '/api/refresh-token' && req.method === 'POST') {
    validToken = 'live_token_2';
    return send(200, { accessToken: validToken, refreshToken: 'refresh_xyz', expiresIn: 3600 });
  }

  if (req.url === '/api/offers' && req.method === 'GET') {
    if (auth !== `Bearer ${validToken}`) return send(401, { message: 'Token expired' });
    return send(200, { data: { offers: [{ offerId: 'OFF6', name: '6 Go Internet', claimable: true }] } });
  }

  if (req.url === '/api/offers/OFF6/claim' && req.method === 'POST') {
    if (auth !== `Bearer ${validToken}`) return send(401, { message: 'Token expired' });
    claimCount += 1;
    return send(200, claimCount === 1 ? { status: 'ACTIVATED' } : { status: 'ALREADY_ACTIVE' });
  }

  if (req.url === '/api/gifts' && req.method === 'GET') {
    if (auth !== `Bearer ${validToken}`) return send(401, { message: 'Token expired' });
    return send(200, { gifts: [{ giftId: 'G2W', name: '2 Go Hebdomadaire', claimable: true }] });
  }

  if (req.url === '/api/gifts/G2W/claim' && req.method === 'POST') {
    if (auth !== `Bearer ${validToken}`) return send(401, { message: 'Token expired' });
    return send(200, { status: 'CLAIMED' });
  }

  if (req.url === '/api/me' && req.method === 'GET') {
    if (auth !== `Bearer ${validToken}`) return send(401, { message: 'Token expired' });
    return send(200, { plan: 'Prépayé', balance: '120 DZD' });
  }

  return send(404, { message: 'not found' });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

const client = new DjezzyClient({ baseUrl, dryRun: false, timeoutMs: 5000 });
const engine = new DjezzyEngine({ client, store });

const TG_ID = 888000111;
const MSISDN = '213551234567';
const steps = [];
const step = async (name, fn) => {
  try {
    await fn();
    steps.push({ name, ok: true });
    console.log(`✅ ${name}`);
  } catch (error) {
    steps.push({ name, ok: false });
    console.error(`❌ ${name}\n   ${error.message}`);
  }
};

await step('العميل يعمل في الوضع المباشر', () => assert.equal(client.mode, 'live'));

await step('طلب OTP يرسل الترويسات الصحيحة', async () => {
  const started = await engine.startLogin(TG_ID, MSISDN);
  assert.equal(started.sessionId, 'live-session-1');
  const headers = seenHeaders.at(-1);
  assert.match(headers['user-agent'], /Djezzy/);
  assert.match(headers['content-type'], /application\/json/);
  assert.match(headers.accept, /application\/json/);
  assert.ok(headers['x-request-id'], 'يجب إرسال X-Request-Id');
});

await step('رمز خاطئ يُحوَّل إلى OTP_INVALID', async () => {
  const user = await store.getUser(TG_ID);
  await assert.rejects(
    () => engine.confirmLogin(TG_ID, MSISDN, '999999', user.state.temp.sessionId),
    (error) => error.code === ERROR_CODES.OTP_INVALID,
  );
});

await step('رمز صحيح يحفظ التوكن مشفّراً', async () => {
  const user = await store.getUser(TG_ID);
  const result = await engine.confirmLogin(TG_ID, MSISDN, '123456', user.state.temp.sessionId);
  assert.ok(result.account.hasRefresh);
  const saved = await store.getUser(TG_ID);
  assert.ok(!JSON.stringify(saved).includes('live_token_1'), 'لا يجوز ظهور التوكن صريحاً');
});

await step('قراءة العروض مع Bearer Token', async () => {
  const overview = await engine.getOverview(TG_ID, MSISDN);
  assert.equal(overview.sixGbOffer.id, 'OFF6');
  assert.equal(overview.profile.balance, '120 DZD');
  const offersCall = calls.find((call) => call.url === '/api/offers');
  assert.ok(offersCall, 'يجب استدعاء /offers');
  assert.ok(seenHeaders.some((h) => h.authorization === 'Bearer live_token_1'));
});

await step('تفعيل 6 جيغا مباشر + رفض التكرار', async () => {
  const result = await engine.activateSixGb(TG_ID, MSISDN);
  assert.equal(result.status, 'activated');
  await assert.rejects(
    () => engine.activateSixGb(TG_ID, MSISDN),
    (error) => error.code === ERROR_CODES.OFFER_ALREADY_ACTIVE,
  );
});

await step('استلام هدية 2 جيغا (مطابقة 2 Go Hebdomadaire)', async () => {
  const result = await engine.claimWeeklyGift(TG_ID, MSISDN);
  assert.equal(result.ok, true);
  assert.equal(result.weeklyClaimed, true);
});

await step('توكن منتهٍ/غير صالح يُجدَّد تلقائياً ثم يُعاد الطلب', async () => {
  const user = await store.getUser(TG_ID);
  user.accounts[MSISDN].tokenExpiresAt = Date.now() + 3600_000; // يبدو صالحاً…
  user.accounts[MSISDN].tokenEnc = (await import('../src/crypto.js')).encrypt('expired_token');
  await store.saveUser(user);

  // السيرفر سيرد 401 → المحرّك يجدّد عبر /refresh-token → يعيد الطلب
  const overview = await engine.getOverview(TG_ID, MSISDN);
  assert.equal(overview.sixGbOffer.id, 'OFF6');

  const refreshed = await store.getUser(TG_ID);
  assert.ok(refreshed.accounts[MSISDN].tokenExpiresAt > Date.now());
  assert.ok(calls.some((call) => call.url === '/api/refresh-token'), 'يجب استدعاء /refresh-token');
});

await step('خطأ الشبكة يُحوَّل إلى NETWORK', async () => {
  const deadClient = new DjezzyClient({ baseUrl: 'http://127.0.0.1:1/api', dryRun: false, timeoutMs: 1500 });
  await assert.rejects(
    () => deadClient.requestOtp({ msisdn: MSISDN }),
    (error) => [ERROR_CODES.NETWORK, ERROR_CODES.TIMEOUT].includes(error.code),
  );
});

server.close();
await new Promise((resolve) => setTimeout(resolve, 100));

const failed = steps.filter((item) => !item.ok);
console.log(`\n${'-'.repeat(52)}`);
console.log(`النتيجة: ${steps.length - failed.length}/${steps.length} ناجح`);
if (failed.length) {
  console.error('خطوات فاشلة:', failed.map((item) => item.name).join(' | '));
  process.exit(1);
}
console.log('✅ العميل المباشر (axios) يعمل كما هو متوقع.');
process.exit(0);
