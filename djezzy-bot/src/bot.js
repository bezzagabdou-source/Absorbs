/**
 * واجهة تيليجرام (grammy):
 * تسجيل الأرقام عبر OTP، كتالوج الهدايا المجانية والعروض المدفوعة،
 * بونص الدعوة، إدارة الأرقام — بتصميم أزرار ملوّن بالفئات.
 * الحالة تُحفظ في التخزين (KV/GitHub) لا في الذاكرة — لذلك يعمل البوت على Vercel.
 */
import { Bot, InlineKeyboard } from 'grammy';
import config from './config.js';
import store from './store/index.js';
import client from './djezzy/client.js';
import { DjezzyEngine } from './djezzy/engine.js';
import { ERROR_CODES } from './djezzy/errors.js';
import { findOffer, configuredPaidOffer } from './djezzy/catalog.js';
import { isOtpCode, normalizeMsisdn } from './util/validate.js';
import { createLogger } from './util/logger.js';
import { escapeHtml, formatDateTime } from './util/time.js';
import * as ui from './ui/keyboards.js';
import * as txt from './ui/text.js';

const log = createLogger('bot');
const engine = new DjezzyEngine({ client });
const MSISDN_PATTERN = '213\\d{9}';

/* ----------------------------- أدوات مساعدة ----------------------------- */

const accountsOf = (user) =>
  Object.values(user.accounts || {})
    .map((account) => engine.describeAccount(account))
    .sort((a, b) => (a.msisdn === user.activeMsisdn ? -1 : b.msisdn === user.activeMsisdn ? 1 : b.addedAt - a.addedAt));

const displayName = (ctx) =>
  [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || ctx.from?.username || '';

const menuOpts = (user = {}) => ({
  hasAccount: Object.keys(user.accounts || {}).length > 0,
  activeMsisdn: user.activeMsisdn,
  mode: engine.mode,
  publicUrl: config.bot.publicUrl || null,
});

async function loadUser(ctx) {
  return store.getUser(ctx.from.id);
}

/** تعديل الرسالة إن أمكن، وإلا إرسال رسالة جديدة */
async function render(ctx, text, keyboard) {
  const options = {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
  };
  try {
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(text, options);
      return;
    }
    await ctx.reply(text, options);
  } catch (error) {
    const description = String(error?.description || error?.message || '');
    if (/message is not modified/i.test(description)) return;
    await ctx.reply(text, options);
  }
}

async function homeView(ctx, note = null) {
  const user = await loadUser(ctx);
  const main = txt.mainMenuText({
    name: displayName(ctx),
    user,
    mode: engine.mode,
    maxNumbers: config.limits.maxNumbersPerUser,
  });
  const text = note ? `${note}\n\n${main}` : main;
  await render(ctx, text, ui.mainMenu(menuOpts(user)));
}

/** فحص الحساب (الرصيد + العروض + السجل) — مشترك بين الزر والقائمة الملوّنة */
async function showOverview(ctx) {
  const context = await requireAccount(ctx);
  if (!context) return;

  const wait = await takeCooldown(context.user, 'overview');
  if (wait) return answer(ctx, `⏳ انتظر ${wait} ثانية`);

  await answer(ctx, '🔄 جارٍ الفحص…');
  await render(ctx, '⏳ <i>جارٍ جلب بيانات حسابك من جيزي…</i>', ui.backHome());

  try {
    const overview = await engine.getOverview(ctx.from.id, context.msisdn);
    await render(ctx, txt.overviewText({ account: context.account, overview }), ui.afterAction());
  } catch (error) {
    log.warn(`فشل الفحص: ${error.code || error.message}`);
    await render(ctx, txt.errorText(error), ui.afterAction());
  }
}

function helpText() {
  return [
    'ℹ️ <b>كيف يعمل البوت</b>',
    '',
    '1️⃣ «📱 إضافة رقم جديد» → أرسل الرقم (07…) → أدخل رمز التحقق.',
    '2️⃣ بعد التأكيد تظهر لك «🟢 الهدايا المجانية» و«🔵 العروض المدفوعة».',
    '3️⃣ 🟢 هدية 2 جيجا كل أسبوع · هدية الجمعة/المناسبة · بونص الدعوة — مجانية 100%.',
    '4️⃣ 🔵 عروض يومية/أسبوعية/شهرية بأسعار واضحة — تُفعَّل بتأكيدك فقط.',
    '5️⃣ «⚙️ إدارة الأرقام» → تبديل/حذف الأرقام.',
    '',
    'الأزرار الملوّنة أسفل الشات: 👤 ملفي · 🎁 الهدايا · 💳 العروض · 💰 الرصيد · 🤝 إحالة · ℹ️ مساعدة · 🗑️ حذف.',
    'الأوامر: /start · /menu · /cancel · /help · /diag',
    '',
    '🩺 <code>/diag</code> — تشخيص كامل (الرصيد/السجل/المسارات) إن فشل شيء.',
    '',
    '🔐 تُشفَّر رموز الجلسات قبل تخزينها ولا تُعرض أبداً، ولا تُخزَّن رموز التحقق إطلاقاً.',
    '⚠️ استخدم البوت على أرقامك فقط، وبما يتوافق مع شروط خدمة جيزي.',
    '',
    txt.DISCLAIMER,
  ].join('\n');
}

/** يرجع { user, msisdn } أو يشرح للمستخدم ما ينقص */
async function requireAccount(ctx) {
  const user = await loadUser(ctx);
  const msisdn = user.activeMsisdn || Object.keys(user.accounts || {})[0];

  if (!msisdn || !user.accounts[msisdn]) {
    await render(
      ctx,
      '⚠️ لا يوجد رقم مربوط بعد.\n\nابدأ بـ «📱 إضافة رقم جديد» ثم أعد المحاولة.',
      ui.mainMenu({ hasAccount: false, mode: engine.mode, publicUrl: config.bot.publicUrl || null }),
    );
    return null;
  }

  return { user, msisdn, account: user.accounts[msisdn] };
}

/** حماية من النقر المتكرّر: يرجع عدد الثواني المتبقية أو 0 */
async function takeCooldown(user, key) {
  const cooldowns = user.meta.cooldowns || {};
  const elapsed = Date.now() - (cooldowns[key] || 0);
  const remaining = config.limits.actionCooldownMs - elapsed;
  if (remaining > 0) return Math.ceil(remaining / 1000);

  cooldowns[key] = Date.now();
  user.meta.cooldowns = cooldowns;
  await store.saveUser(user);
  return 0;
}

async function answer(ctx, text) {
  try {
    await ctx.answerCallbackQuery({ text, show_alert: false });
  } catch {
    /* تجاهل */
  }
}

/* -------------------------------- البوت -------------------------------- */

export function createBot({ token = config.bot.token, botInfo } = {}) {
  const bot = new Bot(token, {
    client: { timeoutSeconds: 25 },
    ...(botInfo ? { botInfo } : {}),
  });

  /* قصر الاستخدام على معرّفات محددة (اختياري) */
  bot.use(async (ctx, next) => {
    const allowed = config.bot.allowedTelegramIds;
    if (allowed.length > 0 && ctx.from && !allowed.includes(String(ctx.from.id))) {
      await ctx.reply('⛔️ هذا البوت خاص ولا يمكن استخدامه من حسابك.');
      return;
    }
    await next();
  });

  /* ------------------------------ الأوامر ------------------------------ */
  bot.command(['start', 'menu'], async (ctx) => {
    const user = await loadUser(ctx);
    if (user.state) {
      user.state = null;
      await store.saveUser(user);
    }
    // قائمة رد ملوّنة ثابتة (أخضر/أزرق/أحمر) أسفل الشات — مثل صورة YASSER SHOPE
    await ctx
      .reply(['🗂️ <b>القائمة الرئيسية</b> — اختر من الأزرار الملوّنة بالأسفل 👇', '', txt.DISCLAIMER].join('\n'), {
        parse_mode: 'HTML',
        reply_markup: ui.mainReplyKeyboard(),
      })
      .catch(() => {});
    await homeView(ctx);
  });

  bot.command('cancel', async (ctx) => {
    const user = await loadUser(ctx);
    user.state = null;
    await store.saveUser(user);
    await render(ctx, '✖️ تم الإلغاء.', ui.backHome());
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(helpText(), { parse_mode: 'HTML', reply_markup: ui.backHome() });
  });

  /* تشخيص: الرصيد + السجل + المسارات (HTTP) */
  bot.command('diag', async (ctx) => {
    const context = await requireAccount(ctx);
    if (!context) return;
    await render(ctx, '🩺 <i>جارٍ التشخيص…</i>', ui.backHome());
    try {
      const report = await engine.runDiag(ctx.from.id, context.msisdn);
      await render(ctx, txt.diagText(report), ui.afterAction());
    } catch (error) {
      await render(ctx, txt.errorText(error), ui.backHome());
    }
  });

  /* --------------------------- الأزرار العامة --------------------------- */
  bot.callbackQuery('menu:home', async (ctx) => {
    const user = await loadUser(ctx);
    if (user.state) {
      user.state = null;
      await store.saveUser(user);
    }
    await answer(ctx);
    await homeView(ctx);
  });

  bot.callbackQuery('info:mode', async (ctx) => {
    await answer(
      ctx,
      engine.mode === 'simulation'
        ? '🧪 وضع المحاكاة: لا تُرسل طلبات حقيقية. أزل DJEZZY_DRY_RUN للتشغيل المباشر.'
        : '🟢 متصل بخوادم جيزي — يُجرَّب relay ثم مباشر ثم بروكسيات جزائرية تلقائياً.',
    );
  });

  /* ------------------------- كتالوج: الهدايا والعروض ------------------------- */
  bot.callbackQuery('cat:free', async (ctx) => {
    await answer(ctx);
    await render(ctx, txt.catalogText('free', { mode: engine.mode }), ui.freeGiftsMenu());
  });

  bot.callbackQuery('cat:paid', async (ctx) => {
    await answer(ctx);
    await render(ctx, txt.catalogText('paid', { mode: engine.mode }), ui.paidOffersMenu(0));
  });

  bot.callbackQuery(/^offers:page:(\d+)$/, async (ctx) => {
    const page = Number(ctx.match[1]) || 0;
    await answer(ctx);
    await render(ctx, txt.catalogText('paid', { mode: engine.mode }), ui.paidOffersMenu(page));
  });

  /* تأكيد عرض مدفوع (من الكتالوج) */
  bot.callbackQuery(/^offer:((?!go:)[A-Za-z0-9_-]+)$/, async (ctx) => {
    const code = ctx.match[1];
    const offer = findOffer(code) || (configuredPaidOffer()?.code === code ? configuredPaidOffer() : null);
    if (!offer) {
      await answer(ctx, '⚠️ هذا العرض لم يعد متاحاً');
      await render(ctx, '⚠️ هذا العرض غير موجود في الكتالوج.', ui.backHome());
      return;
    }
    await answer(ctx);
    await render(ctx, txt.offerConfirmText(offer, { simulated: engine.mode === 'simulation' }), ui.confirmOffer(offer));
  });

  /* تنفيذ تفعيل عرض مدفوع بعد التأكيد الصريح */
  bot.callbackQuery(/^offer:go:([A-Za-z0-9_-]+)$/, async (ctx) => {
    const code = ctx.match[1];
    const context = await requireAccount(ctx);
    if (!context) return;

    const wait = await takeCooldown(context.user, `offer:${code}`);
    if (wait) return answer(ctx, `⏳ انتظر ${wait} ثانية`);

    const offer = findOffer(code) || { code, name: code, detail: '', price: null };
    await answer(ctx, '🔵 جارٍ التفعيل…');
    await render(ctx, `⏳ <i>جارٍ إرسال طلب تفعيل ${escapeHtml(offer.name)} إلى جيزي…</i>`, ui.backHome());

    try {
      const result = await engine.activateOffer(ctx.from.id, context.msisdn, code);
      await render(
        ctx,
        txt.activationSuccess({ label: offer.name, item: result.item, simulated: engine.mode === 'simulation' }),
        ui.afterAction(),
      );
    } catch (error) {
      log.warn(`فشل تفعيل العرض ${code}: ${error.code || error.message}`);
      await render(ctx, txt.errorText(error), ui.afterAction());
    }
  });

  /* ------------------------- إضافة رقم + OTP ------------------------- */
  bot.callbackQuery('add:start', async (ctx) => {
    const user = await loadUser(ctx);
    const count = Object.keys(user.accounts || {}).length;

    if (count >= config.limits.maxNumbersPerUser) {
      await answer(ctx);
      await render(
        ctx,
        `⚠️ وصلت للحد الأقصى (${config.limits.maxNumbersPerUser} أرقام).\nحذف رقم من «⚙️ إدارة الأرقام» أولاً.`,
        ui.backHome(),
      );
      return;
    }

    user.state = { step: 'awaiting_phone', temp: { startedAt: Date.now() } };
    await store.saveUser(user);
    await answer(ctx);
    await render(ctx, txt.loginPrompt(), ui.cancelOnly());
  });

  /* --------------------------- إدارة الأرقام --------------------------- */
  bot.callbackQuery('acc:menu', async (ctx) => {
    await answer(ctx);
    const user = await loadUser(ctx);
    const accounts = accountsOf(user);
    await render(ctx, txt.accountsText(accounts, user.activeMsisdn), ui.accountsMenu(accounts, user.activeMsisdn));
  });

  bot.callbackQuery(/^acc:pick:(213\d{9})$/, async (ctx) => {
    const msisdn = ctx.match[1];
    try {
      const account = await engine.setActive(ctx.from.id, msisdn);
      await answer(ctx, `✅ الرقم النشط: ${account.label}`);
    } catch {
      await answer(ctx, '⚠️ تعذّر تحديد الرقم');
    }
    const user = await loadUser(ctx);
    const accounts = accountsOf(user);
    await render(ctx, txt.accountsText(accounts, user.activeMsisdn), ui.accountsMenu(accounts, user.activeMsisdn));
  });

  bot.callbackQuery('acc:remove', async (ctx) => {
    const user = await loadUser(ctx);
    const accounts = accountsOf(user);
    await answer(ctx);
    if (accounts.length === 0) {
      await render(ctx, 'لا توجد أرقام لحذفها.', ui.backHome());
      return;
    }
    await render(ctx, '🗑 اختر الرقم الذي تريد حذفه (ستُحذف جلسته أيضاً):', ui.removeMenu(accounts));
  });

  bot.callbackQuery(/^acc:del:(213\d{9})$/, async (ctx) => {
    const msisdn = ctx.match[1];
    const user = await loadUser(ctx);
    const account = engine.describeAccount(user.accounts[msisdn]);
    await answer(ctx);
    if (!account) {
      await render(ctx, 'الرقم غير موجود.', ui.backHome());
      return;
    }
    await render(ctx, `تأكيد حذف الرقم <code>${escapeHtml(account.label)}</code>؟`, ui.confirmDelete(account));
  });

  bot.callbackQuery(/^acc:del:confirm:(213\d{9})$/, async (ctx) => {
    const msisdn = ctx.match[1];
    await engine.removeAccount(ctx.from.id, msisdn);
    await answer(ctx, '🗑 تم الحذف');
    const user = await loadUser(ctx);
    const accounts = accountsOf(user);
    await render(
      ctx,
      txt.accountsText(accounts, user.activeMsisdn),
      accounts.length > 0 ? ui.accountsMenu(accounts, user.activeMsisdn) : ui.backHome(),
    );
  });

  /* ---------------------------- فحص الحساب ---------------------------- */
  bot.callbackQuery('act:overview', async (ctx) => {
    await showOverview(ctx);
  });

  /* ---------------------- زر6 جيجا: مجاني أولاً ثم المدفوع ---------------------- */
  bot.callbackQuery('act:6gb', async (ctx) => {
    const context = await requireAccount(ctx);
    if (!context) return;
    await answer(ctx, '🔥 جارٍ تفعيل6G (محاولة واحدة)…');

    //1) أي طريقة مجانية أولاً: باركود QR ثم Walk Win20000 خطوة (الجمعة تحديداً)
    try {
      const free = await engine.claimFridayGift(ctx.from.id, context.msisdn);
      if (free.ok) {
        await render(ctx, txt.giftsResult(free, { simulated: engine.mode === 'simulation' }), ui.afterAction());
        return;
      }
      var freeReason = free.message; // فشل مجاني مُعلَن بصدق — نعرضه فوق خيارات المدفوع
    } catch (error) {
      // رصيد/شرط باقة/حجب: رسالة صريحة + نُبقي خيار المدفوع ظاهراً
      if (['BALANCE', 'BLOCKED', 'AUTH_EXPIRED', 'RATE_LIMITED', 'OFFER_ALREADY_ACTIVE'].includes(error?.code)) {
        await render(ctx, txt.errorText(error), ui.afterAction());
        return;
      }
      var freeReason = error?.message;
    }

    const offer = configuredPaidOffer();
    if (!offer) {
      await render(
        ctx,
        [
          '🔥 <b>عرض 6 جيجا</b>',
          '',
          ...(typeof freeReason !== 'undefined' && freeReason ? [`⚠️ المحاولة المجانية: ${freeReason}`, ''] : []),
          'عروض 6 جيجا في جيزي ليست هدية مجانية — لكل عرض رمز باقة خاص به،',
          'وتفعيله قد يُخصم من رصيدك.',
          '',
          'لهذا لم أفعّل أي شيء تلقائياً. لديك خياران:',
          '• 🔵 تصفّح «العروض المدفوعة» واختر الباقة التي تريدها بسعرها المعلن.',
          '• 🟢 استخدم «الهدايا المجانية» (2 جيجا أسبوعياً + هدايا الجمعة).',
          '',
          'أو أرسل لي رمز الباقة (packageCode) من تطبيق جيزي واضبطه لزر 6 جيغا.',
        ].join('\n'),
        new InlineKeyboard()
          .text('🔵 العروض المدفوعة', 'cat:paid')
          .row()
          .text('🟢 الهدايا المجانية', 'cat:free')
          .row()
          .text('🏠 القائمة الرئيسية', 'menu:home'),
      );
      return;
    }

    await render(ctx, txt.offerConfirmText(offer, { simulated: engine.mode === 'simulation' }), ui.confirmOffer(offer));
  });

  bot.callbackQuery('act:6gb:confirm', async (ctx) => {
    const context = await requireAccount(ctx);
    if (!context) return;

    const wait = await takeCooldown(context.user, 'sixGb');
    if (wait) return answer(ctx, `⏳ انتظر ${wait} ثانية`);

    await answer(ctx, '🔥 جارٍ التفعيل…');
    await render(ctx, '⏳ <i>جارٍ إرسال طلب التفعيل إلى جيزي…</i>', ui.backHome());

    try {
      const result = await engine.activatePaidOffer(ctx.from.id, context.msisdn);
      await render(ctx, txt.activationSuccess({ label: 'العرض المدفوع', item: result.item }), ui.afterAction());
    } catch (error) {
      log.warn(`فشل تفعيل العرض: ${error.code || error.message}`);
      await render(ctx, txt.errorText(error), ui.afterAction());
    }
  });

  /* ------------------------- الهدايا المجانية ------------------------- */
  const giftHandler = (mode) => async (ctx) => {
    const context = await requireAccount(ctx);
    if (!context) return;

    const wait = await takeCooldown(context.user, `gifts:${mode}`);
    if (wait) return answer(ctx, `⏳ انتظر ${wait} ثانية`);

    await answer(ctx, '🎁 جارٍ الاستلام…');
    await render(
      ctx,
      mode === 'weekly'
        ? '⏳ <i>جارٍ استلام هدية 2 جيجا الأسبوعية…</i>'
        : mode === 'promo'
          ? '⏳ <i>جارٍ استلام هدية الجمعة/المناسبة…</i>'
          : mode === 'friday'
            ? '⏳ <i>جارٍ تفعيل6G (Walk Win — 20000 خطوة) — محاولة واحدة…</i>'
            : '⏳ <i>جارٍ استلام كل الهدايا المتاحة…</i>',
      ui.backHome(),
    );

    try {
      const result =
        mode === 'weekly'
          ? await engine.claimWeeklyGift(ctx.from.id, context.msisdn)
          : mode === 'promo'
            ? await engine.claimPromoGift(ctx.from.id, context.msisdn)
            : mode === 'friday'
              ? await engine.claimFridayGift(ctx.from.id, context.msisdn)
              : await engine.claimAllGifts(ctx.from.id, context.msisdn);

      const header = result.ok ? '✅' : '⚠️';
      await render(
        ctx,
        `${header} ${txt.giftsResult(result, { simulated: engine.mode === 'simulation' })}`,
        ui.afterAction(),
      );
    } catch (error) {
      log.warn(`فشل استلام الهدايا: ${error.code || error.message}`);
      await render(ctx, txt.errorText(error), ui.afterAction());
    }
  };

  bot.callbackQuery('act:gift:weekly', giftHandler('weekly'));
  bot.callbackQuery('act:gift:all', giftHandler('all'));
  bot.callbackQuery('gift:weekly2go', giftHandler('weekly'));
  bot.callbackQuery('gift:promoqr', giftHandler('promo'));
  bot.callbackQuery('gift:friday6', giftHandler('friday'));

  /* ------------------------- بونص الدعوة (MGM) ------------------------- */
  bot.callbackQuery('gift:mgm', async (ctx) => {
    const context = await requireAccount(ctx);
    if (!context) return;
    const user = context.user;
    user.state = { step: 'awaiting_friend', temp: { startedAt: Date.now() } };
    await store.saveUser(user);
    await answer(ctx);
    await render(ctx, txt.mgmPrompt(), ui.cancelOnly('cat:free'));
  });

  /* ---------------------------- الرسائل النصية ---------------------------- */
  bot.on('message:text', async (ctx) => {
    const user = await loadUser(ctx);
    const state = user.state;
    const text = String(ctx.message.text || '').trim();

    if (!state?.step) {
      /* أزرار القائمة الملوّنة (reply keyboard) — تُطابَق نصوصها هنا */
      if (/ملفي|رصيد/i.test(text) && !/حذف/i.test(text)) {
        await showOverview(ctx);
        return;
      }
      if (/الهدايا|^🎁/.test(text)) {
        await render(ctx, txt.catalogText('free', { mode: engine.mode }), ui.freeGiftsMenu());
        return;
      }
      if (/العروض|^💳/.test(text)) {
        await render(ctx, txt.catalogText('paid', { mode: engine.mode }), ui.paidOffersMenu(0));
        return;
      }
      if (/إحالة|دعوة صديق/i.test(text)) {
        await render(ctx, txt.mgmPrompt(), ui.cancelOnly('cat:free'));
        return;
      }
      if (/مساعدة|^ℹ️/i.test(text)) {
        await ctx.reply(helpText(), { parse_mode: 'HTML', reply_markup: ui.backHome() });
        return;
      }
      if (/حذف رقم/i.test(text)) {
        const accounts = accountsOf(user);
        if (accounts.length === 0) {
          await render(ctx, 'لا توجد أرقام لحذفها.', ui.backHome());
          return;
        }
        await render(ctx, '🗑 اختر الرقم الذي تريد حذفه (ستُحذف جلسته أيضاً):', ui.removeMenu(accounts));
        return;
      }

      await ctx.reply('استخدم الأزرار للتنقل 👇 أو أرسل /menu للقائمة الرئيسية.', {
        reply_markup: ui.mainMenu(menuOpts(user)),
      });
      return;
    }

    /* ---------- 0) استقبال رقم صديق لبونص الدعوة ---------- */
    if (state.step === 'awaiting_friend') {
      const parsed = normalizeMsisdn(ctx.message.text);
      if (!parsed.valid) {
        await ctx.reply(`⚠️ ${parsed.reason}\n\nمثال: <code>0770123456</code>`, {
          parse_mode: 'HTML',
          reply_markup: ui.cancelOnly('cat:free'),
        });
        return;
      }

      const msisdn = user.activeMsisdn || Object.keys(user.accounts || {})[0];
      if (!msisdn) {
        user.state = null;
        await store.saveUser(user);
        await ctx.reply('⚠️ لا يوجد رقم مربوط — أضف رقمك أولاً.', { reply_markup: ui.backHome() });
        return;
      }

      user.state = null;
      await store.saveUser(user);
      await ctx.replyWithChatAction('typing').catch(() => {});
      try {
        const result = await engine.claimMgmBonus(ctx.from.id, msisdn, parsed.msisdn);
        await ctx.reply(txt.mgmResult(result, { simulated: engine.mode === 'simulation' }), {
          parse_mode: 'HTML',
          reply_markup: ui.afterAction(),
        });
      } catch (error) {
        await ctx.reply(txt.errorText(error), { parse_mode: 'HTML', reply_markup: ui.backHome() });
      }
      return;
    }

    /* ---------- 1) استقبال رقم الهاتف ---------- */
    if (state.step === 'awaiting_phone') {
      const parsed = normalizeMsisdn(ctx.message.text);
      if (!parsed.valid) {
        await ctx.reply(`⚠️ ${parsed.reason}\n\nمثال: <code>07XXXXXXXX</code>`, {
          parse_mode: 'HTML',
          reply_markup: ui.cancelOnly(),
        });
        return;
      }

      if (user.accounts[parsed.msisdn]) {
        // الرقم مربوط: نجدّد الجلسة برمز جديد (قد تكون منتهية)
        user.activeMsisdn = parsed.msisdn;
        await store.saveUser(user);
        await ctx.reply('ℹ️ هذا الرقم مربوط مسبقاً — سنجدّد جلسته برمز تحقق جديد.', {
          reply_markup: ui.cancelOnly(),
        });
        try {
          const started = await engine.startLogin(ctx.from.id, parsed.msisdn);
          await ctx.reply(
            txt.otpPrompt({ masked: started.masked, expiresIn: started.expiresIn, debugCode: started.debugCode }),
            { parse_mode: 'HTML', reply_markup: ui.cancelOnly() },
          );
        } catch (error) {
          await ctx.reply(txt.errorText(error), { parse_mode: 'HTML', reply_markup: ui.backHome() });
        }
        return;
      }

      const wait = await takeCooldown(user, 'otp');
      if (wait) {
        await ctx.reply(`⏳ انتظر ${wait} ثانية قبل طلب رمز جديد.`, { reply_markup: ui.cancelOnly() });
        return;
      }

      await ctx.replyWithChatAction('typing').catch(() => {});
      try {
        const started = await engine.startLogin(ctx.from.id, parsed.msisdn);
        await ctx.reply(
          txt.otpPrompt({ masked: started.masked, expiresIn: started.expiresIn, debugCode: started.debugCode }),
          { parse_mode: 'HTML', reply_markup: ui.cancelOnly() },
        );
      } catch (error) {
        log.warn(`فشل طلب OTP: ${error.code || error.message}`);
        user.state = null;
        await store.saveUser(user);
        await ctx.reply(txt.errorText(error), { parse_mode: 'HTML', reply_markup: ui.backHome() });
      }
      return;
    }

    /* ---------- 2) استقبال رمز التحقق ---------- */
    if (state.step === 'awaiting_otp') {
      const code = ctx.message.text.trim();
      if (!isOtpCode(code)) {
        await ctx.reply('⚠️ الرمز يجب أن يكون من 4 إلى 8 أرقام. أعد الإرسال أو /cancel.', {
          reply_markup: ui.cancelOnly(),
        });
        return;
      }

      const msisdn = state.temp?.msisdn;

      if (!msisdn) {
        user.state = null;
        await store.saveUser(user);
        await ctx.reply('⚠️ جلسة التحقق ضاعت. ابدأ من جديد: /start', { reply_markup: ui.backHome() });
        return;
      }

      await ctx.replyWithChatAction('typing').catch(() => {});
      try {
        const result = await engine.confirmLogin(ctx.from.id, msisdn, code);
        const fresh = await loadUser(ctx);
        // بعد التأكيد: نعرض العروض والهدايا المتاحة فوراً
        await ctx.reply(
          [
            '✅ <b>تم ربط الرقم بنجاح — تم تأكيد الحساب</b>',
            '',
            `الرقم: <code>${escapeHtml(result.account.label)}</code>`,
            `الجلسة صالحة حتى: ${escapeHtml(formatDateTime(result.expiresAt))}`,
            '',
            '🟢 <b>الآن متاح لك:</b> هدية 2 جيجا أسبوعياً · هدية الجمعة/المناسبة · بونص الدعوة',
            '🔵 وكتالوج العروض المدفوعة بأسعار واضحة.',
            '',
            'اختر من الأزرار بالأسفل 👇',
          ].join('\n'),
          {
            parse_mode: 'HTML',
            reply_markup: ui.mainMenu(menuOpts(fresh)),
          },
        );
      } catch (error) {
        const expired = [ERROR_CODES.OTP_EXPIRED, ERROR_CODES.AUTH_EXPIRED].includes(error.code);
        if (expired) {
          user.state = null;
          await store.saveUser(user);
        }
        await ctx.reply(txt.errorText(error), { parse_mode: 'HTML', reply_markup: ui.cancelOnly() });
      }
      return;
    }

    /* حالة غير معروفة */
    user.state = null;
    await store.saveUser(user);
    await ctx.reply('تمت إعادة الضبط. أرسل /menu للمتابعة.', { reply_markup: ui.backHome() });
  });

  /* أزرار غير معروفة (بعد التحديثات مثلاً) */
  bot.on('callback_query:data', async (ctx) => {
    await answer(ctx, 'هذا الخيار لم يعد متاحاً — افتح /menu');
  });

  /* معالجة الأخطاء العامة */
  bot.catch(async (error) => {
    const ctx = error.ctx;
    log.error(`خطأ في التحديث ${ctx?.update?.update_id}:`, error.error?.message || error.message);
    try {
      if (ctx?.callbackQuery) await ctx.answerCallbackQuery({ text: '⚠️ حدث خطأ، حاول مجدداً.' });
      else await ctx?.reply('⚠️ حدث خطأ غير متوقع. أرسل /menu للمتابعة.');
    } catch {
      /* لا شيء */
    }
  });

  return bot;
}

/* نسخة واحدة لكل عملية (Singleton) تُستخدم من دالة Vercel */
let cachedBot = null;

export function getBot() {
  if (!config.bot.token) return null;
  if (!cachedBot) {
    cachedBot = createBot();
    log.info(`تم تهيئة البوت (وضع جيزي: ${engine.mode})`);
  }
  return cachedBot;
}

export { engine };
export default getBot;
