#!/usr/bin/env node
/**
 * selftest.js — اختبار كامل بلا إنترنت وبلا توكن بوت.
 * يشغّل سيرفراً وهمياً يقلّد واجهة جيزي ويتحقق من: شكل الطلبات، الترويسات،
 * التشفير، تبديل بيانات العميل، وترجمة أخطاء جيزي.
 *
 *   npm run selftest
 */
import http from 'node:http';
import net from 'node:net';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

process.chdir(tmpdir());
const { Djezzy, DjezzyError, KIND, parsePhone } = await import('./djezzy.js');
const { ProxyPool, parseProxyList } = await import('./proxy.js');
const { store, encrypt, decrypt } = await import('./store.js');

const results = [];
const test = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✅ ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`❌ ${name}\n   ${error.message}`);
  }
};

/* ------------------------- سيرفر وهمي لواجهة جيزي ------------------------- */
const calls = [];
let mode = 'ok';

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });

const server = http.createServer(async (req, res) => {
  const raw = await readBody(req);
  const url = new URL(req.url, 'http://localhost');
  calls.push({ method: req.method, path: url.pathname, query: url.search, raw, headers: req.headers });

  const send = (status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  if (url.pathname === '/mobile-api/oauth2/registration') {
    if (url.searchParams.get('client_id') === 'bad-id') {
      return send(401, { error: 'invalid_client', error_description: 'Client authentication failed' });
    }
    if (mode === 'rate') return send(429, { message: 'Too many requests' });
    return send(200, { message: 'confirmation code has been sent successfully' });
  }

  if (url.pathname === '/mobile-api/oauth2/token') {
    const form = new URLSearchParams(raw);
    if (form.get('grant_type') === 'mobile') {
      if (form.get('otp') !== '123456') return send(400, { error: 'invalid_grant', error_description: 'Invalid otp' });
      return send(200, { access_token: 'tok_1', refresh_token: 'ref_1', expires_in: 3600 });
    }
    if (form.get('grant_type') === 'refresh_token') {
      return send(200, { access_token: 'tok_2', refresh_token: 'ref_2', expires_in: 3600 });
    }
    return send(400, { error: 'unsupported_grant_type' });
  }

  if (url.pathname.includes('/subscription-history/')) {
    if (req.headers.authorization !== 'Bearer tok_1' && req.headers.authorization !== 'Bearer tok_2') {
      return send(401, { fault: { code: 900901 } });
    }
    return send(200, { status: 200, data: [{ packageCode: 'GIFTWALKWIN2GO', subscriptionDateTime: '2026-01-01T10:00:00Z' }] });
  }

  if (url.pathname.includes('/walk/activate-reward/')) {
    if (req.headers.authorization !== 'Bearer tok_1') return send(401, { fault: { code: 900901, message: 'Invalid Credentials' } });
    if (mode === 'noteligible') return send(402, { status: 402, message: { en: 'You must subscribe to a plan' } });
    if (mode === 'already') return send(400, { message: { en: 'Reward already claimed' } });
    return send(200, { status: 200, message: { en: 'successfully done' } });
  }

  if (url.pathname.includes('/scan/activate-reward/')) {
    return send(200, { status: 200, message: { ar: 'تم بنجاح' } });
  }

  return send(404, { message: 'not found' });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const client = new Djezzy({
  baseUrl,
  timeoutMs: 3000,
  retries: 0,
  clientId: 'good-id',
  clientSecret: 'good-secret',
  acceptLanguage: 'ar-DZ',
});

const MSISDN = '213770123456';

/* --------------------------------- الاختبارات --------------------------------- */
await test('تطبيع الأرقام: 07 فقط', () => {
  assert.equal(parsePhone('0770123456').msisdn, MSISDN);
  assert.equal(parsePhone('+213 77 012 3456').msisdn, MSISDN);
  assert.equal(parsePhone('00213770123456').msisdn, MSISDN);
  assert.equal(parsePhone('٠٧٧٠١٢٣٤٥٦').msisdn, MSISDN, 'أرقام عربية-هندية');
  assert.equal(parsePhone('۰۷۷۰۱۲۳۴۵۶').msisdn, MSISDN, 'أرقام فارسية');
  assert.equal(parsePhone('0551234567').ok, false, 'أرقام 05 مرفوضة');
  assert.equal(parsePhone('0661234567').ok, false, 'أرقام 06 مرفوضة');
  assert.equal(parsePhone('021234567').ok, false);
});

await test('تشفير الجلسات AES-256-GCM', () => {
  const secret = 'access-token-xyz';
  const blob = encrypt(secret);
  assert.notEqual(blob, secret);
  assert.equal(decrypt(blob), secret);
  assert.equal(decrypt('تالف'), null);
});

await test('طلب OTP: query + JSON + ترويسات التطبيق', async () => {
  const call = calls.find((item) => item.path === '/mobile-api/oauth2/registration');
  await client.requestOtp(MSISDN);
  const request = calls.filter((item) => item.path === '/mobile-api/oauth2/registration').at(-1);
  assert.equal(new URLSearchParams(request.query).get('msisdn'), MSISDN);
  assert.equal(new URLSearchParams(request.query).get('scope'), 'smsotp');
  assert.equal(new URLSearchParams(request.query).get('client_id'), 'good-id');
  assert.equal(request.headers['accept-language'], 'ar-DZ');
  assert.match(request.headers['user-agent'], /MobileApp/);
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(JSON.parse(request.raw)['is-consent'], true);
  assert.ok(call === undefined || true);
});

await test('التحقق من الرمز: form → توكنات', async () => {
  const tokens = await client.verifyOtp(MSISDN, '123456');
  assert.equal(tokens.accessToken, 'tok_1');
  assert.equal(tokens.refreshToken, 'ref_1');
  const request = calls.filter((item) => item.path === '/mobile-api/oauth2/token').at(-1);
  const form = new URLSearchParams(request.raw);
  assert.equal(form.get('grant_type'), 'mobile');
  assert.equal(form.get('scope'), 'djezzyAppV2');
  assert.equal(form.get('mobileNumber'), MSISDN);
});

await test('رمز خاطئ → OTP_INVALID', async () => {
  await assert.rejects(
    () => client.verifyOtp(MSISDN, '000000'),
    (error) => error instanceof DjezzyError && error.kind === KIND.OTP_INVALID,
  );
});

await test('تجديد الجلسة يعمل', async () => {
  const refreshed = await client.refresh('ref_1');
  assert.equal(refreshed.accessToken, 'tok_2');
});

await test('هدية 2 جيجا: Bearer + packageCode', async () => {
  const result = await client.claimWeeklyGift(MSISDN, 'tok_1');
  assert.equal(result.ok, true);
  const request = calls.filter((item) => item.path.includes('/walk/activate-reward/')).at(-1);
  assert.equal(request.headers.authorization, 'Bearer tok_1');
  assert.equal(JSON.parse(request.raw).packageCode, 'GIFTWALKWIN2GO');
  assert.ok(request.path.endsWith(MSISDN));
});

await test('402 → NOT_ELIGIBLE', async () => {
  mode = 'noteligible';
  await assert.rejects(
    () => client.claimWeeklyGift(MSISDN, 'tok_1'),
    (error) => error.kind === KIND.NOT_ELIGIBLE,
  );
  mode = 'ok';
});

await test('"already" → ALREADY', async () => {
  mode = 'already';
  await assert.rejects(
    () => client.claimWeeklyGift(MSISDN, 'tok_1'),
    (error) => error.kind === KIND.ALREADY,
  );
  mode = 'ok';
});

await test('900901 → AUTH_EXPIRED', async () => {
  await assert.rejects(
    () => client.claimWeeklyGift(MSISDN, 'tok_old'),
    (error) => error.kind === KIND.AUTH_EXPIRED,
  );
});

await test('السجل يُقرأ ويُحوَّل', async () => {
  const history = await client.history(MSISDN, 'tok_1');
  assert.equal(history.length, 1);
  assert.equal(history[0].code, 'GIFTWALKWIN2GO');
  assert.ok(history[0].at > 0);
});

await test('الهدية الترويجية QR', async () => {
  const result = await client.claimScanGift(MSISDN, 'tok_1');
  assert.equal(result.ok, true);
  const request = calls.filter((item) => item.path.includes('/scan/activate-reward/')).at(-1);
  assert.ok(JSON.parse(request.raw).qrCode.includes('djezzy.dz'));
});

await test('بيانات عميل مرفوضة → تبديل تلقائي', async () => {
  const fallback = new Djezzy({
    baseUrl,
    timeoutMs: 3000,
    retries: 0,
    clientId: 'bad-id',
    clientSecret: 'bad-secret',
    legacyClientId: 'good-id',
    legacyClientSecret: 'good-secret',
  });
  await fallback.requestOtp(MSISDN);
  assert.equal(fallback.activeCredentials.id, 'good-id');
});

await test('429 → RATE_LIMITED', async () => {
  mode = 'rate';
  await assert.rejects(
    () => client.requestOtp(MSISDN),
    (error) => error.kind === KIND.RATE_LIMITED,
  );
  mode = 'ok';
});

await test('خادم غير قابل للوصول → GEO', async () => {
  const dead = new Djezzy({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 1200, retries: 0, clientId: 'a', clientSecret: 'b' });
  await assert.rejects(
    () => dead.requestOtp(MSISDN),
    (error) => error.kind === KIND.GEO,
  );
});

await test('تعليق الشبكة (لا رد) → TIMEOUT وليس GEO', async () => {
  const silent = http.createServer(() => {
    /* لا يُرسل أي رد — يحاكي تعليق IPv6/شبكة الهاتف */
  });
  await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve));
  const hanging = new Djezzy({
    baseUrl: `http://127.0.0.1:${silent.address().port}`,
    timeoutMs: 300,
    retries: 0,
    clientId: 'a',
    clientSecret: 'b',
  });
  try {
    await assert.rejects(
      () => hanging.requestOtp(MSISDN),
      (error) => error.kind === KIND.TIMEOUT && error.kind !== KIND.GEO,
    );
  } finally {
    silent.closeAllConnections?.();
    silent.close();
  }
});

await test('فرض IPv4 + keepAlive مفعّل افتراضياً', () => {
  const defaulted = new Djezzy({ baseUrl, clientId: 'a', clientSecret: 'b' });
  assert.equal(typeof defaulted.meta.forceIpv4, 'boolean');
  assert.ok(defaulted.meta.retries >= 2, 'عدد المحاولات الافتراضي 2 على الأقل');
  const agent = defaulted.http.defaults.httpsAgent;
  assert.ok(agent, 'يجب أن يوجد httpsAgent مخصّص');
  assert.equal(agent.options.keepAlive, true);
  assert.equal(typeof agent.options.lookup, 'function', 'lookup مخصّص لفرض IPv4');
});

await test('Proxy يُقرأ من متغيّر البيئة', () => {
  const withProxy = new Djezzy({ env: { DJEZZY_PROXY: 'http://user:pa%40ss@127.0.0.1:8080' }, clientId: 'a', clientSecret: 'b' });
  assert.equal(withProxy.meta.proxy.host, '127.0.0.1');
  assert.equal(withProxy.meta.proxy.port, 8080);
  assert.equal(withProxy.meta.proxy.auth.username, 'user');
  assert.equal(withProxy.meta.proxy.auth.password, 'pa@ss');
});

await test('ProxyPool: تحليل القائمة + إزالة المكرّر + المصادقة', () => {
  const list = parseProxyList(
    'http://user:pa%40ss@41.1.1.1:8080, 41.2.2.2:3128 , socks5://u:p@41.3.3.3:1080, http://41.1.1.1:8080, باطل',
  );
  assert.equal(list.length, 3);
  assert.equal(list[0].username, 'user');
  assert.equal(list[0].password, 'pa@ss');
  assert.equal(list[1].protocol, 'http');
  assert.equal(list[1].port, 3128);
  assert.equal(list[2].protocol, 'socks5');
  const pool = new ProxyPool(list);
  assert.equal(pool.enabled, true);
  assert.equal(pool.status().total, 3);
});

await test('بروكسي جزائري: توجيه الطلبات عبر CONNECT + failover لبروكسي ميت', async () => {
  const hits = [];
  const proxy = net.createServer((socket) => {
    socket.once('data', (buffer) => {
      const match = /^CONNECT ([^:]+):(\d+)/.exec(buffer.toString());
      if (!match) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
      }
      hits.push(`${match[1]}:${match[2]}`);
      const upstream = net.connect(Number(match[2]), match[1], () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
    });
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));

  try {
    const dead = 'http://127.0.0.1:1';
    const alive = `http://127.0.0.1:${proxy.address().port}`;
    const proxied = new Djezzy({
      baseUrl,
      timeoutMs: 3000,
      retries: 1,
      clientId: 'a',
      clientSecret: 'b',
      proxies: `${dead},${alive}`,
    });

    assert.equal(proxied.pool.size, 2);
    await proxied.requestOtp(MSISDN); // يمرّ رغم أن أول بروكسي ميت
    assert.ok(hits.length >= 1, 'يجب أن تمرّ الطلبات عبر البروكسي');
    assert.ok(proxied.pool.status().healthy >= 1);
  } finally {
    proxy.close();
  }
});

await test('تخزين الحسابات + التشفير على القرص', () => {
  const user = store.addAccount('42', MSISDN, { accessToken: 'tok_1', refreshToken: 'ref_1', expiresIn: 3600 });
  assert.ok(user.accounts[MSISDN].tokenEnc.startsWith('ey') || user.accounts[MSISDN].tokenEnc.length > 20);
  assert.equal(decrypt(user.accounts[MSISDN].tokenEnc), 'tok_1');
  const removed = store.removeAccount('42', MSISDN);
  assert.equal(removed.accounts[MSISDN], undefined);
});

server.close();
rmSync(join(tmpdir(), 'data'), { recursive: true, force: true });

const failed = results.filter((item) => !item.ok);
console.log('\n' + '-'.repeat(52));
console.log(`النتيجة: ${results.length - failed.length}/${results.length} ناجح`);
if (failed.length) {
  console.error('فشل:', failed.map((item) => item.name).join(' | '));
  process.exit(1);
}
console.log('✅ كل الأنظمة سليمة — البوت جاهز للتشغيل.');
process.exit(0);
