/** أدوات التحقق من أرقام الهاتف الجزائرية — البوت يقبل أرقام جيزي فقط (+2137…) */
import { createHash } from 'node:crypto';
import config from '../config.js';

const NATIONAL = /^[567]\d{8}$/; // 9 أرقام وطنية
const LOCAL = /^0([567]\d{8})$/; // 0X XX XX XX XX

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

  if (LOCAL.test(digits)) {
    national = digits.slice(1);
  } else if (/^(?:\+?213|00213)[567]\d{8}$/.test(digits)) {
    national = digits.replace(/^(?:\+?213|00213)/, '');
  } else if (NATIONAL.test(digits)) {
    national = digits;
  }

  if (!national) {
    return { valid: false, reason: 'أرسل رقم جيزي صحيحاً: 07XXXXXXXX أو +2137XXXXXXXX' };
  }

  const allowed = config.limits.allowedPrefixes;
  if (allowed.length > 0 && !allowed.includes(national[0])) {
    return {
      valid: false,
      reason: 'هذا البوت يدعم أرقام جيزي فقط (+2137…) — الأرقام التي تبدأ بـ 05 أو 06 غير مدعومة',
    };
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
