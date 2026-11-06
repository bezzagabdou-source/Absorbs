# 🔥 بوت جيزي — Telegram Bot + Djezzy Automation Engine

بوت تيليجرام متكامل لإدارة أرقام جيزي وتفعيل العروض والهدايا آلياً،
مبني على **Node.js + grammy + Express**، ومهيّأ للنشر المباشر على **Vercel**
كـ Serverless Function واحدة تعمل عبر **Webhook** (بدون Polling وبدون سيرفر دائم).

> ⚠️ **اقرأ هذا أولاً:** بوت يعمل افتراضياً في **وضع المحاكاة** (Simulation).
> لا يوجد واجهة API عامة وموثّقة لتطبيق جيزي، لذا مسارات الطلبات في هذا المشروع
> **قابلة للضبط بالكامل من متغيّرات البيئة** وتضع فيها ما تستخرجه من حسابك الخاص.
> راجع قسم [محرّك جيزي](#-محرّك-جيزي-djezzy-engine) قبل التشغيل المباشر.

---

## ✨ المزايا

| الميزة | التفاصيل |
|---|---|
| 📱 تسجيل رقم عبر OTP | إدخال الرقم → طلب رمز → تأكيد → استخراج `Bearer Token` تلقائياً |
| 🔐 تشفير الجلسات | كل `Access/Refresh Token` يُخزَّن مشفّراً بـ AES‑256‑GCM |
| ♻️ تجديد تلقائي | عند انتهاء التوكن يُجدَّد عبر `refresh_token` دون إعادة إدخال الرمز |
| 🔥 تفعيل 6 جيغا | بحث ذكي عن العرض في قائمة العروض/الهدايا ثم إرسال طلب التفعيل |
| 🎁 هدية 2 جيغا الأسبوعية | مطابقة الهدية (2GB + أسبوعي) واستلامها، أو استلام كل الهدايا المتاحة |
| 🧩 دعم خطوات التحقق | إذا طلبت جيزي `challenge` إضافياً، يطلب البوت الرمز ويكمل العملية |
| ⚙️ إدارة الأرقام | حتى 3 أرقام لكل مستخدم — تبديل الرقم النشط وحذفه بجلسته |
| 🚦 حماية من الحجب | Cooldown لكل عملية + حد يومي للعمليات + معرّف طلب لكل نداء |
| 🧪 وضع محاكاة كامل | تشغيل وتجربة كل الواجهة بدون أي طلب حقيقي |
| 🩺 مراقبة | `/health` (JSON) وصفحة حالة على `/` وتحقّق سرّي للـ Webhook |

---

## 🗂 بنية المشروع

```
djezzy-bot/
├── api/
│   ├── index.js            # نقطة الدخول الوحيدة على Vercel (default export)
│   └── app.js              # تطبيق Express المشترك (webhook / health / setup)
├── src/
│   ├── bot.js              # واجهة تيليجرام: الأوامر، الأزرار، آلة الحالات
│   ├── config.js           # كل الإعدادات من متغيّرات البيئة + فحصها
│   ├── crypto.js           # AES-256-GCM لتشفير رموز الجلسات
│   ├── djezzy/
│   │   ├── client.js       # عميل HTTP يحاكي تطبيق جيزي (axios)
│   │   ├── engine.js       # منطق الأعمال: OTP، التوكن، 6GB، الهدايا
│   │   ├── errors.js       # رموز أخطاء + رسائل عربية جاهزة
│   │   └── simulator.js    # محاكي كامل للـ API (للتطوير والاختبار)
│   ├── store/index.js      # تخزين: Upstash/Vercel KV (REST) أو ذاكرة مؤقتة
│   ├── ui/
│   │   ├── keyboards.js    # لوحات أزرار Inline
│   │   └── text.js         # نصوص عربية + صفحة الحالة
│   └── util/               # سجلات، تحقّق أرقام جزائرية، أدوات وقت
├── scripts/
│   ├── set-webhook.js      # ضبط/حذف/فحص الـ Webhook
│   ├── dev-server.js       # سيرفر محلي (webhook أو polling)
│   ├── self-test.js        # 14 اختباراً للمحرّك والتشفير والتخزين
│   └── ux-test.js          # 15 خطوة اختبار لتدفّق الواجهة كاملاً
├── vercel.json             # Rewrites + maxDuration + ترويسات
├── package.json
└── .env.example
```

---

## 🚀 تشغيل محلي (دقيقتان)

```bash
cd djezzy-bot
npm install
cp .env.example .env          # ثم ضع BOT_TOKEN و WEBHOOK_SECRET و SESSION_ENCRYPTION_KEY
npm test                      # 38 اختباراً — يجب أن تنجح كلها
npm run dev                   # http://localhost:8080
```

لتجربة البوت فعلياً من تيليجرام وأنت على جهازك، استخدم polling مباشرة:

```bash
USE_POLLING=1 BOT_TOKEN=xxxx npm run dev
```

ثم أرسل `/start` إلى البوت. في وضع المحاكاة ستجد رمز الـ OTP مكتوباً في الرسالة
(🧪 رمز المحاكاة) لتتمكن من تجربة المسار كاملاً.

---

## ☁️ النشر على Vercel

### الطريقة أ — مستودع مستقل (الأسهل، موصى بها)

```bash
cd djezzy-bot
git init -b main
git add . && git commit -m "Djezzy Telegram bot"
gh repo create djezzy-bot --private --source=. --push   # أو ارفعه يدوياً
npx vercel --prod
```

### الطريقة ب — نفس هذا المستودع (Monorepo)

هذا المستودع يحتوي مشروع Next.js في الجذر، لذلك **يجب** ضبط مجلد الجذر:

1. Vercel → **Add New Project** → اختر المستودع.
2. في **Root Directory** اختر `djezzy-bot` (زر *Edit* بجانبها).
3. Framework Preset: **Other** (لا تختر Next.js).
4. Build Command: اتركه فارغاً — لا يحتاج المشروع بناءً.
5. اضبط متغيّرات البيئة (أدناه) ثم **Deploy**.

### متغيّرات البيئة على Vercel

| المتغيّر | إلزامي | الوصف |
|---|---|---|
| `BOT_TOKEN` | ✅ | توكن البوت من @BotFather — **استخدم توكنًا جديدًا بعد `/revoke`** |
| `WEBHOOK_SECRET` | ✅ | 16–256 حرفاً (`A-Za-z0-9_-`) يتحقّق به تيليجرام في كل طلب |
| `SESSION_ENCRYPTION_KEY` | ✅ | ≥ 32 حرفاً لتشفير رموز الجلسات |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | ✅ للإنتاج | Upstash Redis أو Vercel KV — لحفظ الجلسات بين عمليات التشغيل |
| `PUBLIC_URL` | ⬜ | يُستنتج تلقائياً على Vercel، ضعه يدوياً إن استخدمت نطاقاً خاصاً |
| `ALLOWED_TELEGRAM_IDS` | ⬜ | قصر الاستخدام عليك: `123456789,987654321` |
| `DJEZZY_DRY_RUN` | ⬜ | `true` محاكاة (افتراضي) / `false` مباشر |
| `DJEZZY_BASE_URL` + `DJEZZY_PATH_*` | ⬜ | مسارات الـ API الحقيقية (انظر القسم التالي) |
| `MAX_NUMBERS_PER_USER` | ⬜ | افتراضي `3` |
| `ACTION_COOLDOWN_MS` | ⬜ | افتراضي `15000` |
| `MAX_CLAIMS_PER_DAY` | ⬜ | افتراضي `6` عملية/24 ساعة |

> **إنشاء مفاتيح:**
> ```bash
> node -e "console.log('WEBHOOK_SECRET='+require('crypto').randomBytes(24).toString('base64url'))"
> node -e "console.log('SESSION_ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('hex'))"
> ```
>
> **التخزين:** Vercel → Storage → *Upstash Redis* → أنشئ قاعدة → سيضيف
> `KV_REST_API_URL` و `KV_REST_API_TOKEN` تلقائياً. بدونها يعمل البوت لكن
> تُفقد الجلسات عند كل إعادة تشغيل باردة (cold start).

---

## 🔗 ضبط الـ Webhook (اختر واحدة)

بعد نجاح النشر يصبح عنوان الخدمة: `https://<project>.vercel.app`

**1) من متصفحك (أسرع طريقة — بضغطة واحدة):**

```
https://<project>.vercel.app/api/setup?key=<WEBHOOK_SECRET>
```

سيرد بـ JSON فيه `url` و `getWebhookInfo`. للحذف أضف `&delete=1`.

**2) من سطر الأوامر:**

```bash
PUBLIC_URL=https://<project>.vercel.app WEBHOOK_SECRET=... BOT_TOKEN=... npm run set-webhook
npm run webhook-info      # للتحقق
npm run delete-webhook    # للعودة إلى polling
```

**3) يدوياً عبر Telegram API:**

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<project>.vercel.app/api/webhook",
    "secret_token": "<WEBHOOK_SECRET>",
    "allowed_updates": ["message","callback_query"],
    "drop_pending_updates": true
  }'
```

بعد الضبط أرسل `/start` للبوت. تحقّق أيضاً من:
`https://<project>.vercel.app/health` (يجب أن يظهر `"ok":true`).

---

## 🧠 محرّك جيزي (Djezzy Engine)

### الطبقات

```
bot.js  →  engine.js  →  client.js  →  axios  →  (API جيزي أو simulator)
              ↕
           store (KV) + crypto (AES-GCM)
```

### دوال العميل (`src/djezzy/client.js`)

| الدالة | الطلب | الغرض |
|---|---|---|
| `requestOtp({ msisdn })` | `POST /request-otp` | إرسال رمز التحقق |
| `verifyOtp({ msisdn, code, sessionId })` | `POST /verify-otp` | تأكيد الرمز واستخراج `access_token` |
| `refreshSession({ refreshToken })` | `POST /refresh-token` | تجديد الجلسة دون رمز |
| `getProfile({ token })` | `GET /me` | الرصيد والباقة |
| `listOffers({ token })` | `GET /offers` | قائمة العروض |
| `claimOffer({ token, offerId })` | `POST /offers/{id}/claim` | تفعيل العرض (6GB) |
| `listGifts({ token })` | `GET /gifts` | قائمة الهدايا |
| `claimGift({ token, giftId })` | `POST /gifts/{id}/claim` | استلام الهدية (2GB الأسبوعية) |
| `verifyChallenge({ token, challengeId, code })` | `POST /challenges/{id}/verify` | إتمام خطوة تحقّق إضافية |

كل المسارات والأسماء وشكل الحمولة **قابلة للتعديل** في `client.js`، والترويسات تأتي من البيئة:

```
User-Agent: Djezzy/7.2.1 (Android 13; SM-A525F) okhttp/4.9.3
Accept: application/json, text/plain, */*
Content-Type: application/json;charset=UTF-8
Accept-Language: fr-DZ
X-Client-Id / X-App-Version / X-Platform   ← اختيارية
Authorization: Bearer <token>
```

### دوال المحرّك (`src/djezzy/engine.js`)

```js
await engine.startLogin(telegramId, msisdn);            // إرسال OTP + تخزين جلسة التحقق
await engine.confirmLogin(telegramId, msisdn, code, sessionId); // حفظ التوكن مشفّراً
await engine.ensureToken(user, msisdn);                 // توكن صالح (يجدّد إن لزم)
await engine.getOverview(telegramId, msisdn);           // بروفايل + عروض + هدايا
await engine.activateSixGb(telegramId, msisdn);         // 🔥 تفعيل 6 جيغا
await engine.claimWeeklyGift(telegramId, msisdn);       // 🎁 هدية 2 جيغا
await engine.claimAllGifts(telegramId, msisdn);         // 🎁 كل الهدايا المتاحة
await engine.submitChallenge(telegramId, msisdn, challengeId, code);
await engine.setActive / removeAccount
```

نتائج التفعيل موحّدة:

```js
{ ok: true,  status: 'activated', item, data, validity, message }
{ ok: false, status: 'pending_challenge', challengeId, message }   // يطلب البوت الرمز منك
DjezzyError { code: 'OFFER_ALREADY_ACTIVE' | 'OFFER_NOT_FOUND' | 'AUTH_EXPIRED' | 'QUOTA' … }
```

### الانتقال إلى الوضع المباشر

1. التقط حركة تطبيق جيزي على جهازك مع حسابك الخاص (مثال: mitmproxy / HTTP Toolkit).
2. استخرج: عنوان الـ API، مسارات OTP/العروض/الهدايا، وأسماء الحقول الحقيقية.
3. عدّل المسارات في البيئة (`DJEZZY_PATH_*`) وشكل الحمولة في `client.js` إن اختلف.
4. اضبط `DJEZZY_BASE_URL` و `DJEZZY_DRY_RUN=false` ثم أعد النشر.
5. شغّل `/health` وتأكد من ظهور `"mode":"live"`، ثم جرّب على رقم واحد أولاً.

> 🧪 **نصيحة:** أبقِ `DJEZZY_DRY_RUN=true` على نسخة مستقلة (Preview Deployment)
> لتجربة الواجهة، وفعّل المباشر على Production فقط.

---

## 🔒 الأمان

- **التوكن الذي أُرسل في المحادثة يُعتبر مكشوفاً** — افتح @BotFather → `/mybots` → بوتك →
  **API Token → Revoke**، ثم ضع التوكن الجديد في متغيّرات البيئة فقط. لا تكتبه في الكود ولا ترفعه إلى Git (`.env` مستثنى).
- رموز الجلسات مشفّرة قبل التخزين، ولا تُطبع في السجلات (`logger.sanitize` يحجبها).
- الـ Webhook محميّ بـ `secret_token` ويُرفض أي طلب بترويسة ناقصة/خاطئة.
- `ALLOWED_TELEGRAM_IDS` يقيّد البوت عليك — مُستحسن جداً في الاستخدام الشخصي.
- الأرقام تُعرَّض مُقنّعة (`055 *** ** 67`) في الرسائل والسجلات.

---

## 🧪 الاختبارات

```bash
npm test                # كل الاختبارات: 38 اختباراً
npm run test:engine     # 14 اختباراً للمحرّك (بدون شبكة)
npm run test:ux         # 15 خطوة لواجهة تيليجرام كاملة
npm run test:live       # 9 اختبارات لعميل HTTP ضد سيرفر وهمي (axios حقيقي)
npm run check           # فحص الصياغة
```

`ux-test` يبني البوت بمعرّف وهمي ويعترض كل نداءات Telegram API، ثم يمشي في السيناريو
الكامل (start → إضافة رقم → OTP → تفعيل → هدايا → حذف رقم) بدون أي اتصال بالشبكة.

---

## 🩺 استكشاف الأخطاء

| العرض | السبب المحتمل | الحل |
|---|---|---|
| `/health` يعيد `"ok":false` | `BOT_TOKEN` غير مضبوط | أضفه في Vercel → Settings → Environment Variables ثم Redeploy |
| البوت لا يستجيب بعد `/start` | Webhook غير مضبوط أو خاطئ | `npm run webhook-info` وتحقّق من `url` و `last_error_message` |
| `401 Unauthorized` في `getWebhookInfo` | `secret_token` مختلف عن `WEBHOOK_SECRET` | أعد الضبط عبر `/api/setup?key=...` |
| فقدان الأرقام بعد فترة | لا يوجد KV (تخزين مؤقت) | أنشئ Upstash Redis واضبط `KV_REST_API_URL/TOKEN` |
| «انتهت صلاحية الجلسة» دائماً | `SESSION_ENCRYPTION_KEY` تغيّر أو مفقود | ثبّت المفتاح نفسه لكل عمليات النشر |
| `429 من جيزي` | طلبات كثيرة | ارفع `ACTION_COOLDOWN_MS` واخفض `MAX_CLAIMS_PER_DAY` |
| `FUNCTION_INVOCATION_TIMEOUT` | تعليق طلب خارجي | المهلة مضبوطة على 15s؛ تحقّق من `DJEZZY_TIMEOUT_MS` |

---

## 🌍 لماذا لا يصل Vercel إلى جيزي؟ (حجب جغرافي)

| الاختبار | النتيجة |
|---|---|
| `/api/probe` من Vercel | `timeout` |
| DNS عام لـ `apim.djezzy.dz` | يعمل → `41.220.159.56` (نطاق جزائري) |
| 12 عقدة عالمية (DE, FR, TR, PL, US, VN…) | كلها Down |

خوادم جيزي ترفض أي اتصال من خارج الجزائر. لذلك **أي استضافة سحابية** (Vercel, Railway,
Render, Fly) ستفشل في إرسال رمز التحقق وفي تفعيل الهدايا — وليس العيب في الكود.

### الحل: التشغيل من داخل الجزائر

```bash
git clone https://github.com/bezzagabdou-source/Absorbs
cd Absorbs/djezzy-bot
npm install
cp .env.example .env     # ضع BOT_TOKEN + DJEZZY_CLIENT_ID/SECRET
npm run poll             # polling بلا Webhook، مع تخزين دائم في .data/store.json
```

- `npm run poll` يقرأ `.env` تلقائياً ويحفظ الجلسات على القرص (لا تعيد الرمز عند كل تشغيل).
- `npm run poll:dry` للتجربة بلا شبكة.
- على الهاتف: Termux → `pkg install nodejs-lts git` ثم نفس الأوامر.

## ⚖️ تنبيه مهم

هذا المشروع أداة **أتمتة شخصية** لإدارة أرقام تملكها أنت.
استخدام البوت في تفعيل عروض على أرقام لا تملكها، أو إنشاء حسابات متعددة لاستغلال
العروض الترويجية، أو مخالفة شروط خدمة جيزي، قد يؤدي إلى إيقاف الشريحة أو الحساب
وقد يكون مخالفاً للقانون. المسؤولية الكاملة على المستخدم.
إن لم يكن لديك وصول مشروع إلى واجهة جيزي، فاعتبر هذا المشروع هيكلاً هندسياً كاملاً
(بوت + تخزين + تشفير + واجهة) يُوصَل بواجهتك أو بواجهة رسمية تصرّح لك باستخدامها.

---

## 📄 الترخيص

استخدام شخصي — عدّل ما تشاء داخل مستودعك الخاص.
