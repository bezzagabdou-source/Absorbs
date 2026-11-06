#!/usr/bin/env node
/**
 * تشغيل البوت بالـ Polling — الطريقة الصحيحة للتشغيل من جهاز داخل الجزائر.
 *
 *   npm run poll        # وضع مباشر (طلبات حقيقية إلى جيزي)
 *   npm run poll:dry    # محاكاة كاملة بلا شبكة
 *
 * لماذا؟ خوادم جيزي (apim.djezzy.dz) تحجب كل IP خارج الجزائر،
 * لذا التشغيل من Vercel يفشل دائماً. من جهازك داخل الجزائر يعمل 100%.
 *
 * لا يحتاج رابطاً عاماً ولا Webhook، ويقرأ الأسرار من ملف .env تلقائياً.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '..', '.env');

/** قارئ .env بسيط (بدون أي مكتبة خارجية) */
function loadEnv(file) {
  if (!existsSync(file)) return [];
  const loaded = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    if (!process.env[key]) {
      process.env[key] = value;
      loaded.push(key);
    }
  }
  return loaded;
}

const loadedKeys = loadEnv(envPath);
console.log(
  loadedKeys.length
    ? `📄 قُرئ ${loadedKeys.length} مفتاحاً من .env (${loadedKeys.slice(0, 3).join(', ')}…)`
    : '⚠️ لم يوجد ملف .env — انسخ .env.example إلى .env وضع المفاتيح.',
);

process.env.USE_POLLING = '1';
await import('./dev-server.js');
