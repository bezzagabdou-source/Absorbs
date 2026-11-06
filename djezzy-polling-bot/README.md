# 🤖 بوت جيزي — Long Polling (Telegraf)

بوت تيليجرام يشتغل **بدون Webhook وبدون Serverless**: يتصل بخوادم جيزي مباشرة
من الجهاز الذي يشغّله (هاتف في الجزائر، حاسوب، أو VPS جزائري).

> **لماذا Polling؟** خوادم جيزي `apim.djezzy.dz` ترفض أي اتصال من خارج الجزائر.
> أي استضافة سحابية (Vercel / Railway / Render) تفشل حتماً. التشغيل المحلي يحلّ المشكلة من جذورها.

---

## 📁 الملفات

| الملف | الوظيفة |
|---|---|
| `index.js` | البوت نفسه: Telegraf + `bot.launch()` (Polling)، الأزرار، تدفّق OTP، الهدايا |
| `djezzy.js` | كل طلبات جيزي: OTP، التوكن، التجديد، الهدايا، السجل + ترويسات التطبيق الرسمي + Proxy/Agent |
| `store.js` | تخزين الجلسات على القرص مع تشفير AES-256-GCM |
| `diag.js` | فحص الإعدادات + DNS + IPv4 + الوصول إلى جيزي قبل التشغيل |
| `selftest.js` | 19 اختباراً بلا إنترنت (سيرفر وهمي يقلّد واجهة جيزي) |
| `install-termux.sh` | تثبيت كامل على Termux: Node + pm2 + `.env` + فحص + تشغيل 24/7 |
| `.env.example` | نموذج الإعدادات |

---

## ⚡ التشغيل على الهاتف (Termux) — أمر واحد

1. ثبّت **Termux** من F-Droid: <https://f-droid.org/packages/com.termux/>
2. الصق:

```bash
curl -sL https://raw.githubusercontent.com/bezzagabdou-source/Absorbs/main/djezzy-polling-bot/install-termux.sh | bash
```

سيقوم تلقائياً بـ: تثبيت Node.js وgit وpm2 → تحميل المشروع → `npm install` →
إنشاء `.env` → فحص الاتصال → تشغيل البوت عبر **pm2** (24/7، يعيد التشغيل تلقائياً).

```bash
pm2 logs djezzy-bot      # السجلات
pm2 restart djezzy-bot   # بعد أي تعديل في .env
```

---

## 💻 التشغيل على حاسوب / VPS جزائري

```bash
git clone https://github.com/bezzagabdou-source/Absorbs
cd Absorbs/djezzy-polling-bot
npm install
cp .env.example .env      # ضع BOT_TOKEN وبيانات جيزي
npm run diag              # تأكد أن الاتصال بجيزي يعمل
npm start                 # تشغيل البوت
```

**التشغيل الدائم على خادم:**

```bash
npm i -g pm2
pm2 start index.js --name djezzy-bot
pm2 save && pm2 startup
```

---

## 🔑 الإعدادات (`.env`)

```ini
BOT_TOKEN=...            # من @BotFather
SESSION_KEY=...          # 64 hex — ولّده: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

DJEZZY_CLIENT_ID=...     # بيانات عميل تطبيق جيزي
DJEZZY_CLIENT_SECRET=...
DJEZZY_CLIENT_ID_LEGACY=...      # يُجرَّب تلقائياً إذا رُفض الأول
DJEZZY_CLIENT_SECRET_LEGACY=...

DJEZZY_USER_AGENT=MobileApp/3.0.9 (Android 13; DalilDjezzy)
DJEZZY_ACCEPT_LANGUAGE=ar-DZ
DJEZZY_TIMEOUT_MS=45000
DJEZZY_RETRIES=1

# وكيل اختياري (إن كنت خارج شبكة جزائرية)
# DJEZZY_PROXY=http://user:pass@host:port

ALLOWED_PREFIXES=7       # أرقام جيزي فقط
```

---

## 🌐 طبقة الوكيل (Proxy / Agent)

`djezzy.js` يدعم ثلاث طرق:

1. **متغيّر بيئة** (الأسهل): `DJEZZY_PROXY=http://user:pass@host:port`
   يقبل أيضاً `HTTPS_PROXY` / `HTTP_PROXY` القياسيين.
2. **تمرير كائن Proxy مباشرة**:

```js
const client = new Djezzy({
  clientId: '…',
  clientSecret: '…',
  proxy: { host: '127.0.0.1', port: 8080, auth: { username: 'u', password: 'p' } },
});
```

3. **Agent مخصّص** (مثلاً SOCKS5):

```js
import { SocksProxyAgent } from 'socks-proxy-agent';
const client = new Djezzy({ clientId: '…', clientSecret: '…', httpsAgent: new SocksProxyAgent('socks5://127.0.0.1:1080') });
```

> ⚠️ الوكيل يجب أن يكون **داخل الجزائر**، وإلا فالحجب يبقى قائماً.

### تعليق الشبكة: `ECONNABORTED` / `ETIMEDOUT` (IPv4)

على شبكات الهاتف (4G/Wi-Fi جزائرية) يحاول Node الاتصال عبر **IPv6 أولاً**،
فيَعلق الطلب حتى انتهاء المهلة رغم أن IPv4 يعمل — وهذا يظهر للمستخدم كـ
«حجب جغرافي» وهو ليس كذلك. لذلك `djezzy.js` اليوم:

- يفرض `dns.setDefaultResultOrder('ipv4first')` + `lookup` بـ `family: 4`.
- يستعمل `https.Agent` مع `keepAlive` (اتصال واحد مُعاد استعماله = أسرع على 4G).
- يعيد المحاولة تلقائياً (**3 محاولات** بفاصل متزايد) قبل إبلاغ المستخدم.
- يُميّز `KIND.TIMEOUT` عن `KIND.GEO`، وكل واحد له رسالة وحلّ مختلف.

| المتغيّر | الافتراضي | الوظيفة |
|---|---|---|
| `DJEZZY_FORCE_IPV4` | `1` | `0` لتعطيل فرض IPv4 (إن كانت شبكتك IPv6 فقط) |
| `DJEZZY_TIMEOUT_MS` | `45000` | مهلة الطلب الواحد |
| `DJEZZY_RETRIES` | `2` | عدد إعادات المحاولة (المجموع = 3 طلبات) |

```bash
npm run diag   # يطبع سجلات A/AAAA + الوضع (IPv4) + زمن الاستجابة
```

### ترويسات تحاكي تطبيق الهاتف

```
User-Agent: MobileApp/3.0.9 (Android 13; DalilDjezzy)
Accept: application/json, text/plain, */*
Accept-Language: ar-DZ
Accept-Encoding: gzip, deflate, br
Connection: keep-alive
X-Requested-With: dz.djezzy.mobile
X-Request-Id: <unique>
```

---

## 🎛 أوامر البوت

| الأمر | الوظيفة |
|---|---|
| `/start` | الترحيب + القائمة |
| `/menu` | القائمة الرئيسية |
| `/diag` | فحص الاتصال بخوادم جيزي |
| `/cancel` | إلغاء العملية الحالية |
| `/help` | شرح مفصّل |

الأزرار: **📱 إضافة رقم · 📊 حالة الرقم · 🎁 هدية 2 جيجا · 🌟 هدية QR · 🗂 أرقامي · 🩺 فحص الاتصال**

---

## 🧪 الاختبارات

```bash
npm run selftest    # 19 اختباراً بلا إنترنت وبلا توكن
npm run diag        # فحص حقيقي للاتصال
```

يغطّي الاختبار: تطبيع الأرقام (07 فقط، أرقام عربية/فارسية)، تشفير الجلسات،
شكل طلبات OTP (query + JSON + الترويسات)، استخراج التوكن، التجديد،
`packageCode` للهدايا، أخطاء `402` / `900901` / `429` / `already`،
تبديل بيانات العميل، قراءة Proxy، تعليق الشبكة → `TIMEOUT` (وليس `GEO`)، وتفعيل وكيل IPv4.

---

## 🩺 استكشاف الأخطاء

| الرسالة | الحل |
|---|---|
| `تعذّر الوصول إلى خوادم جيزي` | أنت خارج الجزائر أو تستعمل VPN → أوقفه واستعمل بيانات الهاتف |
| `ECONNABORTED` / `ETIMEDOUT` | تعليق شبكة (غالباً IPv6) → تأكد `DJEZZY_FORCE_IPV4=1`، وبدّل بين Wi-Fi وبيانات جيزي، وارفع `DJEZZY_TIMEOUT_MS=60000` |
| `ENOTFOUND` / `EAI_AGAIN` | فشل DNS → أطفي Private DNS في أندرويد أو اضبطه على `dns.google` |
| `ECONNRESET` متكرّر | جرّب شبكة أخرى، أو وكيلاً جزائرياً عبر `DJEZZY_PROXY` |
| `رمز التحقق غير صحيح` | أعد إدخال الرمز من SMS (ينتهي بعد دقيقتين) |
| `الشريحة غير مؤهّلة` | الهدية تحتاج باقة مفعّلة/رصيداً كافياً على شريحتك |
| `انتهت الجلسة` | أعد ربط الرقم: 📱 إضافة رقم |
| `409 Conflict` | البوت يحذف الـ Webhook تلقائياً عند التشغيل — تأكد أن نسخة واحدة فقط تعمل |
| `401 Unauthorized` | توكن البوت خطأ أو مُبطَل — أنشئ جديداً من @BotFather |

---

## 🔒 الأمان

- كل `Access/Refresh Token` مشفّر **AES-256-GCM** في `data/sessions.json`.
- مفتاح التشفير في `data/.session-key` (صلاحيات 600) ولا يُرفع إلى Git.
- `.env` و`data/` مستثناة في `.gitignore`.
- البوت يخصّ أرقامك فقط — استعمله بما يوافق شروط خدمة جيزي.
