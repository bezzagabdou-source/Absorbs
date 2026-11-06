#!/usr/bin/env node
/**
 * 🩺 طبيب البوت — يشخّص سبب «البوت لا يستجيب» في خطوات واضحة.
 *
 *   node scripts/doctor.js                       # فحص شامل
 *   node scripts/doctor.js --fix                 # يضبط الـ Webhook تلقائياً على PUBLIC_URL
 *   node scripts/doctor.js --send 123456789      # يرسل رسالة تجريبية إلى معرّف تيليجرام
 *   node scripts/doctor.js --updates             # يقرأ التحديثات بالـ polling (بعد حذف الويبهوك)
 *
 * يعمل من جهازك (يقرأ .env) أو من داخل Vercel Shell بنفس المتغيّرات.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ---------------------- تحميل .env قبل أي import ---------------------- */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};

const { config, validateConfig } = await import('../src/config.js');
const store = (await import('../src/store/index.js')).default;

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const checks = [];
const report = (ok, title, detail = '', fix = '') => {
  checks.push({ ok, title, fix });
  const icon = ok === true ? `${C.green}✔${C.reset}` : ok === 'warn' ? `${C.yellow}!${C.reset}` : `${C.red}✘${C.reset}`;
  console.log(`${icon} ${C.bold}${title}${C.reset}${detail ? ` ${C.gray}— ${detail}${C.reset}` : ''}`);
  if (!ok && fix) console.log(`   ${C.cyan}↳ الحل: ${fix}${C.reset}`);
};

console.log(`\n${C.bold}🔥 طبيب بوت جيزي${C.reset}  ${C.gray}(Node ${process.version})${C.reset}\n`);

/* --------------------------- 1) البيئة --------------------------- */
let token = config.bot.token;
let tokenShape = /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token);

if (!token && has('--token')) token = value('--token');
if (has('--token')) tokenShape = /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token || '');

report(
  Boolean(token),
  'BOT_TOKEN موجود',
  token ? `ينتهي بـ …${String(token).slice(-4)}` : 'غير موجود',
  'أضفه في ملف .env أو متغيّرات بيئة Vercel',
);
report(tokenShape, 'BOT_TOKEN بصيغة صحيحة', tokenShape ? '123456789:AA…' : 'الصيغة غير متوقّعة', 'أعد نسخه كاملاً من @BotFather');
report(
  Boolean(config.bot.webhookSecret) && /^[A-Za-z0-9_-]{16,256}$/.test(config.bot.webhookSecret || ''),
  'WEBHOOK_SECRET صالح',
  config.bot.webhookSecret ? `${config.bot.webhookSecret.length} حرفاً` : 'مفقود',
  'node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'base64url\'))"',
);
report(
  (config.storage.encryptionKey || '').length >= 32,
  'SESSION_ENCRYPTION_KEY (≥32)',
  `${(config.storage.encryptionKey || '').length} حرفاً`,
  'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
);
report(
  store.adapter === 'kv' ? true : 'warn',
  'التخزين الدائم',
  store.adapter === 'kv' ? 'Upstash / Vercel KV' : 'ذاكرة مؤقتة (تُفقد الجلسات)',
  'أنشئ Upstash Redis واضبط KV_REST_API_URL و KV_REST_API_TOKEN',
);
report(
  Boolean(config.bot.publicUrl),
  'PUBLIC_URL',
  config.bot.publicUrl || 'غير معروف',
  'PUBLIC_URL=https://<project>.vercel.app',
);
report(
  config.djezzy.dryRun ? 'warn' : true,
  'وضع محرّك جيزي',
  config.djezzy.dryRun ? 'محاكاة — لن تُفعّل عروض حقيقية' : 'مباشر',
  'DJEZZY_BASE_URL=… و DJEZZY_DRY_RUN=false',
);

for (const warning of validateConfig()) console.log(`   ${C.gray}• ${warning}${C.reset}`);

/* --------------------------- 2) التخزين --------------------------- */
const storageOk = await store.ping();
report(storageOk, 'الاتصال بالتخزين', storageOk ? 'سليم' : 'فشل', 'تحقّق من KV_REST_API_URL/TOKEN');

/* ------------------------- 3) تيليجرام API ------------------------- */
if (!token) {
  console.log(`\n${C.red}لا يمكن متابعة الفحص بدون BOT_TOKEN.${C.reset}\n`);
  process.exit(1);
}

const { Bot } = await import('grammy');
const bot = new Bot(token);

let me = null;
try {
  me = await bot.api.getMe();
  report(true, 'التوكن صالح لدى تيليجرام', `@${me.username} (${me.id})`);
} catch (error) {
  const description = error?.description || error?.message || String(error);
  const isAuth = error?.error_code === 401 || /unauthorized/i.test(description);
  report(
    false,
    'التوكن صالح لدى تيليجرام',
    description,
    isAuth
      ? 'التوكن ملغى أو خاطئ — أنشئ واحداً جديداً: @BotFather → /mybots → API Token → Revoke'
      : 'تحقّق من الشبكة/الجدار الناري (api.telegram.org محجوب؟)',
  );
}

if (me) {
  /* ---- الأوامر ---- */
  try {
    await bot.api.setMyCommands([
      { command: 'start', description: 'القائمة الرئيسية' },
      { command: 'menu', description: 'عرض الأزرار' },
      { command: 'cancel', description: 'إلغاء العملية' },
      { command: 'help', description: 'شرح الاستخدام' },
    ]);
    report(true, 'أوامر البوت مسجّلة', '/start /menu /cancel /help');
  } catch (error) {
    report('warn', 'تسجيل الأوامر', error?.description || error?.message);
  }

  /* ---- الويبهوك ---- */
  try {
    const info = await bot.api.getWebhookInfo();
    const expected = config.bot.publicUrl ? `${config.bot.publicUrl}/api/webhook` : null;

    if (has('--updates')) {
      await bot.api.deleteWebhook({ drop_pending_updates: false });
      report('warn', 'تم حذف الويبهوك مؤقتاً', 'اقرأ التحديثات الآن عبر polling');
    }

    report(Boolean(info.url), 'Webhook مضبوط', info.url || 'لا يوجد', 'شغّل: node scripts/doctor.js --fix');
    if (info.url && expected) {
      report(info.url === expected, 'Webhook يطابق PUBLIC_URL', info.url, `أعد الضبط على ${expected}`);
    }
    report(
      !info.last_error_message,
      'آخر تسليم من تيليجرام',
      info.last_error_message
        ? `${info.last_error_message} — ${new Date((info.last_error_date || 0) * 1000).toISOString()}`
        : 'بلا أخطاء',
      '401 = سرّ الويبهوك لا يطابق WEBHOOK_SECRET | 404 = المسار غير موجود (تحقّق من Root Directory على Vercel)',
    );
    report(
      info.pending_update_count < 20,
      'تحديثات معلّقة',
      String(info.pending_update_count),
      'تراكمها يعني أن الخدمة تستقبل ولا ترد',
    );

    if (has('--fix') && config.bot.publicUrl) {
      const url = `${config.bot.publicUrl}/api/webhook`;
      await bot.api.setWebhook(url, {
        secret_token: config.bot.webhookSecret || undefined,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
      });
      report(true, 'تم ضبط الـ Webhook تلقائياً', url, 'أرسل /start للبوت الآن');
      const after = await bot.api.getWebhookInfo();
      report(true, 'تأكيد:', after.url);
    }
  } catch (error) {
    report(false, 'فحص الـ Webhook', error?.description || error?.message, 'أعد المحاولة أو تحقّق من الشبكة');
  }

  /* ---- فحص الخدمة المنشورة ---- */
  if (config.bot.publicUrl) {
    try {
      const response = await fetch(`${config.bot.publicUrl}/health`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      report(
        response.ok && data?.ok,
        'الخدمة المنشورة تستجيب',
        `${response.status} — botConfigured=${data?.bot?.configured} mode=${data?.djezzy?.mode} storage=${data?.storage?.adapter}`,
        'تحقّق أن Vercel نشر المشروع بنجاح وأن Root Directory = djezzy-bot',
      );
      if (data?.updatesReceived === 0) {
        report('warn', 'لا تحديثات وصلت للخدمة بعد', 'أرسل /start ثم أعد الفحص', 'إن استمر الصفر فطلبات تيليجرام لا تصل — أعد ضبط الويبهوك');
      }
    } catch (error) {
      report(false, 'الخدمة المنشورة تستجيب', error.message, 'افتح https://<project>.vercel.app/health في المتصفح');
    }
  }

  /* ---- رسالة تجريبية ---- */
  const chatId = value('--send');
  if (chatId) {
    try {
      await bot.api.sendMessage(
        chatId,
        `✅ اختبار من طبيب البوت\nالزمن: ${new Date().toISOString()}\nالوضع: ${config.djezzy.dryRun ? 'محاكاة' : 'مباشر'}`,
      );
      report(true, 'إرسال رسالة تجريبية', `إلى ${chatId}`);
    } catch (error) {
      report(false, 'إرسال رسالة تجريبية', error?.description || error?.message, 'تأكد أنك بدأت محادثة مع البوت أولاً (اضغط Start)');
    }
  }
}

/* ------------------------------ الخلاصة ------------------------------ */
const failures = checks.filter((check) => check.ok === false);
const warnings = checks.filter((check) => check.ok === 'warn');

console.log(`\n${'-'.repeat(56)}`);
if (failures.length === 0) {
  console.log(`${C.green}${C.bold}كل الفحوصات الحرجة ناجحة.${C.reset}`);
  if (warnings.length) console.log(`${C.yellow}تنبيهات (لا تمنع العمل): ${warnings.length}${C.reset}`);
  console.log(`${C.gray}إن بقي البوت صامتاً: أرسل /start، ثم راقب Logs على Vercel وابحث عن "webhook ←".${C.reset}`);
} else {
  console.log(`${C.red}${C.bold}مشاكل يجب إصلاحها (${failures.length}):${C.reset}`);
  for (const failure of failures) {
    console.log(`${C.red}✘${C.reset} ${failure.title}${failure.fix ? `\n   ${C.cyan}↳ ${failure.fix}${C.reset}` : ''}`);
  }
}
console.log(`${'-'.repeat(56)}\n`);

process.exit(failures.length ? 1 : 0);
