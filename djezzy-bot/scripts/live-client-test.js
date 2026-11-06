#!/usr/bin/env node
/**
 * اختبار الوضع المباشر ضد سيرفر وهمي يقلّد واجهة جيزي الحقيقية (HTTP فعلي).
 * يتحقق من: شكل الطلبات (query/form/JSON)، Bearer، تفسير 402 و900901، والسجل.
 *
 *   node scripts/live-client-test.js
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

process.env.STORE_FILE = join(tmpdir(), `djezzy-live-${process.pid}.json`);
process.env.SESSION_ENCRYPTION_KEY = 'test-key-0123456789abcdef0123456789abcdef';
process.env.DJEZZY_CLIENT_ID = 'test-client-id';
process.env.DJEZZY_CLIENT_SECRET = 'test-client-secret';
process.env.DJEZZY_DRY_RUN = 'false';
process.env.ACTION_COOLDOWN_MS = '0';
process.env.MAX_CLAIMS_PER_DAY = '100';

const assert = (await import('node:assert/strict')).default;
const http = await import('node:http');
const { DjezzyClient } = await import('../src/djezzy/client.js');
const { DjezzyEngine } = await import('../src/djezzy/engine.js');
const { ERROR_CODES } = await import('../src/djezzy/errors.js');
const store = (await import('../src/store/index.js')).default;

/* --------------------- سيرفر وهمي لواجهة جيزي --------------------- */
const calls = [];
let validToken = 'live_token_1';
let weeklyClaimed = 0;
let historyItems = [];
let ineligible = false;
let expireNextRewardCall = false;

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const raw = await readBody(req);
  const url = new URL(req.url, 'http://localhost');
  calls.push({ method: req.method, path: url.pathname, query: url.search, body: raw });

  const send = (status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  };

  const auth = req.headers.authorization || '';
  const okAuth = auth === `Bearer ${validToken}`;

  /* 1) إرسال الرمز */
  if (url.pathname === '/mobile-api/oauth2/registration' && req.method === 'POST') {
    assert.equal(url.searchParams.get('scope'), 'smsotp');
    assert.equal(url.searchParams.get('client_id'), 'test-client-id');
    assert.match(url.searchParams.get('msisdn'), /^2137\d{8}$/);
    const body = JSON.parse(raw);
    assert.equal(body['is-consent'], true);
    assert.ok(Array.isArray(body['consent-agreement']));
    assert.match(req.headers['user-agent'], /MobileApp/);
    return send(200, { message: 'confirmation code has been sent successfully' });
  }

  /* 2) التحقق واستخراج التوكن */
  if (url.pathname === '/oauth2/token' && req.method === 'POST') {
    const form = new URLSearchParams(raw);
    if (form.get('grant_type') === 'mobile') {
      assert.equal(form.get('scope'), 'djezzyAppV2');
      assert.equal(form.get('client_secret'), 'test-client-secret');
      assert.equal(form.get('mobileNumber'), '213770123456');
      if (form.get('otp') !== '123456') {
        return send(400, { error: 'invalid_grant', error_description: 'Invalid otp' });
      }
      return send(200, { access_token: validToken, refresh_token: 'refresh_abc', expires_in: 3600 });
    }
    if (form.get('grant_type') === 'refresh_token') {
      validToken = 'live_token_2';
      return send(200, { access_token: validToken, refresh_token: 'refresh_xyz', expires_in: 3600 });
    }
    return send(400, { error: 'unsupported_grant_type' });
  }

  /* 3) سجل الاشتراكات */
  if (url.pathname.startsWith('/mobile-api/api/v1/subscribers/subscription-history/')) {
    if (!okAuth) return send(401, { fault: { code: 900901, message: 'Invalid Credentials' } });
    return send(200, { status: 200, data: historyItems });
  }

  /* 4) هدية 2 جيجا الأسبوعية */
  if (url.pathname.includes('/services/walk/activate-reward/')) {
    if (expireNextRewardCall) {
      expireNextRewardCall = false;
      return send(401, { fault: { code: 900901, message: 'Invalid Credentials' } });
    }
    if (!okAuth) return send(401, { fault: { code: 900901, message: 'Invalid Credentials' } });
    const body = JSON.parse(raw);
    assert.equal(body.packageCode, 'GIFTWALKWIN2GO');
    if (ineligible) {
      return send(402, { status: 402, message: { en: 'You must subscribe to a plan' } });
    }
    weeklyClaimed += 1;
    historyItems = [
      { packageCode: 'GIFTWALKWIN2GO', subscriptionDateTime: new Date().toISOString() },
      ...historyItems,
    ];
    return send(200, { status: 200, message: { en: 'Your request has been processed successfully' } });
  }

  /* 5) الهدية الترويجية */
  if (url.pathname.includes('/services/scan/activate-reward/')) {
    if (!okAuth) return send(401, { fault: { code: 900901 } });
    const body = JSON.parse(raw);
    assert.ok(body.qrCode, 'qrCode مطلوب');
    return send(200, { status: 200, message: { en: 'successfully done' } });
  }

  /* 6) باقة مدفوعة */
  if (url.pathname.includes('/subscribers/activate-product/')) {
    if (!okAuth) return send(401, { fault: { code: 900901 } });
    return send(200, { status: 200, message: { en: 'successfully done' } });
  }

  return send(404, { message: 'not found' });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const client = new DjezzyClient({ baseUrl, dryRun: false, timeoutMs: 5000 });
const engine = new DjezzyEngine({ client, store });

const TG_ID = 888000111;
const MSISDN = '213770123456';
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

await step('طلب OTP حقيقي (query + JSON body + User-Agent)', async () => {
  const started = await engine.startLogin(TG_ID, MSISDN);
  assert.equal(started.ok, true);
  assert.equal(started.sessionId, `otp:${MSISDN}`);
  const reg = calls.find((call) => call.path === '/mobile-api/oauth2/registration');
  assert.ok(reg, 'يجب استدعاء مسار registration');
});

await step('رمز خاطئ → OTP_INVALID', async () => {
  await assert.rejects(
    () => engine.confirmLogin(TG_ID, MSISDN, '999999'),
    (error) => error.code === ERROR_CODES.OTP_INVALID,
  );
});

await step('رمز صحيح → توكن حقيقي محفوظ مشفّراً', async () => {
  const result = await engine.confirmLogin(TG_ID, MSISDN, '123456');
  assert.ok(result.account.hasRefresh);
  const saved = await store.getUser(TG_ID);
  assert.ok(!JSON.stringify(saved).includes('live_token_1'), 'لا يجوز تخزين التوكن صريحاً');
});

await step('السجل يُقرأ بالتوكن', async () => {
  const overview = await engine.getOverview(TG_ID, MSISDN);
  assert.equal(overview.lastWeeklyAt, null);
  assert.equal(overview.canClaimNow, true);
  const call = calls.find((item) => item.path.includes('subscription-history'));
  assert.ok(call, 'يجب استدعاء السجل');
});

await step('استلام هدية 2 جيجا حقيقي (walk/activate-reward)', async () => {
  const result = await engine.claimWeeklyGift(TG_ID, MSISDN);
  assert.equal(result.ok, true);
  assert.equal(weeklyClaimed, 1);
  const call = calls.find((item) => item.path.includes('/services/walk/activate-reward/'));
  assert.ok(call?.body.includes('GIFTWALKWIN2GO'));
});

await step('السجل يمنع الاستلام الثاني (مهلة 7 أيام)', async () => {
  const before = weeklyClaimed;
  const result = await engine.claimWeeklyGift(TG_ID, MSISDN);
  assert.equal(result.status, 'cooldown');
  assert.equal(weeklyClaimed, before, 'يجب ألا يُرسل طلب ثانٍ');
  assert.ok(result.nextEligibleAt > Date.now());
});

await step('402 من جيزي → خطأ أهلية واضح', async () => {
  // نُفرّغ السجل ونعلن عدم الأهلية
  historyItems = [];
  ineligible = true;
  await assert.rejects(
    () => engine.claimWeeklyGift(TG_ID, MSISDN),
    (error) => error.code === ERROR_CODES.BALANCE,
  );
  ineligible = false;
});

await step('900901 (توكن منتهٍ) → تجديد تلقائي ثم نجاح', async () => {
  historyItems = [];
  expireNextRewardCall = true;
  const result = await engine.claimWeeklyGift(TG_ID, MSISDN);
  assert.equal(result.ok, true);
  assert.ok(calls.some((call) => call.body.includes('grant_type=refresh_token')), 'يجب تجديد الجلسة');
});

await step('الهدية الترويجية (scan) تُستلم', async () => {
  const result = await engine.claimPromoGift(TG_ID, MSISDN);
  assert.equal(result.ok, true);
  assert.ok(calls.some((call) => call.path.includes('/services/scan/activate-reward/')));
});

await step('الباقة المدفوعة لا تُفعّل بدون رمز مضبوط', async () => {
  await assert.rejects(
    () => engine.activatePaidOffer(TG_ID, MSISDN),
    (error) => error.code === ERROR_CODES.OFFER_NOT_FOUND,
  );
});

await step('خطأ الشبكة يُحوَّل إلى NETWORK', async () => {
  const deadClient = new DjezzyClient({ baseUrl: 'http://127.0.0.1:1', dryRun: false, timeoutMs: 1200 });
  await assert.rejects(
    () => deadClient.requestOtp({ msisdn: MSISDN }),
    (error) => [ERROR_CODES.NETWORK, ERROR_CODES.TIMEOUT].includes(error.code),
  );
});

server.close();

await step('بيانات عميل مرفوضة → تبديل تلقائي للزوج البديل', async () => {
  const seen = [];
  const fallbackServer = http.createServer((req, res) => {
    const body = [];
    req.on('data', (chunk) => body.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      const clientId = url.searchParams.get('client_id');
      seen.push(clientId);
      if (clientId !== 'legacy-id') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_client', error_description: 'Client authentication failed' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'code sent' }));
    });
  });

  await new Promise((resolve) => fallbackServer.listen(0, '127.0.0.1', resolve));
  const fallbackUrl = `http://127.0.0.1:${fallbackServer.address().port}`;

  const fallbackClient = new DjezzyClient({
    baseUrl: fallbackUrl,
    dryRun: false,
    timeoutMs: 5000,
    clientId: 'new-id',
    clientSecret: 'new-secret',
    legacyClientId: 'legacy-id',
    legacyClientSecret: 'legacy-secret',
  });

  const started = await fallbackClient.requestOtp({ msisdn: MSISDN });
  assert.ok(started.sessionId);
  assert.deepEqual(seen, ['new-id', 'legacy-id'], 'يجب تجربة الزوج الثاني بعد الرفض');

  // الطلب التالي يستخدم الزوج الناجح مباشرة
  await fallbackClient.requestOtp({ msisdn: MSISDN });
  assert.equal(seen.at(-1), 'legacy-id');

  fallbackServer.close();
});

rmSync(process.env.STORE_FILE, { force: true });
await new Promise((resolve) => setTimeout(resolve, 80));

const failed = steps.filter((item) => !item.ok);
console.log(`\n${'-'.repeat(52)}`);
console.log(`النتيجة: ${steps.length - failed.length}/${steps.length} ناجح`);
if (failed.length) {
  console.error('خطوات فاشلة:', failed.map((item) => item.name).join(' | '));
  process.exit(1);
}
console.log('✅ العميل المباشر يطابق واجهة جيزي الحقيقية.');
process.exit(0);
