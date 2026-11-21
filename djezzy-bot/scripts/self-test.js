#!/usr/bin/env node
/**
 * اختبار ذاتي شامل (لا يحتاج توكن بوت ولا شبكة):
 * يتحقق من التطبيع، التشفير، محرّك جيزي (محاكاة)، والأزرار، ومسارات HTTP.
 *
 *   node scripts/self-test.js
 */
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// عزل التخزين حتى لا تتأثر الاختبارات بجلسات حقيقية محفوظة على القرص
process.env.STORE_FILE = join(tmpdir(), `djezzy-self-${process.pid}.json`);
process.env.SESSION_ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY || 'test-key-0123456789abcdef0123456789abcdef';

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
const MSISDN = normalizeMsisdn('0770123456').msisdn;

const client = new DjezzyClient({ dryRun: true });
const engine = new DjezzyEngine({ client, store });

await test('تطبيع أرقام جيزي (+2137 فقط)', () => {
  assert.equal(normalizeMsisdn('0551234567').valid, false, 'أرقام 05 مرفوضة');
  assert.equal(normalizeMsisdn('0661234567').valid, false, 'أرقام 06 مرفوضة');
  assert.equal(normalizeMsisdn('0770123456').msisdn, '213770123456');
  assert.equal(normalizeMsisdn('+213 77 123 4567').msisdn, '213771234567');
  assert.equal(normalizeMsisdn('00213 771 234 567').msisdn, '213771234567');
  assert.equal(normalizeMsisdn('0770-11-22-33').msisdn, '213770112233');
  assert.equal(normalizeMsisdn('٠٧٧١٢٣٤٥٦٧').msisdn, '213771234567');
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

  const code = started.debugCode; // يعود في الاستجابة فقط — لا يُخزَّن مع الجلسة
  const result = await engine.confirmLogin(TG_ID, MSISDN, code);
  assert.ok(result.account.label.includes('***'));

  const saved = await store.getUser(TG_ID);
  const account = saved.accounts[MSISDN];
  assert.ok(account.tokenEnc.startsWith('v1:'), 'يجب أن يكون التوكن مشفّراً');
  assert.ok(!account.tokenEnc.includes('sim_access'), 'لا يجوز تخزين التوكن صريحاً');
  assert.equal(saved.state, null);
});

await test('رمز خاطئ يُرفض', async () => {
  await engine.startLogin(TG_ID, MSISDN);
  await assert.rejects(
    () => engine.confirmLogin(TG_ID, MSISDN, '000000'),
    (error) => error.code === ERROR_CODES.OTP_INVALID,
  );
  const user = await store.getUser(TG_ID);
  user.state = null;
  await store.saveUser(user);
});

await test('نظرة عامة على الحساب (سجل الاشتراكات)', async () => {
  const overview = await engine.getOverview(TG_ID, MSISDN);
  assert.equal(overview.mode, 'simulation');
  assert.equal(overview.lastWeeklyAt, null);
  assert.equal(overview.canClaimNow, true);
});

await test('العرض المدفوع لا يُفعّل بدون رمز مضبوط', async () => {
  await assert.rejects(
    () => engine.activatePaidOffer(TG_ID, MSISDN),
    (error) => error instanceof DjezzyError && error.code === ERROR_CODES.OFFER_NOT_FOUND,
  );
});

await test('استلام هدية 2 جيغا الأسبوعية (حقيقية)', async () => {
  const result = await engine.claimWeeklyGift(TG_ID, MSISDN);
  assert.equal(result.ok, true);
  assert.equal(result.claimed.length, 1);
  assert.equal(result.weeklyClaimed, true);
});

await test('منع الاستلام الثاني قبل 7 أيام', async () => {
  const result = await engine.claimWeeklyGift(TG_ID, MSISDN);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'cooldown');
  assert.ok(result.nextEligibleAt > Date.now());
});

await test('استلام كل الهدايا المتاحة', async () => {
  const result = await engine.claimAllGifts(TG_ID, MSISDN);
  // الهدية الأسبوعية مستلمة هذا الأسبوع + الهدية الترويجية تُستلم الآن
  assert.ok(result.claimed.some((item) => /ترويجية/.test(item.name)));
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
  const second = normalizeMsisdn('0781334455').msisdn;
  const startedSecond = await engine.startLogin(TG_ID, second);
  await engine.confirmLogin(TG_ID, second, startedSecond.debugCode);

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

await test('كتالوج العروض الحقيقية ولوحاته', async () => {
  const catalog = await import('../src/djezzy/catalog.js');
  assert.ok(catalog.PAID_OFFERS.length >= 15, 'الكتالوج يجب أن يضم عشرات العروض');
  assert.ok(catalog.FREE_GIFTS.length >= 3, 'ثلاث هدايا مجانية على الأقل');

  const offer = catalog.findOffer('BTLINTSPEEDDAY2Go');
  assert.ok(offer, 'عرض BTLINTSPEEDDAY2Go موجود');
  assert.equal(offer.price, 70);

  // جميع بيانات الأزرار ≤ 64 بايت
  const paid = ui.paidOffersMenu(0);
  for (const row of paid.inline_keyboard) {
    for (const button of row) {
      assert.ok(button.callback_data.length <= 64, `callback_data طويل: ${button.callback_data}`);
    }
  }
  const confirm = ui.confirmOffer(offer);
  assert.ok(confirm.inline_keyboard.flat().some((b) => b.callback_data === 'offer:go:BTLINTSPEEDDAY2Go'));

  const free = ui.freeGiftsMenu();
  const flat = free.inline_keyboard.flat();
  assert.ok(flat.some((b) => b.callback_data === 'gift:weekly2go'));
  assert.ok(flat.some((b) => b.callback_data === 'gift:promoqr'));
  assert.ok(flat.some((b) => b.callback_data === 'gift:mgm'));

  assert.match(txt.catalogText('free'), /مجانية/);
  assert.match(txt.catalogText('paid'), /مدفوعة/);
  assert.match(txt.offerConfirmText(offer), /تأكيد تفعيل/);
});

await test('توقيع والتحقق من بيانات Mini Apps (initData)', async () => {
  const { signInitData, verifyInitData } = await import('../src/util/telegram-auth.js');
  const token = '123456:TEST-TOKEN';
  const init = signInitData(
    { user: { id: 42, first_name: 'Tester' }, auth_date: Math.floor(Date.now() / 1000) },
    token,
  );
  const result = verifyInitData(init, token);
  assert.ok(result.ok, 'التوقيع يجب أن يُتحقق');
  assert.equal(result.user.id, 42);
  assert.ok(!verifyInitData(init, '000000:WRONG').ok, 'توكن آخر يجب أن يُرفض');
  assert.ok(!verifyInitData('hash=bad', token).ok, 'بيانات تالفة تُرفض');
});

await test('محرّك بروكسيات جيزي يطبّع الصيغ المختلفة', async () => {
  const { parseProxy } = await import('../src/djezzy/routes.js');
  const standard = parseProxy('http://user:pass@10.0.0.1:8080');
  assert.equal(standard.host, '10.0.0.1');
  assert.equal(standard.port, 8080);
  const bare = parseProxy('10.0.0.2:3128');
  assert.equal(bare.host, '10.0.0.2');
  const kookeey = parseProxy('mobile.kookeey.info:1086:abc123-DZ-1:secret-DZ-2');
  assert.equal(kookeey.port, 1086);
  assert.equal(kookeey.auth.username, 'abc123-DZ-1');
  assert.equal(parseProxy(''), null);
});

await test('محاكي جيزي يعيد ضبط حالته', () => {
  simulator.reset();
  assert.ok(simulator.enabled);
});

await test('مخزن تيليجرام المثبّت يكتب ويقرأ ويتراجع للذاكرة', async () => {
  const { createTelegramAdapter } = await import('../src/store/telegram.js');
  const { createMemoryAdapter } = await import('../src/store/index.js');

  const sent = [];
  const edited = [];
  const pinned = new Map(); // chatId → { message_id, text }
  let messageId = 0;
  let pinFails = false;

  const api = {
    async getMe() {
      return { username: 'tester' };
    },
    async getChat(chatId) {
      const found = pinned.get(String(chatId));
      if (!found) return { id: chatId };
      return { id: chatId, pinned_message: found };
    },
    async sendMessage(chatId, text) {
      messageId += 1;
      sent.push({ chatId, message_id: messageId, text });
      return { message_id: messageId, text };
    },
    async editMessageText(chatId, id, text) {
      edited.push({ chatId, id, text });
      const existing = [...pinned.values()].find((m) => m.message_id === id);
      if (existing) existing.text = text;
      return { message_id: id };
    },
    async pinChatMessage(chatId, id) {
      if (pinFails) throw new Error('METHOD_NOT_SUPPORTED');
      const message = { message_id: id, text: sent.find((m) => m.message_id === id)?.text || '' };
      pinned.set(String(chatId), message);
      return true;
    },
  };

  const memory = createMemoryAdapter();
  const adapter = createTelegramAdapter({ getApi: async () => api, fallback: memory });

  const key = 'djezzy:user:777';
  await adapter.set(key, JSON.stringify({ id: '777', accounts: { '0770': {} } }), 3600);
  assert.equal(sent.length, 1, 'أول حفظ يرسل رسالة');
  assert.ok(pinned.has('777'), 'الرسالة تُثبَّت');
  assert.match(sent[0].text, /DZSTATE:/);
  assert.match(sent[0].text, /لا تحذف/, 'رسالة مفهومة للمستخدم');

  const loaded = JSON.parse(await adapter.get(key));
  assert.equal(loaded.id, '777', 'القراءة من المثبّتة');

  await adapter.set(key, JSON.stringify({ id: '777', accounts: {} }), 3600);
  assert.equal(sent.length, 1, 'الحفظ الثاني يعدّل ولا يُرسل رسالة جديدة');
  assert.equal(edited.length, 1, 'تعديل الرسالة المثبّتة');

  // بدون مثبّتة → رسالة جديدة؛ عند فشل التثبيت → تراجع للذاكرة
  pinFails = true;
  await adapter.set('djezzy:user:888', 'value', 3600);
  assert.equal(adapter.disabled, true, 'تعطيل بعد فشل التثبيت');
  await adapter.set('djezzy:user:888', 'value', 3600);
  assert.equal(await adapter.get('djezzy:user:888'), 'value', 'الذاكرة البديلة تعمل');

  // مفتاح غير مدعوم (ميتا) يذهب مباشرة للذاكرة
  const fresh = createTelegramAdapter({ getApi: async () => api, fallback: memory });
  await fresh.set('djezzy:meta:webhook', JSON.stringify({ hello: 1 }), 60);
  assert.equal(JSON.parse(await memory.get('djezzy:meta:webhook')).hello, 1);

  // قيمة منتهية تُقرأ كفارغة
  const expired = createTelegramAdapter({
    getApi: async () => ({
      ...api,
      async getChat() {
        return { id: 1, pinned_message: { message_id: 9, text: 'X\nDZSTATE:' + Buffer.from(JSON.stringify({ value: 'old', expiresAt: Date.now() - 1000 })).toString('base64url') } };
      },
    }),
    fallback: memory,
  });
  assert.equal(await expired.get('djezzy:user:1'), null, 'الانتهاء يُرجع فارغاً');
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

rmSync(process.env.STORE_FILE, { force: true });
