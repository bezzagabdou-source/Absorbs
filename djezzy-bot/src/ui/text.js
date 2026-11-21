/** نصوص البوت بالعربية (HTML — مع هروب آمن للمدخلات) */
import { escapeHtml as escape, formatDateTime, formatRelative } from '../util/time.js';
import { PAID_OFFERS } from '../djezzy/catalog.js';

const MODE_LABEL = { simulation: '🧪 محاكاة (بدون طلبات حقيقية)', live: '🟢 مباشر' };

export const loginPrompt = () =>
  [
    '📱 <b>إضافة رقم جديد</b>',
    '',
    'أرسل رقم جيزي الآن (أرقام 07 فقط):',
    '<code>07XXXXXXXX</code> أو <code>+2137XXXXXXXX</code>',
    '',
    'سنرسل إليك رمز تحقق (OTP) على الرقم نفسه.',
    '',
    '⚠️ أضف فقط الأرقام التي تملكها — استخدم البوت على مسؤوليتك ووفق شروط جيزي.',
  ].join('\n');

export const otpPrompt = ({ masked, expiresIn = 120, debugCode = null }) =>
  [
    '🔐 <b>رمز التحقق</b>',
    '',
    `أرسلنا رمزاً من 4–8 أرقام إلى <b>${escape(masked)}</b>.`,
    `أدخل الرمز هنا خلال ${Number(expiresIn) || 120} ثانية.`,
    debugCode ? `\n🧪 رمز المحاكاة: <code>${escape(debugCode)}</code>` : '',
    '',
    'لم يصلك الرمز؟ أرسل <code>/cancel</code> ثم أعد المحاولة.',
  ]
    .filter(Boolean)
    .join('\n');

export function mainMenuText({ name, user, mode, maxNumbers }) {
  const accounts = Object.values(user.accounts || {});
  const active = user.activeMsisdn ? user.accounts[user.activeMsisdn] : null;

  const lines = [
    `🔥 <b>بوت جيزي</b> — مرحباً ${escape(name || 'بك')}`,
    '',
    `الوضع: ${MODE_LABEL[mode] || mode}`,
    `الأرقام المربوطة: <b>${accounts.length}/${maxNumbers}</b>`,
  ];

  if (active) {
    lines.push(
      `الرقم النشط: <code>${escape(active.label)}</code>`,
      `الجلسة: ${active.sessionValid ? '✅ صالحة' : '⚠️ تحتاج تجديداً'}`,
    );
  } else {
    lines.push('', 'لا يوجد رقم مربوط بعد — ابدأ بـ «📱 إضافة رقم جديد».');
  }

  lines.push('', 'اختر العملية من الأزرار بالأسفل 👇');
  return lines.join('\n');
}

export function accountsText(accounts, activeMsisdn) {
  if (accounts.length === 0) {
    return '⚙️ <b>إدارة الأرقام</b>\n\nلا توجد أرقام مربوطة حالياً.';
  }

  const lines = ['⚙️ <b>إدارة الأرقام</b>', ''];
  for (const account of accounts) {
    const active = account.msisdn === activeMsisdn ? ' ✅ <i>نشط</i>' : '';
    lines.push(
      `• <code>${escape(account.label)}</code>${active}`,
      `   أُضيف ${escape(formatRelative(account.addedAt))} • الجلسة ${account.sessionValid ? 'صالحة' : 'منتهية'}`,
      '',
    );
  }
  lines.push('اضغط على رقم لتفعيله، أو «🗑 حذف رقم» لإزالته.');
  return lines.join('\n');
}

export function overviewText({ account, overview }) {
  const lines = [
    '📊 <b>حالة الحساب</b>',
    '',
    `الرقم: <code>${escape(account.label)}</code>`,
    `حالة الجلسة: ${account.sessionValid ? '✅ صالحة' : '⚠️ تحتاج تجديداً'}`,
    '',
    overview.lastWeeklyAt
      ? `🎁 آخر هدية 2 جيجا: ${escape(formatDateTime(overview.lastWeeklyAt))}`
      : '🎁 لم تستلم هدية 2 جيجا من هذا البوت بعد',
  ];

  if (overview.nextEligibleAt) {
    lines.push(
      overview.canClaimNow
        ? '✅ يحق لك استلام هدية جديدة الآن'
        : `⏳ الهدية القادمة: ${escape(formatDateTime(overview.nextEligibleAt))}`,
    );
  }

  if (overview.recent?.length) {
    lines.push('', '<b>آخر الاشتراكات:</b>');
    for (const item of overview.recent) {
      lines.push(`• <code>${escape(item.code)}</code>${item.at ? ` — ${escape(formatDateTime(item.at))}` : ''}`);
    }
  }

  lines.push(
    '',
    overview.promoConfigured ? '🌟 الهدية الترويجية (QR): متاحة للتجربة' : '🌟 الهدية الترويجية: غير مضبوطة',
    `🧪 وضع التشغيل: ${MODE_LABEL[overview.mode] || overview.mode}`,
  );

  return lines.join('\n');
}

export const SIMULATION_BANNER =
  '🧪 <b>وضع المحاكاة:</b> هذه النتيجة تجريبية — لم يُرسل أي طلب حقيقي إلى جيزي ولم تُضف أي بيانات.\nللتشغيل الحقيقي: يلزم ضبط مسارات API الخاصة بحسابك (DJEZZY_BASE_URL / DJEZZY_PATH_*) و DJEZZY_DRY_RUN=false.';

export function activationSuccess({ label, item, data, validity, simulated = false }) {
  return [
    simulated ? '🧪 <b>محاكاة ناجحة</b> (لا بيانات حقيقية)' : '✅ <b>تم التفعيل بنجاح</b>',
    '',
    `العملية: ${escape(label)}`,
    item ? `العرض: ${escape(item)}` : '',
    data ? `الحجم: <b>${escape(data)}</b>` : '',
    validity ? `الصلاحية: ${escape(validity)}` : '',
    simulated ? `\n${SIMULATION_BANNER}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function giftsResult(result, { simulated = false } = {}) {
  if (result.status === 'cooldown') {
    return [
      '⏳ <b>الهدية مُستلمة مسبقاً</b>',
      '',
      result.lastAt ? `آخر استلام: ${escape(formatDateTime(result.lastAt))}` : '',
      result.nextEligibleAt ? `المتاح التالي: ${escape(formatDateTime(result.nextEligibleAt))}` : '',
      '',
      'هدية 2 جيجا متاحة مرة واحدة كل 7 أيام.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const lines = [simulated ? '🧪 <b>نتيجة استلام الهدايا (محاكاة)</b>' : '🎁 <b>نتيجة استلام الهدايا</b>', ''];

  if (result.claimed?.length) {
    lines.push('<b>تم الاستلام:</b>');
    for (const gift of result.claimed) {
      lines.push(`✅ ${escape(gift.name)}${gift.data ? ` — ${escape(gift.data)}` : ''}`);
    }
  }

  if (result.failed?.length) {
    lines.push('', '<b>لم يتم الاستلام:</b>');
    for (const gift of result.failed) {
      lines.push(`• ${escape(gift.name)} — ${escape(gift.reason)}`);
    }
  }

  if (!result.claimed?.length && !result.failed?.length) {
    lines.push('لا توجد هدايا متاحة الآن.');
  }

  if (simulated) lines.push('', SIMULATION_BANNER);

  return lines.join('\n');
}

const SILENT_DETAIL = new Set(['TIMEOUT', 'NETWORK']);

const GEO_HINT = [
  '',
  '🌍 <b>السبب:</b> خوادم جيزي تقبل الاتصال من الشبكات الجزائرية بشكل موثوق،',
  'وقد تحجب الاستضافة الحالية (Vercel…). البوت يجرّب تلقائياً: relay ← مباشر ← بروكسيات جزائرية.',
  '',
  '✅ <b>الحل:</b> شغّل relay صغير داخل الجزائر واربطه:',
  '<code>cd djezzy-bot/relay && npm install && npm start</code>',
  'ثم اضبط <code>DJEZZY_RELAY_URL</code> على Vercel وأعد النشر.',
  '',
  'أو شغّل البوت كاملاً من جهازك داخل الجزائر: <code>npm run poll</code>.',
].join('\n');

export function errorText(error) {
  const friendly = error?.friendly || 'حدث خطأ غير متوقع.';
  const silent = SILENT_DETAIL.has(error?.code);
  const detail =
    !silent && error?.message && error.message !== friendly ? `\n\n<i>${escape(error.message)}</i>` : '';
  const hint = silent ? `\n${GEO_HINT}` : '';
  return `⚠️ ${escape(friendly)}${detail}${hint}`;
}

/* ------------------------- نصوص الكتالوج والتحقق ------------------------- */

export function verifiedWelcome({ label }) {
  return [
    '✅ <b>تم تأكيد الحساب — العروض متاحة الآن</b>',
    '',
    `الرقم: <code>${escape(label)}</code>`,
    '',
    '🟢 <b>هدايا مجانية:</b> 2 جيغا أسبوعياً · هدية الجمعة/المناسبة · بونص الدعوة',
    '🔵 <b>عروض مدفوعة:</b> باقات يومية/أسبوعية/شهرية بأسعار واضحة',
    '',
    'اختر من الأزرار بالأسفل 👇',
  ].join('\n');
}

export function catalogText(kind, { mode } = {}) {
  if (kind === 'free') {
    return [
      '🟢 <b>الهدايا المجانية من جيزي</b>',
      '',
      '🎁 <b>هدية 2 جيجا الأسبوعية</b> — كل أسبوع بضغطة واحدة (Walk Win).',
      '🎀 <b>هدية الجمعة/المناسبة</b> — هدايا QR التي تُطلقها جيزي في الحملات والمباريات.',
      '👥 <b>بونص الدعوة</b> — أدخل رقم صديق جيزي واحصلا معاً على البونص.',
      '',
      'كل ما سبق مجاني 100% ولا يخصم من رصيدك.',
      mode === 'simulation' ? '\n🧪 وضع المحاكاة مفعّل — لا تُرسل طلبات حقيقية.' : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const preview = PAID_OFFERS.slice(0, 5)
    .map((offer) => `• ${escape(offer.name)}`)
    .join('\n');
  const lines = [
    '🔵 <b>العروض المدفوعة</b>',
    '',
    'هذه عروض تُخصم قيمتها من رصيد جيزي — السعر موضح أمام كل عرض.',
    'لن يُفعَّل أي عرض إلا بعد تأكيدك الصريح في الخطوة التالية.',
    '',
    '<b>أبرز العروض:</b>',
    preview,
    '',
  ];
  if (mode === 'simulation') lines.push('🧪 وضع المحاكاة مفعّل — لا تُرسل طلبات حقيقية.\n');
  lines.push('اضغط على العرض الذي تريده 👇');
  return lines.join('\n');
}

export function offerConfirmText(offer, { simulated = false } = {}) {
  return [
    `🔵 <b>تأكيد تفعيل العرض</b>`,
    '',
    `العرض: <b>${escape(offer.name)}</b>`,
    offer.detail ? `التفاصيل: ${escape(offer.detail)}` : '',
    `السعر: <b>${offer.price != null ? `${escape(String(offer.price))} دج` : 'حسب الباقة'}</b>`,
    '',
    '⚠️ سيُرسل طلب حقيقي إلى جيزي وقد يُخصم المبلغ من رصيدك.',
    simulated ? '\n🧪 وضع المحاكاة: لن يُخصم شيء فعلياً.' : '',
    '',
    'هل تريد المتابعة؟',
  ]
    .filter(Boolean)
    .join('\n');
}

export const mgmPrompt = () =>
  [
    '👥 <b>بونص الدعوة (MGM)</b>',
    '',
    'أرسل رقم صديق جيزي الآن (07XXXXXXXX):',
    '<code>07XXXXXXXX</code>',
    '',
    'سيُرسل الطلب إلى جيزي لربط الدعوة بحسابك.',
  ].join('\n');

export function mgmResult(result, { simulated = false } = {}) {
  const header = result.ok ? '✅' : '⚠️';
  const lines = [`${header} <b>نتيجة بونص الدعوة</b>`, ''];
  lines.push(result.ok ? 'تم إرسال طلب الدعوة إلى جيزي بنجاح.' : escape(result.message || 'فشل إرسال الدعوة.'));
  if (simulated) lines.push('', '🧪 وضع المحاكاة: لم يُرسل طلب حقيقي.');
  return lines.join('\n');
}

export function statusPage({ botConfigured, mode, storage, publicUrl, warnings }) {
  const storageLabel = { kv: 'KV دائم ✅', github: 'GitHub دائم ✅', file: 'ملف محلي ✅', memory: 'ذاكرة مؤقتة ⚠️' }[storage] || storage;
  const items = warnings.map((warning) => `<li>${escape(warning)}</li>`).join('');
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>بوت جيزي — حالة الخدمة</title>
<style>
 body{font-family:system-ui,"Segoe UI",Tahoma,sans-serif;background:#0b1020;color:#e8ecf5;margin:0;padding:40px 20px;line-height:1.7}
 .card{max-width:640px;margin:auto;background:#141b33;border:1px solid #24304f;border-radius:16px;padding:28px}
 h1{font-size:22px;margin:0 0 6px} .muted{color:#93a0bd;font-size:14px}
 .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #24304f}
 .ok{color:#5ee0a0}.warn{color:#ffcf5c}
 ul{padding-inline-start:20px;font-size:14px;color:#ffcf5c}
 code{background:#0b1020;padding:2px 6px;border-radius:6px;font-size:13px}
</style></head><body><div class="card">
<h1>🔥 بوت جيزي</h1>
<p class="muted">خدمة Webhook — Node.js / grammy / Vercel</p>
<div class="row"><span>حالة البوت</span><span class="${botConfigured ? 'ok' : 'warn'}">${botConfigured ? 'مُهيّأ ✅' : 'BOT_TOKEN مفقود ⚠️'}</span></div>
<div class="row"><span>محرّك جيزي</span><span class="${mode === 'live' ? 'ok' : 'warn'}">${mode === 'live' ? 'مباشر 🟢' : 'محاكاة 🧪'}</span></div>
<div class="row"><span>التخزين</span><span class="${storage === 'kv' || storage === 'github' || storage === 'file' ? 'ok' : 'warn'}">${storageLabel}</span></div>
<div class="row"><span>عنوان الخدمة</span><span><code>${escape(publicUrl || '—')}</code></span></div>
${items ? `<p class="muted">ملاحظات الإعداد:</p><ul>${items}</ul>` : ''}
<p class="muted">Webhook: <code>POST ${escape(publicUrl || '')}/api/webhook</code></p>
</div></body></html>`;
}

export default {
  loginPrompt,
  otpPrompt,
  mainMenuText,
  accountsText,
  overviewText,
  activationSuccess,
  giftsResult,
  errorText,
  statusPage,
  verifiedWelcome,
  catalogText,
  offerConfirmText,
  mgmPrompt,
  mgmResult,
  formatDateTime,
};
