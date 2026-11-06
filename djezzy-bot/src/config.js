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
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    '';
  return host ? `https://${host}` : '';
};

/** مسارات محرّك جيزي — قابلة للتغيير بالكامل من البيئة */
const djezzyPaths = {
  requestOtp: process.env.DJEZZY_PATH_REQUEST_OTP || '/request-otp',
  verifyOtp: process.env.DJEZZY_PATH_VERIFY_OTP || '/verify-otp',
  refresh: process.env.DJEZZY_PATH_REFRESH || '/refresh-token',
  profile: process.env.DJEZZY_PATH_PROFILE || '/me',
  offers: process.env.DJEZZY_PATH_OFFERS || '/offers',
  claimOffer: process.env.DJEZZY_PATH_CLAIM_OFFER || '/offers/{id}/claim',
  gifts: process.env.DJEZZY_PATH_GIFTS || '/gifts',
  claimGift: process.env.DJEZZY_PATH_CLAIM_GIFT || '/gifts/{id}/claim',
  challenge: process.env.DJEZZY_PATH_CHALLENGE || '/challenges/{id}/verify',
};

const djezzyBaseUrl = stripSlash(process.env.DJEZZY_BASE_URL);

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
    userTtlSeconds: int(process.env.USER_TTL_SECONDS, 60 * 60 * 24 * 180), // 180 يوماً
  },

  djezzy: {
    baseUrl: djezzyBaseUrl,
    paths: djezzyPaths,
    // محاكاة تلقائية طالما لم يُضبط عنوان الـ API الحقيقي
    dryRun: bool(process.env.DJEZZY_DRY_RUN, !djezzyBaseUrl),
    timeoutMs: int(process.env.DJEZZY_TIMEOUT_MS, 15000),
    headers: {
      'User-Agent':
        process.env.DJEZZY_USER_AGENT ||
        'Djezzy/7.2.1 (Android 13; SM-A525F) okhttp/4.9.3',
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json;charset=UTF-8',
      'Accept-Language': process.env.DJEZZY_ACCEPT_LANGUAGE || 'fr-DZ',
      'X-Client-Id': process.env.DJEZZY_CLIENT_ID || '',
      'X-App-Version': process.env.DJEZZY_APP_VERSION || '7.2.1',
      'X-Platform': process.env.DJEZZY_PLATFORM || 'android',
    },
  },

  limits: {
    maxNumbersPerUser: int(process.env.MAX_NUMBERS_PER_USER, 3),
    actionCooldownMs: int(process.env.ACTION_COOLDOWN_MS, 15000),
    maxClaimsPerDay: int(process.env.MAX_CLAIMS_PER_DAY, 6),
  },

  offerCodes: {
    sixGb: (process.env.OFFER_6GB_MATCH || '6').trim(),
    weeklyGift: (process.env.GIFT_WEEKLY_MATCH || '2').trim(),
  },
};

/** فحص الإعدادات الحرجة وإرجاع قائمة تحذيرات (لا تُسقط الدالة) */
export function validateConfig() {
  const warnings = [];

  if (!config.bot.token) warnings.push('BOT_TOKEN غير مضبوط — لن يعمل البوت.');
  if (!config.storage.kvUrl || !config.storage.kvToken) {
    warnings.push(
      'KV_REST_API_URL / KV_REST_API_TOKEN غير مضبوطين — سيُستخدم تخزين مؤقت في الذاكرة وستُفقد الجلسات بعد كل إعادة تشغيل.',
    );
  }
  if (!config.storage.encryptionKey || config.storage.encryptionKey.length < 32) {
    warnings.push(
      'SESSION_ENCRYPTION_KEY مفقود أو أقصر من 32 حرفاً — سيُستخدم مفتاح مؤقت (غير آمن للتشغيل الحقيقي).',
    );
  }
  if (!config.bot.webhookSecret || !/^[A-Za-z0-9_-]{16,256}$/.test(config.bot.webhookSecret)) {
    warnings.push('WEBHOOK_SECRET مفقود أو غير صالح (16–256 حرفاً من A-Z a-z 0-9 _ -).');
  }
  if (config.djezzy.dryRun) {
    warnings.push('محرّك جيزي في وضع المحاكاة (DJEZZY_DRY_RUN) — لن تُنفَّذ طلبات حقيقية.');
  }

  return warnings;
}

export default config;
