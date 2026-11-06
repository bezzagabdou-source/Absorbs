/**
 * إعدادات المشروع — تُقرأ كلها من متغيّرات البيئة.
 * لا يوجد أي مفتاح أو توكن مكتوب داخل الكود (Best practice).
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

/* ------------------------- محرّك جيزي (الواجهة الحقيقية) ------------------------- */
const djezzyBaseUrl = stripSlash(process.env.DJEZZY_BASE_URL || 'https://apim.djezzy.dz');

const djezzyPaths = {
  requestOtp: process.env.DJEZZY_PATH_REQUEST_OTP || '/mobile-api/oauth2/registration',
  verifyOtp: process.env.DJEZZY_PATH_VERIFY_OTP || '/oauth2/token',
  refresh: process.env.DJEZZY_PATH_REFRESH || '/oauth2/token',
  history: process.env.DJEZZY_PATH_HISTORY || '/mobile-api/api/v1/subscribers/subscription-history/{msisdn}',
  walkReward: process.env.DJEZZY_PATH_WALK_REWARD || '/mobile-api/api/v1/services/walk/activate-reward/{msisdn}',
  scanReward: process.env.DJEZZY_PATH_SCAN_REWARD || '/mobile-api/api/v1/services/scan/activate-reward/{msisdn}',
  activateProduct: process.env.DJEZZY_PATH_ACTIVATE_PRODUCT || '/mobile-api/api/v1/subscribers/activate-product/{msisdn}',
};

const djezzyClientId = (process.env.DJEZZY_CLIENT_ID || '').trim();
const djezzyClientSecret = (process.env.DJEZZY_CLIENT_SECRET || '').trim();

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
  },

  djezzy: {
    baseUrl: djezzyBaseUrl,
    paths: djezzyPaths,
    clientId: djezzyClientId,
    clientSecret: djezzyClientSecret,
    // زوج بديل (بعض نسخ التطبيق القديمة) — يُجرَّب تلقائياً عند رفض الأول
    legacyClientId: (process.env.DJEZZY_CLIENT_ID_LEGACY || '').trim(),
    legacyClientSecret: (process.env.DJEZZY_CLIENT_SECRET_LEGACY || '').trim(),
    // هدية 2 جيجا الأسبوعية (Walk Win) والهدية الترويجية عبر QR
    giftWalkCode: process.env.DJEZZY_GIFT_WALK_CODE || 'GIFTWALKWIN2GO',
    scanQr: process.env.DJEZZY_SCAN_QR || 'https://www.djezzy.dz/scanwin-wd26?1',
    // عرض مدفوع اختياري — لا يُفعّل تلقائياً أبداً (قد يُخصم من الرصيد)
    paidProductCode: (process.env.OFFER_PAID_CODE || '').trim(),
    // الوضع المباشر يعمل فقط عند توفّر بيانات التطبيق
    dryRun: bool(process.env.DJEZZY_DRY_RUN, !(djezzyClientId && djezzyClientSecret)),
    timeoutMs: int(process.env.DJEZZY_TIMEOUT_MS, 15000),
    headers: {
      'User-Agent': process.env.DJEZZY_USER_AGENT || 'MobileApp/3.0.9',
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
  // على Vercel بلا KV تُفقد الجلسات؛ أما محلياً فالتخزين ملفي دائم (.data/store.json)
  if (config.isVercel && (!config.storage.kvUrl || !config.storage.kvToken)) {
    warnings.push(
      'KV_REST_API_URL / KV_REST_API_TOKEN غير مضبوطين — سيُستخدم تخزين مؤقت في الذاكرة وستُفقد الجلسات بعد كل إعادة تشغيل.',
    );
  }
  if (!config.storage.encryptionKey || config.storage.encryptionKey.length < 32) {
    warnings.push('SESSION_ENCRYPTION_KEY مفقود أو أقصر من 32 حرفاً — سيُستخدم مفتاح مؤقت (غير آمن للتشغيل الحقيقي).');
  }
  if (!config.bot.webhookSecret || !/^[A-Za-z0-9_-]{16,256}$/.test(config.bot.webhookSecret)) {
    warnings.push('WEBHOOK_SECRET مفقود أو غير صالح (16–256 حرفاً من A-Z a-z 0-9 _ -).');
  }
  if (!config.djezzy.clientId || !config.djezzy.clientSecret) {
    warnings.push('DJEZZY_CLIENT_ID / DJEZZY_CLIENT_SECRET غير مضبوطين — سيعمل البوت في وضع المحاكاة فقط.');
  }
  if (config.djezzy.dryRun) {
    warnings.push('محرّك جيزي في وضع المحاكاة (DJEZZY_DRY_RUN) — لن تُنفَّذ طلبات حقيقية.');
  }

  return warnings;
}

export default config;
