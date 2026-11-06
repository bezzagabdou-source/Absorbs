# 🚀 حالة النشر الفعلية (Deployment Record)

هذا الملف يوثّق أين يعمل البوت حالياً، وكيف يُحدَّث. **لا يحتوي أي سرّ** — كل الأسرار في متغيّرات بيئة Vercel فقط.

## المعلومات الأساسية

| العنصر | القيمة |
|---|---|
| البوت | [@Djezzynetbot](https://t.me/Djezzynetbot) — المعرّف `9000927557` |
| مشروع Vercel | `otp-bot` (Team: `abdoubita986-gif`) |
| Root Directory | `djezzy-bot` |
| رابط الإنتاج | https://otp-bot-wine.vercel.app |
| Webhook | `POST https://otp-bot-wine.vercel.app/api/webhook` |
| فحص سريع | https://otp-bot-wine.vercel.app/health |
| تشخيص كامل | `https://otp-bot-wine.vercel.app/api/diagnose?key=<WEBHOOK_SECRET>` |
| إعادة ربط الويبهوك | `https://otp-bot-wine.vercel.app/api/setup?key=<WEBHOOK_SECRET>` |
| المنطقة | `iad1` (واشنطن) — Node.js 26.x |

## متغيّرات البيئة المضبوطة على Vercel

| المتغيّر | الحالة |
|---|---|
| `BOT_TOKEN` | ✅ (مشفّر) |
| `WEBHOOK_SECRET` | ✅ (مشفّر) |
| `SESSION_ENCRYPTION_KEY` | ✅ (مشفّر، 64 hex) |
| `DJEZZY_DRY_RUN` | `true` — وضع المحاكاة (لا توجد مسارات API حقيقية بعد) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | ❌ غير مضبوط → الجلسات في الذاكرة وتُفقد عند كل Cold start |
| `PUBLIC_URL` | يُستنتج تلقائياً من Vercel |

## كيف يُحدَّث البوت

النشر مربوط بفرع `main` لهذا المستودع:

1. عدّل الكود في `djezzy-bot/` وادفعه إلى `main`.
2. من واجهة Vercel: مشروع `otp-bot` → Deployments → **Redeploy** على آخر Commit
   (أو نفّذ `vercel --prod` من مجلد `djezzy-bot`).
3. بعد أي تغيير في الـ Webhook أو `PUBLIC_URL`، افتح رابط `api/setup` أعلاه مرة واحدة.

> ملاحظة: `createDeployments` معطّل لهذا الحساب، لذلك **الدفع إلى GitHub لا ينشر تلقائياً** —
> يلزم Redeploy يدوي من لوحة Vercel.

## عيوب معروفة يجب إصلاحها لاحقاً

1. **التخزين مؤقت:** بدون Upstash/Vercel KV تُفقد الأرقام والجلسات بعد كل إعادة تشغيل باردة.
   الحل (دقيقتان): Vercel → Storage → Upstash Redis → إنشاء → نسخ `KV_REST_API_URL` و
   `KV_REST_API_TOKEN` إلى متغيّرات المشروع → Redeploy.
2. **محرّك جيزي في وضع المحاكاة:** لا توجد مسارات API عامة موثّقة. لتفعيل طلبات حقيقية
   اضبط `DJEZZY_BASE_URL` + `DJEZZY_PATH_*` ثم `DJEZZY_DRY_RUN=false`.
3. **الدولة:** مستخدم واحد فقط يستخدم البوت حالياً؛ يُستحسن ضبط `ALLOWED_TELEGRAM_IDS`
   لقصر الاستخدام عليك.

## مراقبة سريعة

```bash
# من جهازك (يقرأ .env)
npm run doctor

# أو
curl https://otp-bot-wine.vercel.app/health
```
