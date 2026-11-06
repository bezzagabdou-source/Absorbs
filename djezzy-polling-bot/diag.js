#!/usr/bin/env node
/**
 * diag.js — فحص سريع قبل التشغيل: الإعدادات + الوصول إلى خوادم جيزي.
 *
 *   npm run diag
 */
import 'dotenv/config';
import process from 'node:process';
import { Djezzy, resolveHost } from './djezzy.js';

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

console.log(`   الخادم: ${client.meta.baseUrl} · المهلة: ${client.meta.timeoutMs} ms · المحاولات: ${client.meta.retries + 1}`);
console.log(`   الشبكة: ${client.meta.forceIpv4 ? 'IPv4 فقط (DJEZZY_FORCE_IPV4=1)' : 'تلقائي IPv4/IPv6'}`);

const pool = client.meta.pool;
if (pool.enabled) {
  console.log(`ℹ️  بروكسي جزائري: ${pool.total} مضبوط — النتيجة تظهر بعد الاختبار`);
  console.log(
    pool.text
      .split('\n')
      .map((line) => `      ${line}`)
      .join('\n'),
  );
} else {
  warn('بروكسي جزائري', 'غير مضبوط — الاتصال مباشر (يعمل فقط من داخل الجزائر)');
}

// سجلات DNS: أوّل سبب لـ ECONNABORTED/ETIMEDOUT هو التعليق على IPv6
const host = new URL(client.meta.baseUrl).hostname;
const dnsInfo = await resolveHost(host);
if (dnsInfo.error) {
  warn(`DNS ${host}`, `${dnsInfo.error} — جرّب إيقاف Private DNS أو تغيير DNS إلى dns.google`);
} else {
  const v4 = dnsInfo.list.filter((item) => item.family === 4).map((item) => item.address);
  const v6 = dnsInfo.list.filter((item) => item.family === 6).map((item) => item.address);
  console.log(`ℹ️  DNS ${host}: IPv4 [${v4.join(', ') || '—'}] · IPv6 [${v6.join(', ') || '—'}]`);
  if (!v4.length) warn('سجل A', 'غير موجود — الاتصال سيفشل إذا كانت IPv6 محجوبة');
}

const probe = await client.probe();

if (probe.pool && probe.pool.enabled) {
  const after = probe.pool;
  console.log(`   حالة البروكسي بعد الاختبار: ${after.healthy}/${after.total} صالح`);
  console.log(
    after.text
      .split('\n')
      .map((line) => `      ${line}`)
      .join('\n'),
  );
}

if (probe.reachable) {
  ok('الوصول إلى جيزي', `HTTP ${probe.status} في ${probe.ms} ms`);
  console.log('\n🎯 كل شيء جاهز: شغّل البوت بـ npm start');
} else {
  bad('الوصول إلى جيزي', `${probe.error} بعد ${probe.ms} ms`);

  const code = String(probe.error || '');
  const timeoutLike = /ECONNABORTED|ETIMEDOUT|ESOCKETTIMEDOUT|timeout/i.test(code);
  const dnsLike = /ENOTFOUND|EAI_AGAIN/i.test(code);

  console.log(
    [
      '',
      timeoutLike ? '⏱️  نوع الخطأ: تعليق/مهلة في الشبكة (ليس حجباً جغرافياً بالضرورة)' : '',
      dnsLike ? '🔤 نوع الخطأ: فشل تحليل الاسم (DNS)' : '',
      '💡 الحلول بالترتيب:',
      dnsLike
        ? '   1. أطفي Private DNS في إعدادات أندرويد (أو اضبطه على dns.google).'
        : '   1. أوقف أي VPN، ثم بدّل بين Wi-Fi وبيانات جيزي وأعد المحاولة.',
      '   2. تأكد أنك داخل الجزائر (شبكة جيزي/جزائرية).',
      '   3. ارفع المهلة والمحاولات: DJEZZY_TIMEOUT_MS=60000 و DJEZZY_RETRIES=3 في .env',
      '   4. إن كان IPv6 وحدَه متاحاً: DJEZZY_FORCE_IPV4=0 في .env',
      '   5. أو اضبط بروكسي جزائرياً: DJEZZY_PROXIES=http://user:pass@ip:port[,socks5://…] في .env',
      '      (من داخل الجزائر لا تحتاج بروكسي — من استضافة سحابية البروكسي إجباري)',
      '',
      '⚠️  Vercel/Railway/Render لن تعمل: خوادم جيزي تحجب الشبكات الأجنبية.',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  process.exit(2);
}
