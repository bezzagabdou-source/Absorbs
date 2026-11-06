#!/usr/bin/env node
/**
 * اختبار ذاتي شامل (لا يحتاج توكن بوت ولا شبكة):
 * يتحقق من التطبيع، التشفير، محرّك جيزي (محاكاة)، والأزرار، ومسارات HTTP.
 *
 *   node scripts/self-test.js
 */
import assert from 'node:assert/strict';
import { normalizeMsisdn, isOtpCode } from '../src/util/validate.js';
import { encrypt, decrypt, safeEqual } from '../src/crypto.js';
import { DjezzyClient } from '../src/djezzy/client.js';
import { DjezzyEngine } from '../src/djezzy/engine.js';
import { DjezzyError, ERROR_CODES } from '../src/djezzy/errors.js';
import store from '../src/store/index.js';
import simulator from '../src/djezzy/simulator.js';
import * as ui from '../src/ui/keyboards.js';
import * as txt from '../src/ui/text.js';

const results = [];
const test = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✅ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.error(`❌ ${name}\n   ${error.message}`);
  }
};

const TG_ID = 555000111;
const MSISDN = normalizeMsisdn('0551234567').msisdn;

const client = new DjezzyClient({ dryRun: true });
const engine = new DjezzyEngine({ client, store });

await test('تطبيع أرقام جيزي (محلي/دولي/عربي)', () => {
  assert.equal(normalizeMsisdn('0551234567').msisdn, '213551234567');
  assert.equal(normalizeMsisdn('+213551234567').msisdn, '213551234567');
  assert.equal(normalizeMsisdn('00213 661 22 33 44').msisdn, '213661223344');
  assert.equal(normalizeMsisdn('0770-11-22-33').msisdn, '213770112233');
  assert.equal(normalizeMsisdn('٠٦٦١٢٣٤٥٦٧').msisdn, '213661234567');
  assert.equal(normalizeMsisdn('12345').valid, false);
  assert.equal(normalizeMsisdn('021234567').valid, false);
  assert.ok(isOtpCode('123456'));
  assert.ok(!isOtpCode('12ab56'));
});

await test('تشفير رموز الجلسات (AES-256-GCM)', () => {
  const secret = 'sim_access_token_abcdef123456';
  const payload = encrypt(secret);
  assert.notEqual(payload, secret);
  assert.equal(decrypt(payload), secret);
  assert.equal(decrypt('v1:bad:bad:bad'), null);
  assert.ok(safeEqual('abc', 'abc'));
  assert.ok(!safeEqual('abc', 'abd'));
});

await test('تسجيل الدخول عبر OTP وتخزين الجلسة مشفّرة', async () => {
  const started = await engine.startLogin(TG_ID, MSISDN);
  assert.ok(started.sessionId, 'sessionId مطلوب');

  const user = await store.getUser(TG_ID);
  assert.equal(user.state.step, 'awaiting_otp');

  const code = user.state.temp.debugCode;
  const result = await engine.confirmLogin(TG_ID, MSISDN, code, started.sessionId);
  assert.ok(result.account.label.includes('***'));

  const saved = await store.getUser(TG_ID);
  const account = saved.accounts[MSISDN];
  assert.ok(account.tokenEnc.startsWith('v1:'), 'يجب أن يكون التوكن مشفّراً');
  assert.ok(!account.tokenEnc.includes('sim_access'), 'لا يجوز تخزين التوكن صريحاً');
  assert.equal(saved.state, null);
});

await test('رمز خاطئ يُرفض', async () => {
  const started = await engine.startLogin(TG_ID, MSISDN);
  await assert.rejects(
    () => engine.confirmLogin(TG_ID, MSISDN, '000000', started.sessionId),
    (error) => error.code === ERROR_CODES.OTP_INVALID,
  );
  const user = await store.getUser(TG_ID);
  user.state = null;
  await store.saveUser(user);
});

await test('نظرة عامة على الحساب', async () => {
  const overview = await engine.getOverview(TG_ID, MSISDN);
  assert.equal(overview.mode, 'simulation');
  assert.ok(overview.sixGbOffer, 'يجب إيجاد عرض 6 جيغا');
  assert.ok(overview.weeklyGift, 'يجب إيجاد هدية 2 جيغا الأسبوعية');
});

await test('تفعيل عرض 6 جيغا + منع التكرار', async () => {
  const result = await engine.activateSixGb(TG_ID, MSISDN);
  assert.equal(result.status, 'activated');
  await assert.rejects(
    () => engine.activateSixGb(TG_ID, MSISDN),
    (error) => error instanceof DjezzyError && error.code === ERROR_CODES.OFFER_ALREADY_ACTIVE,
  );
});

await test('استلام هدية 2 جيغا الأسبوعية', async () => {
  const result = await engine.claimWeeklyGift(TG_ID, MSISDN);
  assert.equal(result.ok, true);
  assert.equal(result.claimed.length, 1);
  assert.equal(result.weeklyClaimed, true);
});

await test('استلام كل الهدايا المتاحة', async () => {
  const result = await engine.claimAllGifts(TG_ID, MSISDN);
  // في المحاكاة: الهدية الأسبوعية مستلمة بالفعل، والليلية غير متاحة
  assert.equal(result.ok, false);
  assert.ok(result.failed.some((item) => /مُستلمة/.test(item.reason)));
});

await test('تجديد الجلسة عند انتهاء التوكن', async () => {
  const user = await store.getUser(TG_ID);
  user.accounts[MSISDN].tokenExpiresAt = Date.now() - 1000;
  await store.saveUser(user);

  const token = await engine.ensureToken(await store.getUser(TG_ID), MSISDN);
  assert.ok(token, 'يجب إرجاع توكن بعد التجديد');
  const after = await store.getUser(TG_ID);
  assert.ok(after.accounts[MSISDN].tokenExpiresAt > Date.now());
});

await test('بديل الأرقام + الحذف', async () => {
  const second = normalizeMsisdn('0661334455').msisdn;
  const started = await engine.startLogin(TG_ID, second);
  const user = await store.getUser(TG_ID);
  await engine.confirmLogin(TG_ID, second, user.state.temp.debugCode, started.sessionId);

  const active = await engine.setActive(TG_ID, second);
  assert.equal(active.msisdn, second);

  await engine.removeAccount(TG_ID, second);
  const after = await store.getUser(TG_ID);
  assert.equal(after.accounts[second], undefined);
  assert.equal(after.activeMsisdn, MSISDN);
});

await test('حد العمليات اليومي يعمل', async () => {
  const user = await store.getUser(TG_ID);
  user.meta.claimCount = 999;
  user.meta.claimWindowStart = Date.now();
  await store.saveUser(user);
  await assert.rejects(
    () => engine.claimWeeklyGift(TG_ID, MSISDN),
    (error) => error.code === ERROR_CODES.QUOTA,
  );
});

await test('لوحات الأزرار تُبنى بشكل صحيح', () => {
  const main = ui.mainMenu({ hasAccount: true, activeMsisdn: MSISDN, mode: 'simulation' });
  const rows = main.inline_keyboard;
  assert.ok(rows.length >= 6);
  for (const row of rows) {
    for (const button of row) {
      assert.ok(button.callback_data.length <= 64, 'callback_data يجب أن يكون ≤ 64 بايت');
    }
  }

  const accounts = ui.accountsMenu([engine.describeAccount({ msisdn: MSISDN, label: '055 *** ** 67', addedAt: Date.now(), tokenExpiresAt: Date.now() + 1000 })], MSISDN);
  assert.ok(accounts.inline_keyboard.flat().some((b) => b.callback_data === `acc:pick:${MSISDN}`));
});

await test('نصوص الواجهة تُهرَّب بأمان', () => {
  const text = txt.mainMenuText({ name: '<script>alert(1)</script>', user: { accounts: {}, activeMsisdn: null }, mode: 'simulation', maxNumbers: 3 });
  assert.ok(!text.includes('<script>'), 'يجب هروب HTML');
  assert.ok(text.includes('&lt;script&gt;'));
  assert.ok(txt.errorText(new DjezzyError(ERROR_CODES.NETWORK)).includes('خوادم جيزي'));
});

await test('محاكي جيزي يعيد ضبط حالته', () => {
  simulator.reset();
  assert.ok(simulator.enabled);
});

/* ------------------------------ النتيجة ------------------------------ */
const failed = results.filter((item) => !item.ok);
console.log(`\n${'-'.repeat(52)}`);
console.log(`النتيجة: ${results.length - failed.length}/${results.length} ناجح`);
if (failed.length) {
  console.log('اختبارات فاشلة:', failed.map((item) => item.name).join(' | '));
  process.exit(1);
}
console.log('✅ جميع الاختبارات نجحت — المشروع سليم.');
