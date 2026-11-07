# النشر على Vercel — DZ Exchange

الرابط الحي: **https://marketplace-fixed.vercel.app**

المشروع على Vercel: `marketplace-fixed`، من مجلد `marketplace` في مستودع `bezzagabdou-source/Absorbs`، فرع `arena/f205ded0-absorbs`.

## ما تم إعداده

- Next.js 16 / Node 22.x، البناء `npm run build`، التثبيت `npm ci`.
- قاعدة Neon مشتركة مع مشاريع أخرى، لكن السوق معزول تماماً في مخطط `dz_marketplace` (ومخطط الهجرات `dz_marketplace_migrations`). لا تكتب أبداً في `public` لأن فيه جداول مشاريع أخرى.
- دور التشغيل `dz_runtime` ودور عامل Push `dz_push_worker` غير ممتازين ولا يتجاوزان RLS.
- تم تطبيق الهجرات وRLS والمنح وبذر 58 ولاية و8 تصنيفات بنجاح من خطوات بناء Vercel، ثم أعيد أمر البناء إلى `npm run build` العادي.
- `/api/health` و`/api/reference` و`/api/listings` والصفحة الرئيسية تعمل على الرابط الحي.
- مساعد الذكاء الاصطناعي يستخدم Gemini أولاً (`gemini-3.8-flash`)، ثم OpenRouter كبديل server-side. المفتان لا يصلان إلى المتصفح. إذا ازدحم المزوّد أو حدّ المعدل يعيد المساعد خطأ واضحاً ولا يخترع إجابة.

## متغيرات البيئة المهمة

أضفها في Vercel مباشرة، وليس في المحادثة أو ZIP:

- `APP_URL=https://marketplace-fixed.vercel.app`
- `DATABASE_URL`: اتصال دور `dz_runtime` فقط، بقاعدة Neon ومخطط `dz_marketplace` عبر `search_path`.
- `DB_SCHEMA=dz_marketplace`
- `DB_POOL_MAX=5`
- `DEMO_MODE=false`
- `TRUST_PROXY_HEADERS=false` ما لم يكن الوكيل يكتب `x-real-ip` بنفسه.
- `GEMINI_API_KEY` و`GEMINI_FLASH_MODEL=gemini-3.8-flash`.
- `OPENROUTER_API_KEY` و`OPENROUTER_MODEL=google/gemma-4-31b-it:free` كبديل مجاني عند تعطل Gemini أو نفاد الرصيد.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` و`VAPID_PRIVATE_KEY` و`VAPID_SUBJECT` عند تفعيل Push.
- `PUSH_DATABASE_URL` لعامل Push الخارجي فقط.

متغيرات الهجرة (`DATABASE_MIGRATION_URL`, `DB_RUNTIME_PASSWORD`, `DB_WORKER_PASSWORD`) استُخدمت لمرة واحدة/خطوات تحقق ولا يحتاجها بناء الويب العادي. أبقها في secret manager ولا تضعها في الأرشيف.

## إعادة الهجرة عند التغيير

من جهاز موثوق أو خطوة CI مؤقتة:

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run db:inspect
npm run db:check:runtime
npm run db:check:queries
```

لا تنفّذ `db:seed:demo` على الإنتاج. حسابات المعاينة معطلة عندما `NODE_ENV=production`.

## Push

Vercel لا يشغّل عامل Push الدائم. شغّل `npm run push:worker` في حاوية/VM مع `PUSH_DATABASE_URL` ومفاتيح VAPID. بدون ذلك تبقى التنبيهات داخل الصندوق ولا تصل كـ Push خارجي. تم اختبار الطابور بمحاكي مزوّد، وليس بتسليم فعلي من متصفح إلى مزود Push.

## التحقق

- TypeScript وESLint و24 اختبار وحدة: ناجحة.
- 25 فحص PostgreSQL/RLS/worker و7 اختبارات Chromium: ناجحة محلياً قبل النشر.
- فحوص قاعدة الإنتاج من بناء Vercel: `runtime_db_check` و`runtime_queries_check` ناجحة.
- `npm audit` داخل `marketplace`: صفر ثغرات معروفة وقت الفحص.

## حدود مطلقة

الدفع/الضمان المالي، توثيق البريد/الهوية، تخزين الصور، والإشراف غير مرتبطة. الواجهة توضح ذلك ولا تدّعي تنفيذها. راجع README قبل إطلاق عام.
