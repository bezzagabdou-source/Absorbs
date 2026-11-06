/**
 * index.js — بوت تيليجرام لجيزي يعمل بالـ Long Polling (Telegraf)
 * ============================================================================
 * لا Webhook، لا Serverless، لا رابط عام: البوت يشتغل من أي جهاز/سيرفر
 * داخل الجزائر (هاتف بـ Termux، حاسوب، VPS جزائري) فيصل إلى واجهة جيزي مباشرة.
 *
 * التشغيل:
 *   npm install
 *   cp .env.example .env      # ضع BOT_TOKEN + بيانات جيزي
 *   npm start
 * ============================================================================
 */
import 'dotenv/config';
import process from 'node:process';
import { Telegraf, Markup } from 'telegraf';

import { Djezzy, DjezzyError, KIND, parsePhone } from './djezzy.js';
import { store, decrypt, encrypt } from './store.js';

/* ------------------------------- الإعدادات ------------------------------- */
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN غير مضبوط. انسخ .env.example إلى .env وضع التوكن.');
  process.exit(1);
}

const djezzy = Djezzy.fromEnv(process.env);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/* -------------------------------- أدوات -------------------------------- */
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const formatDate = (timestamp) =>
  new Intl.DateTimeFormat('ar-DZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Algiers',
  }).format(new Date(timestamp));

const errorText = (error) => {
  if (error instanceof DjezzyError) {
    const hint =
      error.kind === KIND.GEO
        ? '\n\n💡 <b>السبب:</b> جيزي تحجب أي اتصال من خارج الجزائر.\nشغّل البوت من هاتفك/جهازك داخل الجزائر، وأوقف VPN.'
        : error.kind === KIND.TIMEOUT
          ? '\n\n💡 <b>الخطوة التالية:</b> أوقف VPN، ثم بدّل بين Wi-Fi وبيانات جيزي وأعد المحاولة.\n' +
            'إذا تكرّر: نفّذ <code>DJEZZY_FORCE_IPV4=1</code> و<code>DJEZZY_TIMEOUT_MS=45000</code> في <code>.env</code> ثم <code>pm2 restart djezzy-bot</code>.'
          : '';
    return `⚠️ ${escapeHtml(error.friendly)}${hint}`;
  }
  return `⚠️ ${escapeHtml(error?.message || 'خطأ غير متوقع.')}`;
};

/* ------------------------------- لوحات ------------------------------- */
const mainMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📱 إضافة رقم', 'add'), Markup.button.callback('📊 حالة الرقم', 'status')],
    [Markup.button.callback('🎁 هدية 2 جيجا', 'gift:weekly'), Markup.button.callback('🌟 هدية QR', 'gift:scan')],
    [Markup.button.callback('🗂 أرقامي', 'accounts'), Markup.button.callback('🩺 فحص الاتصال', 'diag')],
  ]);

const cancelOnly = () => Markup.inlineKeyboard([[Markup.button.callback('✖️ إلغاء', 'cancel')]]);
const backHome = () => Markup.inlineKeyboard([[Markup.button.callback('🏠 القائمة', 'home')]]);

/* ---------------------------- إدارة الجلسات ---------------------------- */
/** يُعيد توكن صالحاً للرقم (ويجدّده تلقائياً عند الانتهاء) */
async function freshToken(userId, msisdn) {
  const user = store.getUser(userId);
  const account = user.accounts[msisdn];
  if (!account) throw new DjezzyError(KIND.AUTH_EXPIRED, 'الرقم غير مربوط. أضفه أولاً.');

  if (account.expiresAt && account.expiresAt > Date.now() + 60_000) {
    const token = decrypt(account.tokenEnc);
    if (token) return token;
  }

  const refreshToken = decrypt(account.refreshEnc);
  const refreshed = await djezzy.refresh(refreshToken);

  const updated = store.getUser(userId);
  updated.accounts[msisdn] = {
    ...updated.accounts[msisdn],
    tokenEnc: encrypt(refreshed.accessToken),
    refreshEnc: encrypt(refreshed.refreshToken),
    expiresAt: Date.now() + (refreshed.expiresIn || 3600) * 1000,
  };
  store.saveUser(updated);
  return refreshed.accessToken;
}

/** يُعيد الرقم النشط أو يطلب إضافة رقم */
function requireActive(userId) {
  const user = store.getUser(userId);
  const msisdn = user.active || Object.keys(user.accounts)[0];
  return msisdn ? { user, msisdn, account: user.accounts[msisdn] } : null;
}

/** حالة هدية 2 جيجا: آخر استلام (محلي + سجل جيزي إن أمكن) */
async function weeklyStatus(userId, msisdn) {
  const user = store.getUser(userId);
  let lastAt = user.lastWeeklyClaimAt || null;

  try {
    const token = await freshToken(userId, msisdn);
    const history = await djezzy.history(msisdn, token);
    const fromHistory = history
      .filter((item) => /WALKWIN/i.test(item.code) && item.at)
      .reduce((max, item) => Math.max(max, item.at), 0);
    if (fromHistory) lastAt = Math.max(lastAt || 0, fromHistory);
  } catch {
    /* السجل غير متاح — نكتفي بالسجل المحلي */
  }

  return { lastAt, nextAt: lastAt ? lastAt + WEEK_MS : null, canClaim: !lastAt || Date.now() >= lastAt + WEEK_MS };
}

/* -------------------------------- البوت -------------------------------- */
const bot = new Telegraf(BOT_TOKEN);

bot.catch((error, ctx) => {
  console.error('خطأ غير معالج:', error);
  ctx?.reply?.('⚠️ حدث خطأ غير متوقع. أعد المحاولة أو أرسل /start').catch(() => {});
});

bot.start(async (ctx) => {
  const user = store.getUser(ctx.from.id);
  store.setState(ctx.from.id, null);

  const name = ctx.from.first_name || 'صاحب الرقم';
  const linked = Object.keys(user.accounts).length;

  await ctx.reply(
    [
      `👋 أهلاً ${escapeHtml(name)}`,
      '',
      '🤖 <b>بوت جيزي</b> — يشتغل بالـ Polling من جهازك (بدون Webhook).',
      '',
      linked ? `🗂 أرقامك المربوطة: ${linked}` : '📱 ابدأ بإضافة رقمك:',
      linked ? '' : 'اضغط «📱 إضافة رقم» ثم أرسل <code>07XXXXXXXX</code>',
      '',
      '🔐 الرموز تُخزَّن مشفّرة على جهازك فقط.',
    ]
      .filter(Boolean)
      .join('\n'),
    { parse_mode: 'HTML', ...mainMenu() },
  );
});

bot.command('menu', (ctx) => ctx.reply('🏠 القائمة الرئيسية:', mainMenu()));
bot.command('cancel', (ctx) => {
  store.setState(ctx.from.id, null);
  return ctx.reply('✖️ تم الإلغاء.', backHome());
});

bot.command('help', (ctx) =>
  ctx.reply(
    [
      'ℹ️ <b>كيف يعمل البوت</b>',
      '',
      '1️⃣ 📱 إضافة رقم → يصلك رمز SMS من جيزي → أدخله.',
      '2️⃣ 🎁 هدية 2 جيجا → مرة واحدة كل 7 أيام (تُقرأ من سجل اشتراكاتك).',
      '3️⃣ 🌟 هدية QR → الهدية الترويجية الحالية.',
      '4️⃣ 🩺 فحص الاتصال → يتحقّق أن جهازك يصل إلى خوادم جيزي.',
      '',
      '⚙️ الأوامر: /start · /menu · /cancel · /help · /diag',
      '',
      '🌍 <b>مهم:</b> جيزي تقبل الاتصال من داخل الجزائر فقط —',
      'لهذا لا يعمل على Vercel/Railway. شغّله على هاتفك (Termux) أو سيرفر جزائري.',
      '',
      '⚠️ استعمل أرقامك أنت فقط، وبما يوافق شروط خدمة جيزي.',
    ].join('\n'),
    { parse_mode: 'HTML', ...backHome() },
  ),
);

bot.command('diag', async (ctx) => {
  await ctx.reply('🩺 جارٍ فحص الاتصال بخوادم جيزي…');
  const probe = await djezzy.probe();
  const lines = [
    probe.reachable ? '✅ <b>الاتصال يعمل</b>' : '❌ <b>لا يوجد اتصال بخوادم جيزي</b>',
    '',
    `الخادم: <code>${escapeHtml(djezzy.meta.baseUrl)}</code>`,
    probe.proxy ? `الوكيل (Proxy): <code>${escapeHtml(JSON.stringify(probe.proxy))}</code>` : 'الوكيل: مباشر (بدون Proxy)',
    `المهلة: ${djezzy.meta.timeoutMs} ms · المحاولات: ${djezzy.meta.retries + 1} · الزمن: ${probe.ms} ms`,
    djezzy.meta.forceIpv4 ? 'الشبكة: IPv4 فقط (يُصلح تعليق بعض شبكات الهاتف)' : 'الشبكة: تلقائي (IPv4/IPv6)',
    probe.status ? `HTTP: ${probe.status}` : `الخطأ: <code>${escapeHtml(probe.error || '—')}</code>`,
    '',
    probe.reachable
      ? 'يمكنك الآن إضافة رقمك واستلام رمز التحقق.'
      : '💡 إذا كان الخطأ <code>ECONNABORTED</code> أو <code>ETIMEDOUT</code>: أوقف VPN وبدّل بين Wi-Fi وبيانات جيزي.\n' +
        'وإذا كان <code>ENOTFOUND</code>: أطفي Private DNS في إعدادات أندرويد.',
  ];
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', ...mainMenu() });
});

/* ------------------------------- الأزرار ------------------------------- */
bot.action('home', async (ctx) => {
  await ctx.answerCbQuery();
  store.setState(ctx.from.id, null);
  await ctx.editMessageText('🏠 القائمة الرئيسية:', mainMenu()).catch(() => ctx.reply('🏠 القائمة الرئيسية:', mainMenu()));
});

bot.action('cancel', async (ctx) => {
  await ctx.answerCbQuery('أُلغي');
  store.setState(ctx.from.id, null);
  await ctx.editMessageText('✖️ تم الإلغاء.', backHome()).catch(() => ctx.reply('✖️ تم الإلغاء.', backHome()));
});

bot.action('add', async (ctx) => {
  await ctx.answerCbQuery();
  store.setState(ctx.from.id, { step: 'await_phone' });
  await ctx
    .editMessageText(
      [
        '📱 <b>إضافة رقم جديد</b>',
        '',
        'أرسل رقم جيزي بهذا الشكل:',
        '<code>0770123456</code> أو <code>+213770123456</code>',
        '',
        'سنرسل طلب رمز تحقق (SMS) إلى هذا الرقم مباشرة من جيزي.',
      ].join('\n'),
      { parse_mode: 'HTML', ...cancelOnly() },
    )
    .catch(() => ctx.reply('أرسل رقمك: <code>0770123456</code>', { parse_mode: 'HTML' }));
});

bot.action('accounts', async (ctx) => {
  await ctx.answerCbQuery();
  const user = store.getUser(ctx.from.id);
  const numbers = Object.keys(user.accounts);
  if (numbers.length === 0) {
    return ctx.editMessageText('🗂 لا يوجد أي رقم مربوط بعد.', {
      ...Markup.inlineKeyboard([[Markup.button.callback('📱 إضافة رقم', 'add')], [Markup.button.callback('🏠 القائمة', 'home')]]),
    });
  }

  const rows = numbers.map((msisdn) => {
    const account = user.accounts[msisdn];
    const active = user.active === msisdn ? '✅ ' : '';
    return [
      Markup.button.callback(`${active}${account.label}`, `use:${msisdn}`),
      Markup.button.callback('🗑', `del:${msisdn}`),
    ];
  });
  rows.push([Markup.button.callback('📱 إضافة رقم آخر', 'add')], [Markup.button.callback('🏠 القائمة', 'home')]);

  return ctx.editMessageText('🗂 <b>أرقامك</b>\nاختر رقماً لتفعيله أو احذفه:', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(rows),
  });
});

bot.action(/^use:(.+)$/, async (ctx) => {
  const msisdn = ctx.match[1];
  store.setActive(ctx.from.id, msisdn);
  await ctx.answerCbQuery('تم التفعيل ✅');
  const account = store.getUser(ctx.from.id).accounts[msisdn];
  await ctx.editMessageText(`✅ الرقم النشط الآن: <code>${escapeHtml(account?.label || msisdn)}</code>`, {
    parse_mode: 'HTML',
    ...backHome(),
  });
});

bot.action(/^del:(.+)$/, async (ctx) => {
  const msisdn = ctx.match[1];
  await ctx.answerCbQuery();
  await ctx.editMessageText('⚠️ هل تحذف هذا الرقم من البوت؟ (لن يؤثر على شريحتك)', {
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🗑 نعم، احذف', `delyes:${msisdn}`)],
      [Markup.button.callback('↩️ رجوع', 'accounts')],
    ]),
  });
});

bot.action(/^delyes:(.+)$/, async (ctx) => {
  store.removeAccount(ctx.from.id, ctx.match[1]);
  await ctx.answerCbQuery('حُذف');
  await ctx.editMessageText('🗑 حُذف الرقم من البوت.', {
    ...Markup.inlineKeyboard([[Markup.button.callback('🗂 أرقامي', 'accounts')], [Markup.button.callback('🏠 القائمة', 'home')]]),
  });
});

bot.action('status', async (ctx) => {
  await ctx.answerCbQuery('جارٍ القراءة…');
  const active = requireActive(ctx.from.id);
  if (!active) {
    return ctx.editMessageText('📱 لا يوجد رقم مربوط. أضف رقماً أولاً.', {
      ...Markup.inlineKeyboard([[Markup.button.callback('📱 إضافة رقم', 'add')], [Markup.button.callback('🏠 القائمة', 'home')]]),
    });
  }

  try {
    const status = await weeklyStatus(ctx.from.id, active.msisdn);
    const lines = [
      '📊 <b>حالة الرقم</b>',
      '',
      `الرقم: <code>${escapeHtml(active.account.label)}</code>`,
      status.lastAt ? `🎁 آخر هدية 2 جيجا: ${escapeHtml(formatDate(status.lastAt))}` : '🎁 لم تُستلم هدية 2 جيجا من هذا البوت',
      status.canClaim ? '✅ يمكنك استلام هدية جديدة الآن' : `⏳ الهدية التالية: ${escapeHtml(formatDate(status.nextAt))}`,
    ];
    return ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', ...mainMenu() });
  } catch (error) {
    return ctx.editMessageText(errorText(error), { parse_mode: 'HTML', ...backHome() });
  }
});

bot.action('gift:weekly', async (ctx) => {
  await ctx.answerCbQuery('جارٍ التنفيذ…');
  const active = requireActive(ctx.from.id);
  if (!active) return ctx.editMessageText('📱 أضف رقماً أولاً.', { ...Markup.inlineKeyboard([[Markup.button.callback('📱 إضافة رقم', 'add')]]) });

  try {
    const status = await weeklyStatus(ctx.from.id, active.msisdn);
    if (!status.canClaim) {
      return ctx.editMessageText(
        `⏳ <b>هدية 2 جيجا مُستلمة مؤخراً</b>\n\nآخر استلام: ${escapeHtml(formatDate(status.lastAt))}\nالمتاح التالي: ${escapeHtml(formatDate(status.nextAt))}\n\nالهدية متاحة مرة واحدة كل 7 أيام.`,
        { parse_mode: 'HTML', ...backHome() },
      );
    }

    const token = await freshToken(ctx.from.id, active.msisdn);
    const result = await djezzy.claimWeeklyGift(active.msisdn, token);
    store.touch(ctx.from.id, { lastWeeklyClaimAt: Date.now() });

    return ctx.editMessageText(
      [
        '🎉 <b>تم تفعيل هدية 2 جيجا</b>',
        '',
        `الرقم: <code>${escapeHtml(active.account.label)}</code>`,
        `الرسالة: ${escapeHtml(result.message)}`,
        '',
        'تأكد من رصيدك في تطبيق جيزي بعد دقيقة.',
      ].join('\n'),
      { parse_mode: 'HTML', ...mainMenu() },
    );
  } catch (error) {
    return ctx.editMessageText(errorText(error), { parse_mode: 'HTML', ...mainMenu() });
  }
});

bot.action('gift:scan', async (ctx) => {
  await ctx.answerCbQuery('جارٍ التنفيذ…');
  const active = requireActive(ctx.from.id);
  if (!active) return ctx.editMessageText('📱 أضف رقماً أولاً.', { ...Markup.inlineKeyboard([[Markup.button.callback('📱 إضافة رقم', 'add')]]) });

  try {
    const token = await freshToken(ctx.from.id, active.msisdn);
    const result = await djezzy.claimScanGift(active.msisdn, token);
    return ctx.editMessageText(
      `🌟 <b>تم تفعيل الهدية الترويجية</b>\n\nالرقم: <code>${escapeHtml(active.account.label)}</code>\nالرسالة: ${escapeHtml(result.message)}`,
      { parse_mode: 'HTML', ...mainMenu() },
    );
  } catch (error) {
    return ctx.editMessageText(errorText(error), { parse_mode: 'HTML', ...mainMenu() });
  }
});

/* --------------------------- الرسائل النصية --------------------------- */
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const user = store.getUser(userId);
  const state = user.state;
  const text = ctx.message.text.trim();

  // 1) إدخال رقم الهاتف
  if (state?.step === 'await_phone' || (!state && /^[+\d\s٠-٩()-]{8,}$/.test(text))) {
    const parsed = parsePhone(text);
    if (!parsed.ok) {
      return ctx.reply(`⚠️ ${parsed.error}`, { parse_mode: 'HTML', ...cancelOnly() });
    }

    await ctx.reply('⏳ <i>جارٍ طلب رمز تحقق من جيزي…</i>', { parse_mode: 'HTML' });
    try {
      await djezzy.requestOtp(parsed.msisdn);
      store.setState(userId, { step: 'await_otp', msisdn: parsed.msisdn, label: parsed.label, sentAt: Date.now() });
      return ctx.reply(
        [
          '📩 <b>أُرسل رمز التحقق</b>',
          '',
          `إلى: <code>${escapeHtml(parsed.label)}</code>`,
          'أدخل الرمز الذي وصلك في SMS (عادة 6 أرقام).',
          '',
          '⌛️ ينتهي الرمز بعد دقيقتين تقريباً.',
        ].join('\n'),
        { parse_mode: 'HTML', ...cancelOnly() },
      );
    } catch (error) {
      store.setState(userId, null);
      return ctx.reply(errorText(error), { parse_mode: 'HTML', ...backHome() });
    }
  }

  // 2) إدخال رمز التحقق
  if (state?.step === 'await_otp') {
    const code = text.replace(/\D/g, '');
    if (code.length < 4 || code.length > 8) {
      return ctx.reply('⚠️ الرمز من 4 إلى 8 أرقام. أعد إدخاله أو اضغط إلغاء.', cancelOnly());
    }
    if (Date.now() - (state.sentAt || 0) > 10 * 60 * 1000) {
      store.setState(userId, null);
      return ctx.reply('⌛️ انتهت صلاحية العملية. أرسل /start وأعد المحاولة.', backHome());
    }

    await ctx.reply('⏳ <i>جارٍ التحقق…</i>', { parse_mode: 'HTML' });
    try {
      const tokens = await djezzy.verifyOtp(state.msisdn, code);
      store.addAccount(userId, state.msisdn, tokens);
      return ctx.reply(
        [
          '✅ <b>تم ربط الرقم بنجاح</b>',
          '',
          `الرقم: <code>${escapeHtml(state.label)}</code>`,
          'الجلسة محفوظة ومشفّرة على جهازك — لن تحتاج الرمز مرة أخرى.',
          '',
          'يمكنك الآن استلام 🎁 هدية 2 جيجا.',
        ].join('\n'),
        { parse_mode: 'HTML', ...mainMenu() },
      );
    } catch (error) {
      return ctx.reply(errorText(error), { parse_mode: 'HTML', ...cancelOnly() });
    }
  }

  return ctx.reply('استعمل الأزرار 👇 أو أرسل /menu', mainMenu());
});

/* ------------------------------- التشغيل ------------------------------- */
async function main() {
  console.log('🔎 فحص الاتصال بخوادم جيزي…');
  const probe = await djezzy.probe();
  if (probe.reachable) {
    console.log(`✅ خوادم جيزي متاحة (HTTP ${probe.status} في ${probe.ms} ms)`);
  } else {
    console.warn(`⚠️ تعذّر الوصول إلى خوادم جيزي (${probe.error || 'unknown'}) — تأكد أنك داخل الجزائر وبلا VPN.`);
    console.warn('   سيستمر تشغيل البوت، لكن طلبات OTP/الهدايا ستفشل حتى يتوفّر الاتصال.');
  }

  // حذف أي Webhook سابق حتى يعمل الـ polling بلا تعارض (409)
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  } catch (error) {
    console.warn(`⚠️ تعذّر حذف الـ Webhook: ${error.message}`);
  }

  await bot.launch({ dropPendingUpdates: true });
  const me = await bot.telegram.getMe();
  console.log(`🤖 البوت @${me.username} يعمل الآن بالـ polling`);
  console.log('   ➜ افتح تيليجرام وأرسل /start');
  console.log('   ➜ للإيقاف: Ctrl+C');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((error) => {
  const message = String(error?.message || error);
  console.error('❌ فشل التشغيل:', message);

  if (/401|Unauthorized/i.test(message)) {
    console.error('   التوكن غير صحيح أو تم إبطاله — أنشئ واحداً جديداً من @BotFather.');
  } else if (/network|socket|ENOTFOUND|ETIMEDOUT|EFATAL|EAI_AGAIN/i.test(message)) {
    console.error('   تعذّر الاتصال بتيليجرام — تحقّق من الإنترنت (أو جرّب بيانات الهاتف بدل Wi-Fi).');
  } else {
    console.error('   راجع .env ثم أعد المحاولة، أو شغّل: npm run diag');
  }
  process.exit(1);
});
