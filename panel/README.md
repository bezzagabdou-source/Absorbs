# FT AI ⚡ — لوحة تحكم بوت المسابقات + ذكاء اصطناعي تنفيذي

نسخة تعمل على **Vercel** (Serverless Functions) بلا أي تبعيات — Node 22 + `fetch` + Redis عبر RESP.

## الميزات

- **FT AI**: صفحة خاصة، محادثة تنفيذية بـ **25 أداة حقيقية** (إحصاءات، أعضاء، إحالات، نقاط، حظر/فك حظر،
  تأكيد إحالات، أسئلة، إرسال رسائل، بثّ، مكتبة صور، إعدادات، تغيير كلمة السر، فحص وتصليح webhook).
  المزوّدون: OpenRouter (`x-ai/grok-4` → `grok-4-mini` → `gemini-2.5-flash`) ← xAI (`grok-4` → `grok-3-mini`)
  ← **درع محلي** (ينفّذ حتى لو طاح كل المزوّدين). لا يرفض طلباً.
- **رفع أي صورة** (JPG/PNG/WEBP/GIF/SVG/AVIF حتى 8 ميغا) بالسحب والإفلات، وتُخزَّن في Redis
  وتُرسل للنموذج كصورة (فهم بصري).
- **زر تغيير كلمة السر** هو الأبرز (رأس اللوحة + صفحة الأمان): scrypt + إبطال كل الجلسات القديمة.
- لوحة كاملة: أعضاء، إحالات (من جاء عن طريق من)، أسئلة، صور، إعدادات، أمان، سجل أعمال.
- **webhook تيليغرام** داخل `/api/webhook`: `/start` (بكود إحالة)، `/quiz`، `/me`، `/top`، `/invite`،
  أزرار أجوبة، حماية معدّل، وسم الإحالات المشبوهة (نفس IP/اسم).
- حماية من الحظر: سقف إرسال 22/ثانية، فواصل لكل محادثة، احترام 429، كتم 30 دقيقة بعد 403.

## متغيّرات البيئة (Vercel → Settings → Environment Variables)

| المتغيّر | إلزامي | الوصف |
|---|---|---|
| `DASHBOARD_PASSWORD` | ✅ | كلمة السر الأولى للوحة (تُشفَّر أول دخول) |
| `SESSION_SECRET` | ✅ | سرّ توقيع الجلسات (أي نص طويل) |
| `REDIS_URL` | ⭐ | التخزين الدائم (Redis Cloud/Upstash). بلاها = ذاكرة مؤقتة تُفقد |
| `BOT_TOKEN` | ⭐ | توكن البوت من @BotFather |
| `WEBHOOK_SECRET` | ⭐ | سرّ ترويسة تيليغرام |
| `OPENROUTER_API_KEY` | ⭐ | مفتاح OpenRouter (Grok/Gemini) |
| `XAI_API_KEY` | اختياري | مفتاح xAI مباشرة |
| `PUBLIC_URL` | اختياري | رابط الموقع (لمسارات الإحالة) |

بعد ضبط `BOT_TOKEN`: من اللوحة اضغط **🩺 فحص البوت** ثم **🔧 تصليح الـ webhook** — يسجّل
`https://<موقعك>/api/webhook` في تيليغرام.

## تشغيل محلي

```bash
DASHBOARD_PASSWORD=barq2026 SESSION_SECRET=dev node scripts/dev.js   # http://localhost:8099
npm test                                                             # 13 اختبار
```

## المسارات

`POST /api/auth/login` · `POST /api/auth/password` · `GET /api/auth/session` · `POST /api/auth/logout`
`GET /api/overview` · `GET|PATCH /api/users` · `GET|POST /api/referrals` · `GET|POST|DELETE /api/questions`
`GET|POST|DELETE /api/uploads` · `GET|POST|DELETE /api/ai/chat` · `POST /api/actions` · `GET|POST /api/settings`
`POST /api/webhook` (تيليغرام)

## بنية المشروع

```
api/            نقاط نهاية Vercel (كل ملف = Function)
lib/core.js     Redis (RESP) + الحالة + الجلسات + scrypt
lib/ai.js       FT AI: الأدوات + حلقة النموذج + الدرع المحلي
lib/bot.js      محرّك تيليغرام (أوامر، مسابقة، إحالات)
lib/tg.js       عميل Telegram API + مضاد الحظر
public/         الواجهة (RTL، بلا إطار عمل)
test/           اختبارات (Redis وهمي + مزوّد AI وهمي)
```
