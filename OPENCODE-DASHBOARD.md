# OpenCode Dashboard — لوحة تحكم OpenCode من الهاتف

واجهة ويب عربية (RTL) بتصميم داكن Mobile-first، تشغّل OpenCode في الخلفية وتتحكم به من
الهاتف: محادثة لحظية، إدارة الجلسات، اختيار النموذج، الموافقة على الأدوات، إعادة تشغيل
السيرفر، وفحص حالة الاتصال.

> المسار: **`/opencode`** · السيرفر: **`opencode serve` على المنفذ 4000** · الواجهة: **Next.js على المنفذ 3000**

---

## 1) البنية

```
 iPhone / متصفح
      │  https://<codespace>-3000.app.github.dev/opencode
      ▼
 Next.js Dashboard (منفذ 3000)
   ├─ صفحة /opencode  (React, Mobile-first, Dark)
   └─ /api/opencode/* (proxy من جهة الخادم فقط)
      │  http://127.0.0.1:4000  +  Basic Auth
      ▼
 OpenCode Server (منفذ 4000)  ──►  مزود النموذج (GitHub Copilot / OpenCode / ...)
```

- المتصفح **لا يتصل** بالمنفذ 4000 مباشرة، لذلك لا حاجة لفتح المنفذ 4000 في الهاتف.
- كلمة مرور Basic Auth تبقى في الخادم (`.opencode/server-auth.json` أو متغير البيئة)
  ولا تُرسل إلى المتصفح.
- قناة الأحداث (SSE) تمرّ عبر `/api/opencode/events`، لذلك تظهر الردود والأدوات
  والتنبيهات لحظياً.

---

## 2) التشغيل في GitHub Codespaces

1. افتح المشروع في Codespace (أو أنشئ واحداً من المستودع).
2. عند إنشاء الحاوية، `postCreateCommand` يثبّت `opencode-ai` وحزم المشروع.
3. عند بدء الحاوية، `postStartCommand` يشغّل:
   - `scripts/opencode/start-opencode.sh` → السيرفر على 4000 مع Basic Auth.
   - `scripts/opencode/start-dashboard.sh` → الواجهة على 3000.
4. من **Ports** في Codespaces، افتح المنفذ **3000** (Dashboard). المنفذ 4000
   (OpenCode Server) معرّف أيضاً ليكون **Public** كما هو مطلوب.
5. افتح `/opencode` من الهاتف وأضفه إلى الشاشة الرئيسية (Safari → مشاركة → إضافة إلى
   الشاشة الرئيسية).

`.devcontainer/devcontainer.json` يعرّف المنفذين 3000 و4000 مع `visibility: "public"`
و`onAutoForward: "notify"`.

### متغيرات البيئة (اختيارية)

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `OPENCODE_PORT` | `4000` | منفذ سيرفر OpenCode |
| `OPENCODE_HOST` | `0.0.0.0` | عنوان الاستماع (يجب أن يكون `0.0.0.0` ليصل من الهاتف) |
| `OPENCODE_SERVER_URL` | `http://127.0.0.1:4000` | الرابط الذي يستعمله الـ proxy |
| `OPENCODE_SERVER_USERNAME` | `opencode` | اسم مستخدم Basic Auth |
| `OPENCODE_SERVER_PASSWORD` | (توليد تلقائي) | كلمة مرور السيرفر؛ تُحفظ في `.opencode/server-auth.json` |
| `DASHBOARD_PORT` | `3000` | منفذ الواجهة |
| `DASHBOARD_HOST` | `0.0.0.0` | عنوان استماع الواجهة |

إذا لم تضع `OPENCODE_SERVER_PASSWORD`، يولّد السكربت كلمة مرور عشوائية (24 بايت)
ويحفظها في `.opencode/server-auth.json` بصلاحية `600`. هذه الحاوية هي الوحيدة التي
تقرأها. لا تُشاركها.

---

## 3) التشغيل محلياً (بدون Codespaces)

```bash
# 1) تثبيت OpenCode (مرة واحدة)
npm install -g opencode-ai

# 2) تثبيت حزم الواجهة
npm install

# 3) تشغيل السيرفر (ينتظر /global/health)
bash scripts/opencode/start-opencode.sh

# 4) تشغيل الواجهة في طرفية أخرى
bash scripts/opencode/start-dashboard.sh
# أو: npm run dev -- --port 3000 --hostname 0.0.0.0
```

ثم افتح <http://localhost:3000/opencode>.

أوامر السكربت:

```bash
bash scripts/opencode/start-opencode.sh            # start (idempotent)
bash scripts/opencode/start-opencode.sh restart    # stop + start
bash scripts/opencode/start-opencode.sh status     # فحص الحالة
bash scripts/opencode/start-opencode.sh stop       # إيقاف السيرفر
```

السجلات: `.opencode/logs/opencode.log` و`.opencode/logs/dashboard.log`.

---

## 4) استخدام الواجهة

| الميزة | أين |
|---|---|
| محادثة مع OpenCode | حقل الإدخال أسفل الشاشة (Enter للإرسال) |
| الردود اللحظية | تُبنى من SSE (`message.updated` / `message.part.updated`) |
| عرض الأدوات والخطأ | بطاقات داخل رد المساعد (bash, read, edit, …) |
| الجلسات | زر المحادثات في الرأس → اختيار / حذف / محادثة جديدة |
| النموذج | زر النموذج داخل حقل الإدخال → بحث واختيار (متصل + مجاني) |
| الموافقة على الأدوات | بطاقة «OpenCode يطلب إذناً» أعلى حقل الإدخال |
| الأسئلة | بطاقة «OpenCode يحتاج توضيحاً» مع خيارات/إجابة مخصصة |
| إعادة التشغيل | زر ↻ في الرأس أو من بطاقة الحالة |
| حالة الاتصال | شارة أعلى الشاشة (متصل/غير متصل/جارٍ الفحص) |
| إيقاف التوليد | زر ■ مكان زر الإرسال أثناء العمل |
| معلومات السيرفر | زر ⓘ في الرأس (العنوان، الإصدار، المشروع، القناة، النسخ) |

### المصادقة على النموذج

OpenCode يحتاج مزوداً نموذجاً مُصادقاً عليه. أشهر الخيارات:

```bash
# GitHub Copilot (يستخدم GITHUB_TOKEN إن كان موجوداً)
opencode auth login

# أو مزود OpenCode المجاني
opencode auth login   # اختر OpenCode

# أو أي مزود يدعمه OpenCode (Anthropic, OpenAI, Gemini, Groq, ...)
opencode auth login
```

يمكنك أيضاً ضبط مزود عبر `opencode.json` أو متغيرات البيئة. بعد المصادقة، أعد تشغيل
السيرفر ليظهر المزود في قائمة النماذج. النماذج المجانية موسومة بـ «مجاني» في الواجهة.

> في بيئة هذه المهمة (Sandbox) الوصول إلى مزودات النماذج محجوب، لذلك ستظهر رسالة
> `ECONNRESET` عند إرسال رسالة. هذا متوقع هنا؛ في Codespace حقيقي مع مزود مُصادق عليه
> يعمل الرد. الواجهة تعرض الخطأ بأمانة ولا تتظاهر برد.

---

## 5) الـ API

| Method | Path | الوصف |
|---|---|---|
| GET | `/api/opencode/status` | الحالة، الإصدار، المشروع، عدد الجلسات، هل السيرفر محمي |
| POST | `/api/opencode/restart` | يعيد تشغيل السيرفر عبر السكربت ثم يعيد الحالة |
| GET | `/api/opencode/sessions` | قائمة الجلسات (الأحدث أولاً) |
| POST | `/api/opencode/sessions` | إنشاء جلسة `{ title?, model? }` |
| GET | `/api/opencode/sessions/:id` | معلومات جلسة |
| DELETE | `/api/opencode/sessions/:id` | حذف جلسة |
| GET | `/api/opencode/sessions/:id/messages` | رسائل الجلسة |
| POST | `/api/opencode/sessions/:id/messages` | إرسال prompt (async) `{ text, model? }` |
| POST | `/api/opencode/sessions/:id/abort` | إيقاف التوليد |
| GET | `/api/opencode/events` | SSE proxy لأحداث OpenCode |
| GET | `/api/opencode/models` | نماذج المزودين المتصلين + النماذج المجانية |
| GET | `/api/opencode/permissions` | طلبات الإذن والأسئلة المعلّقة |
| POST | `/api/opencode/permissions/:id` | `{ reply: "once" \| "always" \| "reject" }` |
| POST | `/api/opencode/questions/:id` | `{ answers: string[][] }` |

كل مسارات الـ API من نوع `force-dynamic` و`runtime = "nodejs"`، وترجع
`Cache-Control: no-store`.

---

## 6) الملفات

| الملف | الدور |
|---|---|
| `.devcontainer/devcontainer.json` | صورة الحاوية، تثبيت OpenCode، تشغيل السيرفرين، المنافذ العامة |
| `scripts/opencode/start-opencode.sh` | تشغيل/إيقاف/فحص السيرفر + Basic Auth + انتظار الصحة |
| `scripts/opencode/start-dashboard.sh` | تشغيل الواجهة على 3000 مع انتظار الجاهزية |
| `src/lib/opencode/server.ts` | عميل السيرفر، الحالة، الجلسات، النماذج، الأذونات |
| `src/lib/opencode/client.ts` | عميل الواجهة (fetch) |
| `src/lib/opencode/types.ts` | أنواع OpenCode |
| `src/app/api/opencode/**` | مسارات الـ proxy |
| `src/app/opencode/page.tsx` | صفحة الواجهة + metadata/viewport |
| `src/components/opencode/dashboard.tsx` | الحالة والاتصال والـ SSE والتخطيط |
| `src/components/opencode/composer.tsx` | حقل الإدخال |
| `src/components/opencode/message-item.tsx` | عرض الرسائل والأدوات والأخطاء |
| `src/components/opencode/approval.tsx` | بطاقات الإذن والأسئلة |
| `src/components/opencode/sheets.tsx` | الجلسات، النماذج، حالة السيرفر |
| `src/components/opencode/markdown.tsx` | عرض Markdown للردود |
| `src/components/opencode/ui.tsx` | عناصر مشتركة (Toasts, Sheet, StatusPill, …) |

---

## 7) الأمان

- السيرفر محمي بـ **HTTP Basic Auth**، وكلمة المرور لا تغادر الخادم.
- الواجهة نفسها **لا تحتوي طبقة تسجيل دخول**؛ رابط Codespace العام هو الحماية.
  لا تشارك الرابط مع من لا تثق به، لأنه يتحكم بسيرفر تنفيذ أوامر.
- المنفذ 4000 عام (كما طلبت) لكنه محمي بكلمة مرور؛ لا تضع كلمة المرور في أي مكان عام.
- `.opencode/` مستثنى من Git (pid + logs + كلمة المرور).
- لا تُمرّر أي مفاتيح API إلى المتصفح؛ كل الطلبات تمرّ عبر خادم Next.js.

---

## 8) استكشاف الأخطاء

| العرض | السبب / الحل |
|---|---|
| «السيرفر غير متصل» | شغّل `bash scripts/opencode/start-opencode.sh status` ثم `restart` |
| `401` | كلمة مرور السيرفر لا تطابق `.opencode/server-auth.json`؛ أعد التشغيل بالسكربت |
| «جارٍ الفحص» ثم «غير متصل» | تأكد أن المنفذ 4000 يستمع على `0.0.0.0` |
| `ECONNRESET` في الرد | مزود النموذج غير متاح من الشبكة أو المفتاح غير صالح؛ جرّب مزوداً آخر |
| لا تظهر الردود | تحقق من أن `/api/opencode/events` يرجع `text/event-stream` (قد يمنعها proxy خارجي) |
| صفحة فارغة على الهاتف | استخدم رابط المنفذ 3000 وليس 4000، وتأكد من فتح المنفذ Public |
| النموذج غير موجود | أعد تحميل قائمة النماذج، أو اختر «تلقائي» |

---

## 9) ملاحظة حول هذه البيئة

تم تثبيت `opencode-ai` وتشغيل السيرفر على 4000 مع Basic Auth، وتشغيل الواجهة على
3000، والتحقق من:
`status` · `sessions` · `messages` · `events` (SSE) · `models` · `restart`.

الردود الفعلية من النموذج لا يمكن إكمالها داخل هذه الـ Sandbox لأن الوصول إلى
`api.githubcopilot.com` (ومزودات النماذج الأخرى) محجوب. في Codespace حقيقي مع
`GITHUB_TOKEN` أو مزود مُصادق عليه، تعمل المحادثة مباشرة.
