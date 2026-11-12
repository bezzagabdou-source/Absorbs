# Dz connect — تواصل بلا حدود 💜

تطبيق تواصل اجتماعي كامل بتصميم **Dark Glassmorphism** فاخر وتجربة هاتف ناتيفية (Mobile-First)، يعمل كـ **PWA** قابل للتثبيت، ومبني على **Next.js 15 + Supabase** (Auth + Postgres + Storage + Realtime) وجاهز للنشر الفوري على **Vercel**.

## ✨ المميزات

| الميزة | التفاصيل |
|---|---|
| 🔐 حسابات حقيقية | Supabase Auth: إنشاء حساب (اسم ظاهر + `@username` فريد بفحص توفر حي) + دخول + جلسات آمنة بالكوكيز عبر Middleware |
| 📰 Feed حي | نشر نص (500 حرف) وصور (ضغط تلقائي في المتصفح + رفع إلى Storage)، والمنشورات الجديدة تظهر للجميع لحظيًا عبر Realtime |
| ❤️ إعجاب تفاعلي | زر قلب متفجر + عدّاد فوري Optimistic يتزامن عند كل المستخدمين، ونقر مزدوج على الصورة للإعجاب |
| 💬 تعليقات حية | قسم تعليقات داخل كل منشور يبث مباشرة، مع حذف لصاحب التعليق/المنشور |
| ✉️ رسائل خاصة DM | بحث بأي `@username` ← محادثة فورية (Realtime) + مؤشر «يكتب الآن…» + إيصالات قراءة ✓✓ + عدّادات غير مقروء في القائمة وشريط التنقل |
| 👤 بروفايل كامل | غلاف، صورة، نبذة، إحصائيات (منشورات/متابِعون/أتابعهم)، متابعة، تبويب «أعجبني»، وإعدادات: تعديل الهوية + رفع الصورة + حذف الحساب |
| 🔭 اكتشف | بحث فوري عن الأشخاص + أشخاص مقترحون + أكثر المنشورات رواجًا |
| 📱 PWA 100% | Manifest عربي RTL + Service Worker (يعمل دون إنترنت بصفحة Offline أنيقة) + أيقونات Maskable + زر تثبيت داخل التطبيق |
| 🔒 أمان | Row Level Security على كل جدول، والمفتاح السري لا يعمل إلا في الخادم (Route Handlers) |

## 🚀 التشغيل في 3 خطوات

### 1) فعّل قاعدة البيانات (مرة واحدة — دقيقتان)

افتح [Supabase SQL Editor](https://supabase.com/dashboard/project/mcgnmjnzibjtjazcmwkd/sql/new)، الصق محتوى [`supabase/schema.sql`](./supabase/schema.sql) كاملًا واضغط **Run**.
هذا ينشئ الجداول والصلاحيات (RLS) ومحفّز إنشاء البروفايل وحاويات التخزين وRealtime ودالة المحادثات.

> اختياري للتجربة الفورية: من **Authentication → Providers → Email** عطّل `Confirm email` حتى يدخل المستخدم مباشرة بعد التسجيل دون رابط بريدي.

### 1.ب) محتوى تجريبي فوري (اختياري) 🌱

بعد `schema.sql`، نفّذ [`supabase/seed.sql`](./supabase/seed.sql) بنفس الطريقة وسيُملأ التطبيق فورًا:
6 حسابات تجريبية جزائرية (صور ونبذ تعريفية) + 12 منشورًا + إعجابات وتعاليق ومتابعات ومحادثة خاصة.

- الدخول لأي حساب تجريبي: البريد مثل `amine@absorbs.dz` وكلمة المرور للجميع `Dz connect@2026`
- حذف كل المحتوى التجريبي قبل الإطلاق الحقيقي بسطر واحد موجود في نهاية ملف الـ Seed.

### 2) المتغيرات (مضبّطة مسبقًا ✅)

ملف `.env.local` موجود أصلًا وفيه قيم مشروعك العامة. المتغيرات المستخدمة:

| المتغير | النوع | أين يعمل |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | عام | المتصفح + الخادم |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | عام (محمي بـ RLS) | المتصفح + الخادم |
| `SUPABASE_SECRET_KEY` | 🔒 سري — خادم فقط | `src/lib/supabase/admin.ts` ← يستخدم في `POST /api/account/delete` لحذف المستخدم نهائيًا من Auth |

> ⚠️ **تنبيه مهم:** المفتاح السري الذي شاركته في المحادثة كان مقطوعًا (`sb_secret_t7uws...`) ولا يمكن استعماله كما هو. الصق المفتاح **الكامل** من:
> Supabase Dashboard → Project Settings → API Keys → **secret**
> في `.env.local` محليًا وفي Vercel (انظر الخطوة 3). لا تشارك المفتاح الكامل علنًا أبدًا، وإذا حدث فبدّله (Rotate) من نفس الصفحة. بدونه يعمل كل شيء ما عدا «الحذف النهائي لحساب Auth» (يتحول تلقائيًا لحذف الملف الشخصي + تسجيل الخروج).

### 3) شغّل أو انشر

```bash
cd absorbs-app
npm install
npm run dev        # http://localhost:3000
```

**النشر على Vercel (الأسرع):**

1. ارفع المستودع إلى GitHub ثم **Import** في Vercel.
2. ⚙️ **Root Directory = `absorbs-app`** (بقية الإعدادات تُكتشف تلقائيًا: Next.js).
3. في **Environment Variables** أضف:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://mcgnmjnzibjtjazcmwkd.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...` (قيمتك العامة)
   - `SUPABASE_SECRET_KEY` = المفتاح السري **الكامل** (Production فقط، لا تضف له `NEXT_PUBLIC_`)
4. **Deploy** — ثم من Supabase: **Authentication → URL Configuration** أضف نطاق Vercel إلى `Site URL` و`Redirect URLs` (`https://YOUR-DOMAIN/**`) حتى تعمل روابط تأكيد البريد.

تحقق سريع بعد النشر: افتح `https://YOUR-DOMAIN/api/health` (يعرض حالة الإعداد دون أي مفاتيح).

## 📱 تثبيت التطبيق (PWA)

- **أندرويد/كروم:** زر «تثبيت» داخل التطبيق (شاشة الترحيب/الإعدادات) أو من قائمة المتصفح.
- **آيفون/سفاري:** زر المشاركة ← «إضافة إلى الشاشة الرئيسية».
- يعمل بملء الشاشة، ويعرض صفحة Offline أنيقة عند انقطاع النت، بينما تبقى البيانات الاجتماعية حية دائمًا (لا تُخزّن مؤقتًا أبدًا).

## 🗂️ هيكل المشروع

```
absorbs-app/
├─ supabase/schema.sql          قاعدة البيانات كاملة (انسخ والصق مرة واحدة)
├─ public/
│  ├─ sw.js                     Service Worker (Offline + Cache)
│  ├─ offline.html              صفحة انقطاع الاتصال
│  └─ icons/                    أيقونات PWA ‏(192/512/Maskable/Apple)
├─ src/
│  ├─ middleware.ts             حماية المسارات + تجديد الجلسة
│  ├─ app/
│  │  ├─ welcome/               شاشة الترحيب
│  │  ├─ login/ · signup/       الدخول والتسجيل (Supabase Auth)
│  │  ├─ (main)/                القشرة المحمية: feed · explore · messages/[id] · profile · u/[username] · post/[id]
│  │  ├─ api/account/delete     حذف الحساب (بالمفتاح السري — خادم فقط)
│  │  ├─ api/health             فحص حالة الإعداد
│  │  └─ manifest.ts            PWA Manifest
│  ├─ components/               layout · feed · social · profile · auth · pwa · ui
│  └─ lib/
│     ├─ supabase/              config (مفاتيح عامة مضبّطة) · client · server · admin (سري) · middleware
│     ├─ queries.ts             استعلامات الـ Feed والبروفايل والرسائل
│     ├─ types.ts · utils.ts
└─ vercel.json                  إعدادات Vercel (Headers للـ SW والأيقونات)
```

## 🧪 سيناريو تجربة مقترح

1. أنشئ حسابين من نافذتين/متصفحين مختلفين (`@ali` و`@sara` مثلًا).
2. انشر صورة من الأول — ستظهر فورًا عند الثاني دون تحديث.
3. اضغط ❤️ وعلّق من الثاني — شاهد العدّاد والتعليق يصلان لحظيًا للأول، وانقر نقرًا مزدوجًا على الصورة.
4. من «الرسائل» ابحث عن `@ali` وراسله — لاحظ مؤشر الكتابة وإيصال القراءة ✓✓ وعدّاد غير المقروء.

صُنع بحب في الجزائر ⚡

## 🌍 النشر المباشر وAPK الأندرويد

- **الموقع الحي (Vercel):** يُنشر هذا المجلد كمشروع Vercel مستقل (Root Directory = `absorbs-app`) مع المتغيرين العامين مضبوطين في إعدادات المشروع. بعد أول نشر أضف نطاقك في Supabase → Authentication → URL Configuration (`Site URL` + `Redirect URLs`) حتى تعمل روابط تأكيد البريد، وأضف `NEXT_PUBLIC_SITE_URL` بنفس النطاق ثم أعد النشر.
- **تطبيق أندرويد (APK):** مجلد `absorbs-android/` في جذر المستودع يحتوي غلاف WebView أصليًا، وworkflow ‏GitHub Actions (`.github/workflows/absorbs-apk.yml`) يبنيه تلقائيًا ويرفعه إلى **Releases** — رابط التحميل المباشر:
  `https://github.com/bezzagabdou-source/Dz connect/releases/download/absorbs-v1.0.0/Dz connect.apk`
  على الهاتف: افتح الرابط، ثبّت، وفعّل «التثبيت من هذا المصدر» عند الطلب (APK موقّع بمفتاح Debug للتجربة).


---

## 🆕 تحديث Dz connect v2 — ما الجديد وكيف تفعّله

ميزات v2: إعادة تسمية كاملة إلى **Dz connect** بهوية زمردية فاخرة (بدون أي لون وردي)، مكالمات صوت وفيديو عبر الإنترنت (WebRTC)، قصص 24 ساعة، حفظ المنشورات، إشعارات، حضور "متصل الآن"، رسائل صوتية وصور داخل المحادثات، سجل مكالمات، شارات توثيق، مركز حماية (كلمة المرور + تحقق بخطوتين MFA + جلسات + حظر/إبلاغ).

### خطوة واحدة فقط في Supabase
افتح SQL Editor والصق محتوى **`supabase/upgrade-v2.sql`** ثم Run (ينشئ جداول stories/story_views/saves/blocks وعمود is_verified — آمن وإيدمبوتنت، لا يمس بياناتك الحالية).

> ملاحظة المكالمات: تعمل مباشرة بين المتصفحات/التطبيق عبر WebRTC + Supabase Realtime للإشارات. للحصول على أفضل جودة عبر شبكات المشغّلين يُفضّل لاحقًا إضافة خادم TURN خاص.

---

## 🤖 Dz connect ai — المساعد الذكي (هندسة v3)

- **الخادم فقط:** `src/lib/ai/provider.ts` يقرأ `AI_API_KEY` من بيئة الخادم (Vercel Env / `.env.local`) ويدعم Gemini (افتراضي، النموذج gemini-2.5-flash) وGroq وOpenRouter بمجرد تغيير المتغيرات — المفتاح القديم من مشروع Nexus مربوط كـ `AI_API_KEY` مشفّرًا في Vercel.
- **النقاط:** `POST /api/ai/chat` (محادثة + أفعال: improve-post / post-ideas / smart-replies) محمي بجلسة Supabase وحدّ معدّل 20 طلبًا/دقيقة لكل مستخدم. `GET /api/ai/status` فحص صحي يعرض booleans فقط.
- **الواجهة:** زر عائم ✨ في كل التطبيق يفتح `/ai` (محادثة على طراز Meta AI + اقتراحات سريعة + نسخ كمنشور)، وزر **Dz connect ai** داخل مؤلّف المنشورات لتحسين المسودة قبل النشر.
- **الأمن السيبراني:** رؤوس CSP/HSTS/X-Frame-Options/Permissions-Policy من `next.config.ts`، وRLS صارم على كل الجداول في Supabase، و2FA/MFA وحظر وإبلاغ من مركز الحماية.

### خطوات فحص الذكاء بعد النشر
1. افتح `/api/ai/status` — يجب أن ترى `"configured": true, "reachable": true`.
2. سجّل دخولك واضغط الزر العائم ✨ وجرّب «اكتب لي منشورًا».
3. لاستبدال المفتاح مستقبلًا: عدّل `AI_API_KEY` في Vercel ← Project ← Settings ← Environment Variables ثم أعد النشر (لا حاجة لتغيير أي كود).
