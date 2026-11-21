/**
 * التحقق من بيانات Telegram Mini Apps (initData) — HMAC حسب وثائق تيليجرام.
 * secret_key = HMAC_SHA256("WebAppData", bot_token)
 * hash       = HMAC_SHA256(secret_key, data_check_string)
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyInitData(initData, botToken, { maxAgeSeconds = 86400 } = {}) {
  if (!initData || typeof initData !== 'string') return { ok: false, reason: 'missing' };
  if (!botToken) return { ok: false, reason: 'no-token' };

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, reason: 'bad-hash' };
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'hash-mismatch' };

  const authDate = Number(params.get('auth_date') || 0);
  if (authDate && Date.now() / 1000 - authDate > maxAgeSeconds) return { ok: false, reason: 'expired' };

  try {
    const user = JSON.parse(params.get('user') || '{}');
    if (!user?.id) return { ok: false, reason: 'no-user' };
    return { ok: true, user };
  } catch {
    return { ok: false, reason: 'bad-user' };
  }
}

/** توليد initData صالحة للاختبارات المحلية (نفس خوارزمية تيليجرام) */
export function signInitData(fields, botToken) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

export default verifyInitData;
