#!/usr/bin/env node
/**
 * اختبار واجهة تيليجرام كاملة (End-to-End) بدون شبكة:
 * يهيّئ البوت بمعرّف وهمي ويعترض كل نداءات Telegram API،
 * ثم يمشي في السيناريو الحقيقي: /start → إضافة رقم → OTP → 6 جيغا → الهدايا → الإدارة.
 *
 *   node scripts/ux-test.js
 */
process.env.ACTION_COOLDOWN_MS = '0';
process.env.MAX_CLAIMS_PER_DAY = '100';
process.env.DJEZZY_DRY_RUN = 'true';

const assert = (await import('node:assert/strict')).default;

const { createBot } = await import('../src/bot.js');
const store = (await import('../src/store/index.js')).default;
const simulator = (await import('../src/djezzy/simulator.js')).default;

const TG_ID = 777000555;
const botInfo = { id: 9000927001, is_bot: true, first_name: 'Djezzy Bot', username: 'djezzy_test_bot' };

const bot = createBot({ token: '123456:TEST-TOKEN', botInfo });

/* اعتراض كل نداءات Telegram API */
const sent = [];
bot.api.config.use(async (_prev, method, payload) => {
  sent.push({ method, payload });
  return { ok: true, result: true };
});

const chat = { id: TG_ID, type: 'private', first_name: 'Tester' };
const from = { id: TG_ID, is_bot: false, first_name: 'Tester', language_code: 'ar' };
let updateId = 1;
let messageId = 100;

const lastText = () => {
  for (let i = sent.length - 1; i >= 0; i -= 1) {
    if (sent[i].payload?.text) return String(sent[i].payload.text);
  }
  return '';
};

const lastKeyboard = () => {
  for (let i = sent.length - 1; i >= 0; i -= 1) {
    if (sent[i].payload?.reply_markup) return sent[i].payload.reply_markup.inline_keyboard ?? [];
  }
  return [];
};

const hasButton = (data) => lastKeyboard().flat().some((button) => button.callback_data === data);

/** يبني كيان bot_command كما يرسله تيليجرام فعلياً */
function entitiesFor(text) {
  if (!text.startsWith('/')) return [];
  const command = text.split(/\s/)[0];
  return [{ type: 'bot_command', offset: 0, length: command.length }];
}

async function sendText(text) {
  sent.length = 0;
  await bot.handleUpdate({
    update_id: updateId++,
    message: {
      message_id: ++messageId,
      date: Math.floor(Date.now() / 1000),
      chat,
      from,
      text,
      entities: entitiesFor(text),
    },
  });
  return lastText();
}

async function click(data) {
  sent.length = 0;
  await bot.handleUpdate({
    update_id: updateId++,
    callback_query: {
      id: `cb${updateId}`,
      from,
      chat_instance: 'test-instance',
      data,
      message: {
        message_id: ++messageId,
        date: Math.floor(Date.now() / 1000),
        chat,
        from: botInfo,
        text: 'previous menu',
      },
    },
  });
  return lastText();
}

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

await step('البدء /start يعرض القائمة والأزرار', async () => {
  const text = await sendText('/start');
  assert.match(text, /بوت جيزي/);
  assert.ok(hasButton('add:start'), 'زر إضافة رقم مفقود');
  assert.ok(hasButton('acc:menu'), 'زر إدارة الأرقام مفقود');
});

await step('زر «إضافة رقم» يطلب الرقم', async () => {
  const text = await click('add:start');
  assert.match(text, /أرسل رقم جيزي/);
  assert.ok(hasButton('menu:home') || hasButton('add:start'));
});

await step('رقم غير صالح يُرفض بلطف', async () => {
  const text = await sendText('123');
  assert.match(text, /05 أو 06 أو 07/);
});

await step('رقم صالح يُرسل رمز تحقق', async () => {
  const text = await sendText('0551234567');
  assert.match(text, /رمز التحقق/);
  assert.match(text, /رمز المحاكاة/);
});

const otpMatch = lastText().match(/رمز المحاكاة: <code>(\d+)<\/code>/);
assert.ok(otpMatch, 'لم يُعرض رمز المحاكاة في وضع المحاكاة');

await step('رمز تحقق خاطئ يُرفض', async () => {
  const text = await sendText('000000');
  assert.match(text, /غير صحيح/);
});

await step('رمز صحيح يربط الرقم ويحفظ الجلسة', async () => {
  const text = await sendText(otpMatch[1]);
  assert.match(text, /تم ربط الرقم بنجاح/);
  assert.ok(hasButton('act:6gb'), 'زر 6 جيغا يجب أن يظهر بعد الربط');

  const user = await store.getUser(TG_ID);
  const account = user.accounts['213551234567'];
  assert.ok(account, 'الرقم لم يُحفظ');
  assert.ok(account.tokenEnc.startsWith('v1:'), 'التوكن يجب أن يُخزَّن مشفّراً');
});

await step('تفعيل 6 جيغا من الزر', async () => {
  const text = await click('act:6gb');
  assert.match(text, /محاكاة ناجحة|تم التفعيل بنجاح/);
  assert.match(text, /6 جيغا/);
  // في وضع المحاكاة يجب التنبيه صراحةً أن النتيجة تجريبية
  assert.match(text, /لم يُرسل أي طلب حقيقي|لا بيانات حقيقية/);
});

await step('تكرار التفعيل يشرح أنه مُفعّل مسبقاً', async () => {
  const text = await click('act:6gb');
  assert.match(text, /مُفعّل بالفعل|مُفعّل مسبقاً|غير قابل للتفعيل/);
});

await step('هدية 2 جيغا الأسبوعية تُستلم', async () => {
  const text = await click('act:gift:weekly');
  assert.match(text, /هدية/);
  assert.match(text, /2 جيغا/);
});

await step('فحص الحساب يعرض الرصيد والعروض', async () => {
  const text = await click('act:overview');
  assert.match(text, /حالة الحساب/);
  assert.match(text, /عرض 6 جيغا/);
});

await step('إدارة الأرقام تعرض الرقم المربوط', async () => {
  const text = await click('acc:menu');
  assert.match(text, /إدارة الأرقام/);
  assert.ok(hasButton('acc:pick:213551234567'), 'زر اختيار الرقم مفقود');
});

await step('حذف رقم بخطوتي تأكيد', async () => {
  await click('acc:remove');
  assert.ok(hasButton('acc:del:213551234567'));
  const confirm = await click('acc:del:213551234567');
  assert.match(confirm, /تأكيد حذف/);
  await click('acc:del:confirm:213551234567');
  const user = await store.getUser(TG_ID);
  assert.equal(user.accounts['213551234567'], undefined);
});

await step('/cancel يصفّر الحالة', async () => {
  await click('add:start');
  const text = await sendText('/cancel');
  assert.match(text, /تم الإلغاء/);
  const user = await store.getUser(TG_ID);
  assert.equal(user.state, null);
});

await step('الأزرار غير المعروفة لا تُسقط البوت', async () => {
  await click('bogus:button');
  const toast = sent.find((call) => call.method === 'answerCallbackQuery');
  assert.ok(toast, 'يجب الرد على الزر');
});

await step('الأوامر /help و/menu تعمل', async () => {
  const help = await sendText('/help');
  assert.match(help, /كيف يعمل البوت/);
  const menu = await sendText('/menu');
  assert.match(menu, /بوت جيزي/);
});

/* ------------------------------ النتيجة ------------------------------ */
simulator.reset();
const failed = steps.filter((item) => !item.ok);
console.log(`\n${'-'.repeat(52)}`);
console.log(`النتيجة: ${steps.length - failed.length}/${steps.length} ناجح`);
if (failed.length) {
  console.error('خطوات فاشلة:', failed.map((item) => item.name).join(' | '));
  process.exit(1);
}
console.log('✅ تدفّق الواجهة سليم من البداية إلى النهاية.');
process.exit(0);
