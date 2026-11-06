/** أدوات التحقق من أرقام الهاتف الجزائرية (Djezzy: 05x / 06x / 07x) */
import { createHash } from 'node:crypto';

const LOCAL_MOBILE = /^0([567])(\d{8})$/; // 0X XX XX XX XX
const INTL_MOBILE = /^(?:00213|213|\+213)([567]\d{8})$/;

/**
 * يطبّع الرقم إلى صيغة دولية بدون + (213XXXXXXXXX)
 * ويعيد كذلك الصيغة المحلية لعرضها للمستخدم.
 */
export function normalizeMsisdn(raw) {
  if (!raw) return { valid: false, reason: 'فارغ' };

  let digits = String(raw)
    .replace(/[\s\-().]/g, '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

  // أرقام عربية → لاتينية (المعالجة أعلاه قد تُنتج NaN إن لم تكن عربية)
  if (!/^[\d+]/.test(digits)) {
    digits = digits.replace(/[^\d+]/g, '');
  }
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;

  let national = null;

  if (LOCAL_MOBILE.test(digits)) {
    national = digits.slice(1);
  } else if (INTL_MOBILE.test(digits)) {
    national = digits.replace(/^(?:\+?213|00213)/, '');
  } else if (/^[567]\d{8}$/.test(digits)) {
    national = digits;
  }

  if (!national) {
    return { valid: false, reason: 'الرقم يجب أن يبدأ بـ 05 أو 06 أو 07 ويتكوّن من 10 أرقام' };
  }

  return {
    valid: true,
    msisdn: `213${national}`, // E.164 بدون +
    local: `0${national}`, // 0XXXXXXXXX
    masked: `0${national.slice(0, 2)} *** ** ${national.slice(-2)}`,
  };
}

/** بصمة قصيرة للرقم تُستخدم في السجلات بدل الرقم الصريح */
export function fingerprint(msisdn) {
  return createHash('sha256').update(String(msisdn)).digest('hex').slice(0, 10);
}

/** فحص صلاحية رمز التحقق (4–8 أرقام) */
export function isOtpCode(raw) {
  return /^\d{4,8}$/.test(String(raw || '').trim());
}

/** تنظيف نص المستخدم قبل إرساله إلى API خارجي */
export function safeText(raw, maxLength = 64) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}
