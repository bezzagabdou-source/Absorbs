# 🔥 بوت جيزي v2 — Telegram Bot + Djezzy Real Engine

بوت تيليجرام متكامل لأرقام جيزي: تسجيل OTP حقيقي، كتالوج هدايا مجانية
(2 جيغا أسبوعياً، هدية الجمعة/المناسبة، بونص الدعوة) وعروض مدفوعة بأسعار
واضحة — بتصميم أزرار ملوّن + لوحة ويب بأزرار حقيقية (أزرق/أخضر/أحمر)
+ إيموجيات متحركة مصنوعة HTML/CSS خالص.

مبني على **Node.js + grammy + Express**، ومهيّأ للنشر على **Vercel**
كـ Serverless Function عبر **Webhook**.

---

## ✨ المزايا

| الميزة | التفاصيل |
|---|---|
| 📱 OTP حقيقي | إدخال الرقم (07…) → إرسال رمز فعلي → تحقق تلقائي → حفظ الجلسة مشفّرة |
| 🟢 هدايا مجانية | 2 جيجا أسبوعية (Walk Win) · هدية QR (جمعة/مناسبة/مباراة) · بونص دعوة MGM |
| 🔵 عروض مدفوعة | كتالوج 18 باقة بأسعارها (30–1500 دج) — تُفعَّل بتأكيد صريح فقط |
| 🎨 تصميم ملوّن | أزرارINLINE بالفئات (🟢 مجاني/🔵 مدفوع/🔴 حذف) + صفحة ويب `/app` بخلفيات CSS حقيقية |
| 🖼 إيموجيات متحركة | معرض `/emojis` — 9 إيموجيات HTML/CSS/SVG بدون أي custom_emoji_id |
| 🌍 تجاوز الحجب | مسارات متعددة: relay ← مباشر ← بروكسيات يدوية ← بروكسيات جزائرية تلقائية |
| 💾 تخزين دائم | KV أو **فرع bot-state في مستودع GitHub** (يعمل على Vercel بلا Upstash) |
| 🔐 أمان | AES-256-GCM للجلسات · webhook بـ secret_token · initData HMAC للويب |

---

## 🗂 بنية المشروع

```
djezzy-bot/
├── api/
│   ├── index.js            # نقطة الدخول الوحيدة على Vercel
│   └── app.js              # Express: webhook / health / setup / /app / /emojis /api/app/action
├── relay/
│   └── server.js           # خادم وسيط تشغّله داخل الجزائر (يتجاوز الحجب)
├── src/
│   ├── bot.js              # الأوامر، الأزرار، آلة الحالات، الكتالوج
│   ├── config.js           # الإعدادات + بيانات تطبيق جيزي المضمّنة
│   ├── crypto.js           # AES-256-GCM
│   ├── djezzy/
│   │   ├── client.js       # عميل الواجهة الحقيقية (OTP/توكن/تفعيل/MGM)
│   │   ├── routes.js       # طبقات المسارات (relay/direct/proxies)
│   │   ├── catalog.js      # كتالوج الهدايا والعروض الحقيقية
│   │   ├── engine.js       # منطق الأعمال
│   │   ├── errors.js       # رموز أخطاء + رسائل عربية
│   │   └── simulator.js    # محاكي كامل (DJEZZY_DRY_RUN=true)
│   ├── store/              # kv | github | file | memory
│   ├── ui/                 # keyboards (ملوّن) + text + pages (HTML/CSS)
│   └── util/               # logger, validate, time, telegram-auth (HMAC)
├── scripts/                # set-webhook, dev-server, 3 حزم اختبارات
└── vercel.json
```

---

## 🚀 تشغيل محلي (دقيقتان)

```bash
cd djezzy-bot
npm install
cp .env.example .env        # ضع BOT_TOKEN + WEBHOOK_SECRET + SESSION_ENCRYPTION_KEY
npm test                    # 56 اختباراً — يجب أن تنجح كلها
npm run dev                 # http://localhost:8080
```

للتجربة من تيليجرام مباشرة (بدون Webhook):

```bash
USE_POLLING=1 BOT_TOKEN=xxxx npm run dev
```

في وضع المحاكاة (`DJEZZY_DRY_RUN=true`) يظهر رمز OTP في الرسالة
(🧪 رمز المحاكاة) لتجربة المسار كاملاً.

---

## ☁️ النشر على Vercel

1. ارفع مجلد `djezzy-bot` كمشروع مستقل (أو اضبط **Root Directory** عليه).
2. أضف متغيّرات البيئة (أدناه) ثم **Deploy**.
3. اضبط الويبهوك بضغطة واحدة:

```
https://<project>.vercel.app/api/setup?key=<WEBHOOK_SECRET>
```

4. تحقّق: `https://<project>.vercel.app/health` (يعرض المسارات والتخزين).

### متغيّرات البيئة

| المتغيّر | إلزامي | الوصف |
|---|---|---|
| `BOT_TOKEN` | ✅ | توكن @BotFather (في البيئة فقط، لا يُرفع للـ Git) |
| `WEBHOOK_SECRET` | ✅ | سرّ Webhook — يُولَّد بـ `randomBytes(24).toString("base64url")` |
| `SESSION_ENCRYPTION_KEY` | ✅ | ≥32 حرفاً لتشفير جلسات الأرقام |
| `STATE_GITHUB_TOKEN` + `STATE_GITHUB_REPO` | ✅* | تخزين دائم عبر فرع `bot-state` (*أو `KV_REST_API_URL/TOKEN`) |
| `DJEZZY_RELAY_URL` + `DJEZZY_RELAY_TOKEN` | ⬜ | relay داخل الجزائر (أنجح حل للحجب) |
| `DJEZZY_PROXIES` | ⬜ | بروكسيات جزائرية يدوية |
| `DJEZZY_DRY_RUN` | ⬜ | `true` محاكاة — الافتراضي `false` (مباشر) |

> بيانات تطبيق جيزي (`DJEZZY_CLIENT_ID/SECRET`) **مضمّنة افتراضياً** في
> `src/config.js` (معرّفات عمومية موجودة في كل نسخ التطبيق المنشورة) ويمكن
> تجاوزها من البيئة.

---

## 🧠 محرّك جيزي — المسارات الحقيقية

الكل من `apim.djezzy.dz` (مؤكَّد من سكربتات عاملة متعددة):

| العملية | الطلب |
|---|---|
| إرسال OTP | `POST /oauth2/registration` form: `msisdn&client_id&scope=smsotp` |
| التحقق + التوكن | `POST /oauth2/token` form: `otp&mobileNumber&grant_type=mobile&scope=openid` |
| تجديد الجلسة | `POST /oauth2/token` form: `grant_type=refresh_token&scope=djezzyAppV2` |
| 🎁 هدية 2 جيجا | `POST /djezzy-api/api/v1/subscribers/{msisdn}/subscription-product` بحمولة `GIFTWALKWIN` + `GIFTWALKWIN2GO` (steps=10000) |
| 🔵 عرض مدفوع | نفس المسار بحمولة `{"data":{"id":"<CODE>","type":"products"}}` |
| 🎀 هدية QR | `POST /mobile-api/api/v1/services/scan/activate-reward/{msisdn}` `{qrCode}` |
| 👥 بونص الدعوة | `POST /djezzy-api/api/v1/subscribers/{msisdn}/member-get-member` بحمولة `MGM-BONUS` |
| 📊 البروفايل | `GET /djezzy-api/api/v1/subscribers/{msisdn}` |
| 📜 السجل | `GET /mobile-api/api/v1/subscribers/subscription-history/{msisdn}` |

### تجاوز الحجب الجغرافي (طبقات المسارات)

**مُختبَر عملياً (2026):** بوابة `apim.djezzy.dz` تعيد `403 Forbidden` (nginx) لكل
العناوين الأجنبية — من Vercel ومن بروكسيات عالمية متعدّدة — بينما جذر النطاق
يعمل عادياً. أي: الحجب **على مستوى البلد** (الجزائر فقط)، وليس على Vercel تحديداً.
لذلك ترتيب المحاولة في `routes.js`:

1. **relay** — `DJEZZY_RELAY_URL`: خادم وسيط تشغّله داخل الجزائر (`relay/`). ✅ **الحل الوحيد المضمون**
2. **مباشر** — من الاستضافة (`DJEZZY_DIRECT=1`) — يفشل بـ403 خارج الجزائر ثم يُجتاز.
3. **بروكسياتك** — `DJEZZY_PROXIES` (صيغ: `http://user:pass@host:port` أو `host:port:user:pass`).
4. **بروكسيات عمومية** — اكتشاف تلقائي من قوائم عالمية (`DJEZZY_AUTO_PROXY=1`).

الأخطاء الشبكية **و403/451 (الحجب الجغرافي)** تُكيَّف للمسار التالي؛ أي استجابة
HTTP أخرى تُعتبر نهائية. الحالة تُعرض في `/health` (`djezzy.routes`) و
`/api/probe?key=…&mode=otp` (اختبار POST حقيقي) و `mode=proxies` (اختبار البروكسيات).

### تشغيل relay داخل الجزائر (خطوات كاملة)

تحتاج جهازاً داخل الجزائر (حاسب/هاتف) ونفقاً مجانياً لأن عنوانك خلف NAT:

```bash
# 1) المصدر + التوكن
git clone https://github.com/bezzagabdou-source/Absorbs && cd Absorbs/djezzy-bot/relay
npm install
export RELAY_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
echo "احتفظ بهذا الرمز — ستحتاجه على Vercel: $RELAY_TOKEN"

# 2) التشغيل
npm start        # 🟢 يعمل على المنفذ 8787

# 3) نفق عام مجاني (اختر واحداً — أيٌّ منها يعطيك https://…)
cloudflared tunnel --url http://localhost:8787   # ← بدون حساب، يعطي https://xxx.trycloudflare.com
# أو:  bore local 8787 --to bore.pub             # ← بدون حساب
# أو:  ngrok http 8787                           # ← يحتاج حساب مجاني
```

(على الهاتف: Termux → `pkg install nodejs-lts git` ثم نفس الأوامر؛
`cloudflared` يُنزَّل كملف تنفيذي واحد من github.com/cloudflare/cloudflared/releases.)

ثم على Vercel (أو اطلب مني أنا):

```
DJEZZY_RELAY_URL=https://<عنوان-النفق-الخاص-بك>
DJEZZY_RELAY_TOKEN=<نفس RELAY_TOKEN أعلاه>
```

وأعد النشر، ثم تحقّق: `/api/probe?key=<WEBHOOK_SECRET>&mode=otp` يجب أن يعود
بـ `"route":"relay"` وحالة ليست 403.

---

## 🎨 التصميم الملوّن والإيموجيات

- **داخل الشات**: أزرار INLINE مصنّفة — 🟢 «الهدايا المجانية» · 🔵 «العروض
  المدفوعة» · 🔴 «حذف/تأكيد» (تيليجرام لا يسمح بخلفيات ملوّنة للأزرار داخل
  الشات، فاللون عبر الفئة والإيموجي).
- **صفحة الويب `/app`**: أزرار حقيقية بخلفيات **زرقاء/خضراء/حمراء** تتصل
  بالمحرّك مباشرة عبر `initData` (تحقق HMAC) — تعمل داخل تيليجرام Mini App.
- **`/emojis`**: 9 إيموجيات متحركة (هدية، نار، صاروخ، إشارة، عملة، صح،
  ساعة، احتفال، نجمة) مبنية HTML/CSS/SVG خالص — بدون IDs وبدون ملفات خارجية.

---

## 🧪 الاختبارات

```bash
npm test          # 56 اختباراً (محرّك + واجهة + عميل مباشر + كتالوج + initData)
npm run test:engine
npm run test:ux
npm run test:live # الشكل الحقيقي للطلبات ضد سيرفر وهمي
npm run check
```

---

## 🩺 تشخيص سريع

| الرابط | ماذا يخبرك |
|---|---|
| `/health` | التوكن، وضع جيزي، **المسارات المتاحة وآخر مسار نجح**، التخزين |
| `/api/setup?key=` | ضبط/حذف الويبهوك |
| `/api/diagnose?key=` | فحص شامل بخطوات إصلاح لكل بند |
| `/api/probe?key=` | هل يصل هذا النشر إلى `apim.djezzy.dz` فعلاً؟ |
| `/api/tcp?key=&host=` | فحص TCP مباشر (تشخيص حجب) |

---

## ⚖️ تنبيه مهم

هذا المشروع أداة أتمتة شخصية لإدارة أرقام تملكها أنت. استخدامه على أرقام لا
تملكها أو لاستغلال عروض ترويجية قد يخالف شروط خدمة جيزي والقانون —
المسؤولية على المستخدم. الرموز المشفّرة لا تُعرض، ولا يُفعَّل أي عرض مدفوع
إلا بتأكيد صريح.

## 📄 الترخيص

استخدام شخصي — عدّل ما تشاء داخل مستودعك الخاص.
