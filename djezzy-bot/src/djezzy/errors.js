/** أخطاء محرّك جيزي — تحمل رمزاً واضحاً ورسالة عربية جاهزة للعرض */
export const ERROR_CODES = {
  CONFIG: 'CONFIG',
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  AUTH: 'AUTH',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  OFFER_NOT_FOUND: 'OFFER_NOT_FOUND',
  OFFER_ALREADY_ACTIVE: 'OFFER_ALREADY_ACTIVE',
  CHALLENGE_REQUIRED: 'CHALLENGE_REQUIRED',
  BALANCE: 'BALANCE',
  QUOTA: 'QUOTA',
  UNKNOWN: 'UNKNOWN',
};

const FRIENDLY = {
  [ERROR_CODES.CONFIG]: 'إعدادات محرّك جيزي غير مكتملة.',
  [ERROR_CODES.NETWORK]: 'تعذّر الوصول إلى خوادم جيزي. تحقّق من الشبكة وحاول لاحقاً.',
  [ERROR_CODES.TIMEOUT]: 'استغرق الطلب وقتاً طويلاً. أعد المحاولة.',
  [ERROR_CODES.AUTH]: 'بيانات الجلسة غير صالحة — أعد إضافة الرقم.',
  [ERROR_CODES.AUTH_EXPIRED]: 'انتهت صلاحية الجلسة — أعد تسجيل الدخول برمز تحقق جديد.',
  [ERROR_CODES.OTP_INVALID]: 'رمز التحقق غير صحيح.',
  [ERROR_CODES.OTP_EXPIRED]: 'انتهت صلاحية رمز التحقق — اطلب رمزاً جديداً.',
  [ERROR_CODES.RATE_LIMITED]: 'طلبات كثيرة جداً على حساب جيزي. انتظر قليلاً ثم أعد المحاولة.',
  [ERROR_CODES.OFFER_NOT_FOUND]: 'لم يُعثر على هذا العرض في حسابك (قد يكون غير متاح لشريحتك).',
  [ERROR_CODES.OFFER_ALREADY_ACTIVE]: 'هذا العرض مُفعّل بالفعل على رقمك.',
  [ERROR_CODES.CHALLENGE_REQUIRED]: 'جيزي تطلب خطوة تحقّق إضافية لإتمام التفعيل.',
  [ERROR_CODES.BALANCE]: 'الرصيد غير كافٍ أو الشريحة غير مؤهّلة لهذا العرض.',
  [ERROR_CODES.QUOTA]: 'تجاوزت الحد المسموح من العمليات.',
  [ERROR_CODES.UNKNOWN]: 'حدث خطأ غير متوقع أثناء تنفيذ الطلب.',
};

export class DjezzyError extends Error {
  constructor(code, message, meta = {}) {
    super(message || FRIENDLY[code] || FRIENDLY[ERROR_CODES.UNKNOWN]);
    this.name = 'DjezzyError';
    this.code = code || ERROR_CODES.UNKNOWN;
    this.status = meta.status ?? null;
    this.payload = meta.payload ?? null;
    this.retryable = Boolean(meta.retryable);
  }

  get friendly() {
    return FRIENDLY[this.code] || FRIENDLY[ERROR_CODES.UNKNOWN];
  }

  toJSON() {
    return { code: this.code, message: this.message, status: this.status };
  }
}

/** يحوّل خطأ axios إلى DjezzyError برمز مفهوم
 *  @param context.expect 'otp' يعني أن الطلب على مسار رمز التحقق
 *  فتُفسَّر أخطاء 4xx كرمز خاطئ لا كجلسة منتهية.
 */
export function normalizeError(error, context = {}) {
  if (error instanceof DjezzyError) return error;

  const status = error?.response?.status ?? null;
  const payload = error?.response?.data ?? null;
  const detail =
    (typeof payload === 'string' ? payload : null) ||
    payload?.message ||
    payload?.error_description ||
    payload?.error?.message ||
    payload?.error ||
    payload?.msg ||
    error?.message ||
    'خطأ غير معروف';

  if (error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message))) {
    return new DjezzyError(ERROR_CODES.TIMEOUT, `انتهت مهلة الطلب: ${detail}`, { status, retryable: true });
  }
  if (!error?.response) {
    return new DjezzyError(ERROR_CODES.NETWORK, `تعذّر الاتصال: ${detail}`, { status, retryable: true });
  }

  const text = String(typeof payload === 'string' ? payload : JSON.stringify(payload ?? '') + detail).toLowerCase();

  const otpWord = /otp|code|verification|رمز|التحقق/.test(text);
  const expiredWord = /expired|expiré|منته|périmé/.test(text);
  const sessionWord = /token|session|jwt|جلسة/.test(text);

  const code =
    // مسارات OTP: أي 4xx يعني رمزاً خاطئاً أو منتهياً
    (context.expect === 'otp' && status >= 400 && status < 500 && status !== 429)
      ? (expiredWord ? ERROR_CODES.OTP_EXPIRED : ERROR_CODES.OTP_INVALID)
      : /otp|code.*(invalid|incorrect|wrong)|رمز/.test(text) && (expiredWord || status < 500)
        ? (expiredWord ? ERROR_CODES.OTP_EXPIRED : ERROR_CODES.OTP_INVALID)
        : status === 429
          ? ERROR_CODES.RATE_LIMITED
          : status === 401 || status === 403
            ? ERROR_CODES.AUTH_EXPIRED
            : expiredWord && sessionWord
              ? ERROR_CODES.AUTH_EXPIRED
              : expiredWord && otpWord
                ? ERROR_CODES.OTP_EXPIRED
                : /already|déjà|مسبق/.test(text)
                  ? ERROR_CODES.OFFER_ALREADY_ACTIVE
                  : /balance|solde|رصيد/.test(text)
                    ? ERROR_CODES.BALANCE
                    : ERROR_CODES.UNKNOWN;

  return new DjezzyError(code, detail, { status, payload, retryable: status >= 500 || status === 429 });
}
