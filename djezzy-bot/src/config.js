/**
 * إعدادات المشروع — تُقرأ كلها من متغيّرات البيئة مع قيم افتراضية حقيقية
 * مستخرجة من واجهة تطبيق جيزي العمومية (معرّفات التطبيق موجودة في كل النسخ
 * المنشورة للتطبيق على GitHub — وليست أسراراً خاصة).
 * توكن تيليجرام (BOT_TOKEN) يبقى إلزامياً في البيئة ولا يُكتب هنا أبداً.
 */
import process from 'node:process';

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const stripSlash = (value) => String(value ?? '').trim().replace(/\/+$/, '');

const vercelUrl = () => {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '';
  return host ? `https://${host}` : '';
};

/* ------------------- معرّفات تطبيق جيزي (عمومية/معلنة) ------------------- */
// الزوج الحالي المستخدم في تطبيق Djezzy Android (موجود في كل سكربت مفتوح المصدر).
const DEFAULT_CLIENT_ID = '6E6CwTkp8H1CyQxraPmcEJPQ7xka';
const DEFAULT_CLIENT_SECRET = 'MVpXHW_ImuMsxKIwrJpoVVMHjRsa';
// زوج نسخ أقدم من التطبيق (يُجرَّب تلقائياً عند رفض الزوج الأول).
const DEFAULT_LEGACY_CLIENT_ID = '87pIExRhxBb3_wGsA5eSEfyATloa';
const DEFAULT_LEGACY_CLIENT_SECRET = 'uf82p68Bgisp8Yg1Uz8Pf6_v1XYa';

/* ------------------------- محرّك جيزي (الواجهة الحقيقية) ------------------------- */
const djezzyBaseUrl = stripSlash(process.env.DJEZZY_BASE_URL || 'https://apim.djezzy.dz');

/**
 * المسارات الحقيقية المؤكَّدة من عدة سكربتات تعمل فعلياً مع جيزي:
 *  - OTP:        POST /oauth2/registration   (form: msisdn + client_id + scope=smsotp)
 *  - التوكن:     POST /oauth2/token          (form: otp + mobileNumber + grant_type=mobile)
 *  - تفعيل المنتجات/الهدايا: POST /djezzy-api/api/v1/subscribers/{msisdn}/subscription-product
 *  - هدية QR:    POST /mobile-api/api/v1/services/scan/activate-reward/{msisdn}
 *  - دعوة صديق: POST /djezzy-api/api/v1/subscribers/{msisdn}/member-get-member
 *  - البروفايل:  GET  /djezzy-api/api/v1/subscribers/{msisdn}
 */
const djezzyPaths = {
  requestOtp: process.env.DJEZZY_PATH_REQUEST_OTP || '/oauth2/registration',
  verifyOtp: process.env.DJEZZY_PATH_VERIFY_OTP || '/oauth2/token',
  refresh: process.env.DJEZZY_PATH_REFRESH || '/oauth2/token',
  subscriptionProduct: process.env.DJEZZY_PATH_SUBSCRIPTION_PRODUCT || '/djezzy-api/api/v1/subscribers/{msisdn}/subscription-product?include=',
  subscriber: process.env.DJEZZY_PATH_SUBSCRIBER || '/djezzy-api/api/v1/subscribers/{msisdn}',
  memberGetMember: process.env.DJEZZY_PATH_MGM || '/djezzy-api/api/v1/subscribers/{msisdn}/member-get-member?include=',
  scanReward: process.env.DJEZZY_PATH_SCAN_REWARD || '/mobile-api/api/v1/services/scan/activate-reward/{msisdn}',
  history: process.env.DJEZZY_PATH_HISTORY || '/mobile-api/api/v1/subscribers/subscription-history/{msisdn}',
};

const djezzyClientId = (process.env.DJEZZY_CLIENT_ID || DEFAULT_CLIENT_ID).trim();
const djezzyClientSecret = (process.env.DJEZZY_CLIENT_SECRET || DEFAULT_CLIENT_SECRET).trim();

export const config = {
  isVercel: Boolean(process.env.VERCEL),

  bot: {
    token: (process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    publicUrl: stripSlash(process.env.PUBLIC_URL) || stripSlash(vercelUrl()),
    webhookSecret: (process.env.WEBHOOK_SECRET || '').trim(),
    allowedTelegramIds: (process.env.ALLOWED_TELEGRAM_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  },

  storage: {
    kvUrl: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim(),
    kvToken: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim(),
    encryptionKey: (process.env.SESSION_ENCRYPTION_KEY || '').trim(),
    userTtlSeconds: int(process.env.USER_TTL_SECONDS, 60 * 60 * 24 * 180),
    // تخزين عبر مستودع GitHub (بديل دائم عن KV يعمل على Vercel بدون إعداد إضافي)
    githubToken: (process.env.STATE_GITHUB_TOKEN || '').trim(),
    githubRepo: (process.env.STATE_GITHUB_REPO || '').trim(),
    githubBranch: (process.env.STATE_GITHUB_BRANCH || 'bot-state').trim(),
    githubDir: (process.env.STATE_GITHUB_DIR || 'state').trim(),
  },

  djezzy: {
    baseUrl: djezzyBaseUrl,
    paths: djezzyPaths,
    clientId: djezzyClientId,
    clientSecret: djezzyClientSecret,
    legacyClientId: (process.env.DJEZZY_CLIENT_ID_LEGACY || DEFAULT_LEGACY_CLIENT_ID).trim(),
    legacyClientSecret: (process.env.DJEZZY_CLIENT_SECRET_LEGACY || DEFAULT_LEGACY_CLIENT_SECRET).trim(),
    userAgent: process.env.DJEZZY_USER_AGENT || 'Djezzy/2.7.5',
    // هدية 2 جيجا الأسبوعية (Walk Win) — الحمولة الحقيقية المعتمدة في كل السكربتات
    walkProductId: process.env.DJEZZY_WALK_PRODUCT_ID || 'GIFTWALKWIN',
    giftWalkCode: process.env.DJEZZY_GIFT_WALK_CODE || 'GIFTWALKWIN2GO',
    walkServiceId: process.env.DJEZZY_WALK_SERVICE_ID || 'WALKWIN',
    walkSteps: int(process.env.DJEZZY_WALK_STEPS, 10000),
    // هدية QR (هدايا المناسبات/المباريات/الجمعة) — الرابط يُحدَّث حسب الحملة
    scanQr: process.env.DJEZZY_SCAN_QR || 'https://www.djezzy.dz/scanwin-wd26?1',
    // باقة مدفوعة اختيارية — لا تُفعَّل تلقائياً أبداً (قد تُخصم من الرصيد)
    paidProductCode: (process.env.OFFER_PAID_CODE || '').trim(),
    // الوضع المباشر افتراضياً الآن (بيانات التطبيق مضمّنة) — جرّب DJEZZY_DRY_RUN=true للمحاكاة
    dryRun: bool(process.env.DJEZZY_DRY_RUN, false),
    timeoutMs: int(process.env.DJEZZY_TIMEOUT_MS, 20000),
    // -------- المسارات البديلة لتجاوز الحجب الجغرافي --------
    // بروكسيات جزائرية يدوية: DJEZZY_PROXIES="http://user:pass@host:port,host:port:user:pass"
    proxies: (process.env.DJEZZY_PROXIES || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    // اكتشاف بروكسيات جزائرية عمومية تلقائياً عند فشل الاتصال المباشر
    autoProxy: bool(process.env.DJEZZY_AUTO_PROXY, true),
    // خادم وسيط (relay) تشغّله أنت داخل الجزائر — أنجح حل عند الحجب
    relayUrl: stripSlash(process.env.DJEZZY_RELAY_URL || ''),
    relayToken: (process.env.DJEZZY_RELAY_TOKEN || '').trim(),
    // السماح بالاتصال المباشر (عطّله بـ 0 إن كنت تعرف أن Vercel محجوب تماماً)
    direct: bool(process.env.DJEZZY_DIRECT, true),
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'Accept-Language': process.env.DJEZZY_ACCEPT_LANGUAGE || 'fr',
    },
  },

  limits: {
    maxNumbersPerUser: int(process.env.MAX_NUMBERS_PER_USER, 2),
    actionCooldownMs: int(process.env.ACTION_COOLDOWN_MS, 15000),
    maxClaimsPerDay: int(process.env.MAX_CLAIMS_PER_DAY, 6),
    // أرقام جيزي فقط (+2137) — يمكن فتحها لأرقام أخرى عبر ALLOWED_PREFIXES
    allowedPrefixes: (process.env.ALLOWED_PREFIXES || '7')
      .split(',')
      .map((prefix) => prefix.trim())
      .filter(Boolean),
  },
};

/** فحص الإعدادات الحرجة وإرجاع قائمة تحذيرات (لا تُسقط الدالة) */
export function validateConfig() {
  const warnings = [];

  if (!config.bot.token) warnings.push('BOT_TOKEN غير مضبوط — لن يعمل البوت.');
  if (
    config.isVercel &&
    !config.storage.kvUrl &&
    !config.storage.githubToken &&
    !config.bot.token
  ) {
    warnings.push(
      'لا يوجد تخزين دائم (KV أو GitHub أو تيليجرام) — ستُفقد الجلسات عند كل إعادة تشغيل باردة.',
    );
  }
  if (!config.storage.encryptionKey || config.storage.encryptionKey.length < 32) {
    warnings.push('SESSION_ENCRYPTION_KEY مفقود أو أقصر من 32 حرفاً — سيُستخدم مفتاح مؤقت (غير آمن للتشغيل الحقيقي).');
  }
  if (!config.bot.webhookSecret || !/^[A-Za-z0-9_-]{16,256}$/.test(config.bot.webhookSecret)) {
    warnings.push('WEBHOOK_SECRET مفقود أو غير صالح (16–256 حرفاً من A-Z a-z 0-9 _ -).');
  }
  if (config.djezzy.dryRun) {
    warnings.push('محرّك جيزي في وضع المحاكاة (DJEZZY_DRY_RUN) — لن تُنفَّذ طلبات حقيقية.');
  }
  if (!config.djezzy.direct && config.djezzy.proxies.length === 0 && !config.djezzy.relayUrl && !config.djezzy.autoProxy) {
    warnings.push('لا يوجد أي مسار لاتصال جيزي (المباشر معطّل ولا بروكسيات ولا relay).');
  }

  return warnings;
}

export default config;
