# النشر على Vercel — خطوات سريعة

الملف الجاهز للاستيراد: `marketplace-vercel.zip` (موجود في جذر المستودع خارج مجلد التطبيق). فك الضغط؛ مجلد المشروع داخل الأرشيف اسمه `marketplace`.

## إعداد المشروع الموجود `marketplace-fixed`

1. اربط مستودع GitHub `bezzagabdou-source/Absorbs` بالمشروع، واجعل الفرع `arena/f205ded0-absorbs` هو مصدر النشر.
2. في Settings → Build and Deployment:
   - Root Directory: `marketplace`
   - Framework Preset: `Next.js`
   - Node.js: `22.x`
   - Install Command: `npm ci`
   - Build Command: `npm run build`
   - Output Directory: القيمة الافتراضية لـ Next.js (لا تكتب `public`).
3. أنشئ قاعدة PostgreSQL خارجية تدعم TLS ومتاحة من Vercel. قاعدة المعاينة المحلية ليست قاعدة سحابية ولا تنتقل مع ZIP.
4. من جهاز موثوق، اضبط متغيرات البيئة المحلية ثم نفّذ مرة واحدة:
   ```bash
   npm ci
   npm run db:migrate
   npm run db:seed
   ```
   لا تنفّذ `db:seed:demo` على قاعدة الإنتاج.
5. أضف متغيرات البيئة في Vercel مباشرة، وليس في المحادثة:
   - `DATABASE_URL`: اتصال دور التشغيل `dz_runtime` فقط.
   - `APP_URL`: أصل HTTPS الأساسي، مثل `https://marketplace-fixed.vercel.app` إذا أبقيت هذا النطاق.
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` و`VAPID_PRIVATE_KEY`: زوج جديد خاص بالنشر (`npm run push:keys`).
   - `VAPID_SUBJECT`: بريد تواصل أمني حقيقي.
   - `DEMO_MODE=false`.
   - `TRUST_PROXY_HEADERS=false` إلى أن تتأكد أن الوكيل يكتب `x-real-ip` بنفسه.
   - `PUSH_ALLOWED_HOSTS` حسب القائمة الموجودة في `.env.example`.
   متغيرات `DATABASE_MIGRATION_URL` و`DATABASE_MIGRATION_PASSWORD` وكلمات أدوار القاعدة ليست مطلوبة في تطبيق Vercel؛ أبقها في أداة migrations/secret manager.
6. أعد النشر بعد ضبط المتغيرات، ثم افحص `/api/health`، التسجيل، إنشاء إعلان، المساومة ولوحة البائع.
7. شغّل `npm run push:worker` في حاوية/VM دائم مع `PUSH_DATABASE_URL` ومفاتيح VAPID. Vercel لا يشغّل هذا العامل الدائم تلقائياً؛ بدونه تبقى التنبيهات داخل الصندوق ولا تصل كـ Push خارجي.

## حالة التحقق المحلية

- TypeScript وESLint و19 اختبار وحدة وbuild الإنتاج: ناجحة.
- 25 فحص PostgreSQL/RLS/push queue: ناجحة.
- 7 اختبارات Chromium للواجهة وAPI وservice worker: ناجحة.
- `npm audit` داخل `marketplace`: صفر ثغرات معروفة وقت الفحص.
- فحص عامل Push استخدم محاكي مزوّد؛ اختبار الوصول الفعلي لمزوّد Push وقاعدة الإنتاج لم يتم بعد.

لا يحتوي الأرشيف على `.env.local` أو كلمات مرور أو `node_modules` أو ملفات البناء. الدفع/الضمان المالي وتوثيق البريد والهوية غير مرتبطة؛ الواجهة توضح ذلك ولا تدّعي تنفيذها. راجع README قبل إطلاق عام.