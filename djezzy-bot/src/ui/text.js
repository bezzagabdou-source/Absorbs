/** نصوص البوت بالعربية (HTML — مع هروب آمن للمدخلات) */
import { escapeHtml as escape, formatDateTime, formatRelative } from '../util/time.js';

const MODE_LABEL = { simulation: '🧪 محاكاة (بدون طلبات حقيقية)', live: '🟢 مباشر' };

export const loginPrompt = () =>
  [
    '📱 <b>إضافة رقم جديد</b>',
    '',
    'أرسل رقم جيزي الآن، بصيغة محلية أو دولية:',
    '<code>05XXXXXXXX</code> أو <code>+2135XXXXXXXX</code>',
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
  const profile = overview.profile || {};
  const lines = [
    '📊 <b>حالة الحساب</b>',
    '',
    `الرقم: <code>${escape(account.label)}</code>`,
  ];

  const plan = profile.plan || profile.offer || profile.package;
  const balance = profile.balance ?? profile.credit ?? profile.solde;
  const dataLeft = profile.dataLeft ?? profile.remainingData ?? profile.data;

  if (plan) lines.push(`الباقة: ${escape(plan)}`);
  if (balance !== undefined) lines.push(`الرصيد: ${escape(balance)}`);
  if (dataLeft !== undefined) lines.push(`الإنترنت المتبقي: ${escape(dataLeft)}`);

  lines.push(
    '',
    overview.sixGbOffer
      ? `🔥 عرض 6 جيغا: <b>${overview.sixGbOffer.claimable ? 'متاح للتفعيل' : 'مُفعّل/غير متاح'}</b>`
      : '🔥 عرض 6 جيغا: <b>غير ظاهر في حسابك</b>',
    overview.weeklyGift
      ? `🎁 هدية 2 جيغا الأسبوعية: <b>${overview.weeklyGift.claimable ? 'متاحة' : 'مُستلمة'}</b>`
      : '🎁 هدية 2 جيغا الأسبوعية: <b>غير متاحة حالياً</b>',
    `\n🧪 وضع التشغيل: ${MODE_LABEL[overview.mode] || overview.mode}`,
  );

  return lines.join('\n');
}

export function activationSuccess({ label, item, data, validity }) {
  return [
    '✅ <b>تم التفعيل بنجاح</b>',
    '',
    `العملية: ${escape(label)}`,
    item ? `العرض: ${escape(item)}` : '',
    data ? `الحجم: <b>${escape(data)}</b>` : '',
    validity ? `الصلاحية: ${escape(validity)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function giftsResult(result) {
  const lines = ['🎁 <b>نتيجة استلام الهدايا</b>', ''];

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

  return lines.join('\n');
}

export function challengePrompt({ label, challengeId }) {
  return [
    '🔐 <b>خطوة تحقّق إضافية</b>',
    '',
    `جيزي تطلب تأكيداً لإتمام: ${escape(label)}.`,
    challengeId ? 'أرسل رمز/إجابة التحقق التي وصلتك الآن.' : 'أرسل رمز التحقق الذي وصلك الآن.',
    '',
    'إن لم يصلك شيء، أرسل <code>/cancel</code>.',
  ].join('\n');
}

export function errorText(error) {
  const friendly = error?.friendly || 'حدث خطأ غير متوقع.';
  const detail = error?.message && error.message !== friendly ? `\n\n<i>${escape(error.message)}</i>` : '';
  return `⚠️ ${escape(friendly)}${detail}`;
}

export function statusPage({ botConfigured, mode, storage, publicUrl, warnings }) {
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
<div class="row"><span>التخزين</span><span class="${storage === 'kv' ? 'ok' : 'warn'}">${storage === 'kv' ? 'KV دائم ✅' : 'ذاكرة مؤقتة ⚠️'}</span></div>
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
  challengePrompt,
  errorText,
  statusPage,
  formatDateTime,
};
