/**
 * تشفير رموز الجلسات (Access / Refresh Tokens) قبل تخزينها.
 * AES-256-GCM مع مفتاح مشتق من SESSION_ENCRYPTION_KEY.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import config from './config.js';

const VERSION = 'v1';

let cachedKey = null;

function key() {
  if (cachedKey) return cachedKey;

  const secret = config.storage.encryptionKey;
  if (secret && secret.length >= 32) {
    cachedKey = createHash('sha256').update(secret).digest();
    return cachedKey;
  }

  // مفتاح مؤقت لبيئة التطوير فقط: غير آمن، ويكفي أن التخزين يُعاد ضبطه
  // عند كل إعادة تشغيل فلا تُقرأ الجلسات القديمة.
  cachedKey = randomBytes(32);
  return cachedKey;
}

export function encrypt(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === '') return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function decrypt(payload) {
  if (!payload || typeof payload !== 'string') return null;
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const [, iv, tag, data] = parts;
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    // المفتاح تغيّر أو البيانات تالفة → نطلب إعادة تسجيل الدخول
    return null;
  }
}

/** مقارنة آمنة ضد هجمات التوقيت (تُستخدم للتحقق من سرّ الـ Webhook) */
export function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a ?? ''));
  const bufferB = Buffer.from(String(b ?? ''));
  if (bufferA.length !== bufferB.length || bufferA.length === 0) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export default { encrypt, decrypt, safeEqual };
