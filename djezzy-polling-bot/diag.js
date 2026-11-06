#!/usr/bin/env node
/**
 * diag.js — فحص سريع قبل التشغيل: الإعدادات + الوصول إلى خوادم جيزي.
 *
 *   npm run diag
 */
import 'dotenv/config';
import process from 'node:process';
import { Djezzy } from './djezzy.js';

const ok = (label, value) => console.log(`✅ ${label}: ${value}`);
const bad = (label, value) => console.log(`❌ ${label}: ${value}`);
const warn = (label, value) => console.log(`⚠️  ${label}: ${value}`);

console.log('🔍 فحص بوت جيزي (Polling)\n');

/* 1) الإعدادات */
const token = (process.env.BOT_TOKEN || '').trim();
if (/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) ok('BOT_TOKEN', 'موجود بصيغة صحيحة');
else bad('BOT_TOKEN', token ? 'صيغة غير صحيحة' : 'غير مضبوط — أضفه في .env');

const key = (process.env.SESSION_KEY || '').trim();
if (!key) warn('SESSION_KEY', 'غير مضبوط — سيُولَّد مفتاح تلقائياً في data/.session-key');
else if (/^[0-9a-fA-F]{64}$/.test(key)) ok('SESSION_KEY', '64 حرف hex');
else warn('SESSION_KEY', 'ليس 64 hex — سيُستعمل كعبارة مرور');

const hasCreds = Boolean(process.env.DJEZZY_CLIENT_ID && process.env.DJEZZY_CLIENT_SECRET);
const hasLegacy = Boolean(process.env.DJEZZY_CLIENT_ID_LEGACY && process.env.DJEZZY_CLIENT_SECRET_LEGACY);
if (hasCreds) ok('DJEZZY_CLIENT_ID/SECRET', 'موجودان');
else bad('DJEZZY_CLIENT_ID/SECRET', 'غير مضبوطين');
if (hasLegacy) ok('زوج بديل', 'موجود (يُجرَّب تلقائياً عند الرفض)');
else warn('زوج بديل', 'غير مضبوط (اختياري)');

const prefixes = (process.env.ALLOWED_PREFIXES || '7').split(',').map((p) => p.trim());
console.log(`ℹ️  البادئات المقبولة: ${prefixes.join(', ')} (${prefixes.includes('7') ? 'جيزي ✅' : 'بدون 7 ⚠️'})`);
if (process.env.DJEZZY_PROXY) console.log(`ℹ️  Proxy: ${process.env.DJEZZY_PROXY}`);

/* 2) الاتصال بجيزي */
console.log('\n🌐 اختبار الاتصال بخوادم جيزي…');
let client;
try {
  client = Djezzy.fromEnv(process.env);
} catch (error) {
  bad('تهيئة العميل', error.message);
  process.exit(1);
}

console.log(`   الخادم: ${client.meta.baseUrl} · المهلة: ${client.meta.timeoutMs} ms`);
const probe = await client.probe();

if (probe.reachable) {
  ok('الوصول إلى جيزي', `HTTP ${probe.status} في ${probe.ms} ms`);
  console.log('\n🎯 كل شيء جاهز: شغّل البوت بـ npm start');
} else {
  bad('الوصول إلى جيزي', `${probe.error} بعد ${probe.ms} ms`);
  console.log(
    [
      '',
      '💡 الحلول:',
      '   • تأكد أنك داخل الجزائر (شبكة جيزي/جزائرية) وأوقف أي VPN.',
      '   • جرّب بيانات الهاتف بدل Wi-Fi.',
      '   • أو اضبط وكيلاً جزائرياً: DJEZZY_PROXY=http://host:port في .env',
      '',
      '⚠️  Vercel/Railway/Render لن تعمل: خوادم جيزي تحجب الشبكات الأجنبية.',
    ].join('\n'),
  );
  process.exit(2);
}
