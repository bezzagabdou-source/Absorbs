# تقرير الإصلاح والتحقّق — FT-bot + ft-panel

**الفرع:** `arena/7f999f3c-absorbs` · **آخر commit:** `bbbb014` · **التاريخ:** 2026-11-14

---

## 1) حالة النشر (Vercel)

| المشروع | Deployment | الحالة | الرابط |
|---|---|---|---|
| `ft-bot` (ft-contest-bot) | `dpl_CLjV1fSGkB6JTLhrfAwcsSsiFQiJ` | **READY / PROMOTED** (production) | `https://ft-bot-bice.vercel.app` |
| `ft-panel` | `dpl_6qrz5hHTHHeRtxZAKjLVTNzMXCqX` | **READY / PROMOTED** (production) | `https://ft-panel-blue.vercel.app` |

ملاحظة مهمة: **النشر التلقائي من Git معطّل على المشروعين** (`gitProviderOptions.createDeployments = disabled`)، لذلك ما كانش ينشر براسو — أنا درت `create_deployment` يدوياً من نفس الـ commit. إلا بغيتي كل push ينشر بوحدو، خاصك تفعّل «Git → Automatically expose / Create deployments» من إعدادات المشروع في Vercel.

كذلك: أول محاولة نشر للبوت طاحت بـ `ENOENT .next/routes-manifest-deterministic.json` — السبب كان إعداد `outputFileTracingRoot` اللي زدت أنا (كان غير باش نسكّت تحذير lockfiles). رجّعتو ودار النشر ناجح (`6f4018d`).

---

## 2) قاعدة البيانات — مخطط + ترحيلات + أمان المعاملات

ملف جديد: `ft-contest-bot/src/db/schema.ts` — 6 ترحيلات **idempotent** مسجّلة في `ft_migrations`:

| الترحيل | المحتوى |
|---|---|
| `0001_core_tables` | `ft_kv` (k/v/n) · `ft_set` · `ft_zset` (score) · `ft_list` (id, k, v) |
| `0002_indices` | فهارس على `ft_set(k,m)` · `ft_zset(k,score desc)` · `ft_list(k,id)` |
| `0003_migrations_table` | `ft_migrations` (تتبّع الترحيلات المطبّقة) |
| `0004_ledger` | `ft_ledger` — دفتر كل حركة نقاط (kind, user_id, delta, balance, ref) + فهرسين |
| `0005_agent_versions` | `ft_agent_versions` — نسخ مفاتيح الوكيل + زر التراجع |
| `0006_webhook_updates` | `ft_update_seen` — تتبّع التحديثات المعالَجة (منع التكرار) |

`store.ts` (Postgres) تعاود كتب ب:
- **تجمع اتصالات واحد** عام + إعادة بناء تلقائية عند عطل الاتصال (`recyclePool`).
- `ensureSchema()` — كتطبّق الناقص مرة واحدة لكل نسخة، وتُعاد المحاولة إلا فشلت.
- `migrationsInfo()` / `dbHealth()` / `transaction(work)`.
- `q()` — كل استعلام كيدوز من هنا مع **إعادة محاولة** للأعطال العابرة (ECONNRESET/EPIPE/…).
- زمنيات صريحة: `statement_timeout`, `idle_in_transaction_session_timeout`, `connectionTimeoutMillis`.
- `postgresUrl()` كتحيّد `channel_binding` (كانت كتخرّب الاتصال مع Neon).

**إصلاحات فعلية في المخزن (باگات حقيقية لاكيتها بالاختبار):**
1. `set()` ثم `incr()` على نفس المفتاح كان كيرجع **قيمة قديمة** (`n` ما كانتش كتصفّر، و`get` كان كيقرا `v` القديم). دابا `set` كتصفّر `n` و`incr` كتحسب من `v` رقمياً.
2. `listPush` كان كيدير نداء لكل عنصر → ولا insert واحد بـ `jsonb_array_elements_text`.
3. `getMany()` جديد — قراءة عدة مفاتيح بنداء واحد (كانت N+1).
4. دفتر نقاط `appendLedger` / `readLedger` في كل الخلفيات (Redis/Postgres/ذاكرة).

---

## 3) نقاط وإحالات ومتجر — ذرّية حقيقية (كانت كتضيّع فلوس)

مشكلة الجذر: عمليات **read-modify-write** على نسخ Vercel المتعددة = نقاط تضيع/تتضاعف.

ملف جديد `src/lib/locks.ts` (`withLock` / `acquireLock` / `releaseLease`) — أقفال موقّتة على المخزن (Redis `SET NX PX` / Postgres upsert شرطي / ذاكرة)، مع `LockBusyError` و انتظار محدود.

| العملية | قبل | بعد |
|---|---|---|
| `addPoints` / `setBalance` | قراءة+كتابة بلا قفل | 🔒 `points:<id>` |
| `createRequest` (استبدال جائزة) | خصم قبل التحقّق من المخزون + مخزون غير محمي + بلا استرجاع عند الفشل | 🔒 `reward:<id>` + `points:<id>`، إعادة قراءة الجائزة داخل القفل، استرجاع كامل (نقاط + مخزون) إلا فشل تسجيل الطلب |
| `decideRequest` (رفض/قبول) | استرجاع النقاط ممكن يتنفّذ مرتين (نقاط من الهوا) | 🔒 `req:<id>` + كتابة الحالة قبل الاسترجاع + رجوع لـ pending إلا فشل الاسترجاع |
| `creditInvite` / `creditActivation` | عدّاد ورصيد منفصلين | 🔒 `invite:<id>` (الاثنين مع بعض) |
| `creditReferral` (bot.ts) | فحص «مُحسوب» خارج القفل → احتساب مزدوج | 🔒 `refcredit:<contest>:<joiner>` |
| `registerGeneralReferral` | كان كيقرا 500 سطر JSON ف كل دخول | مجموعة `genref:credited:ids` (O(1)) |
| `removeAccount*` / `takeAccount` | `listPop` يتقاطع مع إعادة كتابة اللوحة → حساب يرجع | 🔒 `pool:<contest>` مشترك بينهم |
| `readCounter` (stats) | `incr(key, 0)` = **كتابة** في كل قراءة | قراءة خالصة `get` |

كل تعديل رصيد ولا مكتوب في **دفتر النقاط** (`ft_ledger` + `ledger:log`) — شكون، شحال، فعلاش، والرصيد بعدها.

---

## 4) الاشتراك الإجباري `@mxabdou` — مقفول في 4 طبقات

مصدر واحد للحقيقة: **`src/lib/gate.ts`** (`MANDATORY_CHANNEL = "@mxabdou"`, `enforceGatePolicy()`, `isProtectedChannel()`, `mandatoryGate()`, `GATE_LOCK_MESSAGE`).

| الثغرة اللي كانت | الإصلاح |
|---|---|
| `GATE_OFF=1` كان كيطفي البوابة | `forceGateOn()` ولات ترجع `true` دايماً؛ المتغيّر ما بقاش كيتقرا أصلاً |
| `checkChannels()` كانت **fail-open**: أي خطأ من تيليغرام = تجاوز البوابة | ولا **fail-closed** للقناة المحمية: محاولة ثانية بـ backoff، وإلا المستخدم كيبقى محجوز + الخطأ كيتسجّل في اللوحة |
| `agent.ts` `set_gate` + `save_settings` | `set_gate` تحيّد من `ALLOWED_OPS` وولى يرجع رسالة القفل؛ `save_settings` كيدوز من `enforceGatePolicy` وكيرفض `requireJoin !== true` |
| `api/panel/rewards` `save_settings` | `requireJoin` كيتفرض `true`، القناة المحمية كتتزاد دايماً، ومحاولة التعطيل كتتسجّل |
| `api/admin2` `?what=gate_pin&apply=1` | كيدوز من نفس السياسة، وكيرجع `gateLocked: true` و`pinned` من المصدر المحمي |
| مساعد اللوحة (ft-panel) | `lib/gateGuard.js`: حارس **كودي** (ماشي برومبت) — بلاك ليست `set_gate`, منع `db_update` على مفاتيح الإعدادات/الاشتراك، تعقيم قنوات و`requireJoin`، منع الكتابة على الملفات المحمية. مربوط في `lib/ai.js` قبل المزوّد وقبل كل نداء أداة. + القاعدة مكتوبة في البرومبت كمان |
| واجهة اللوحة | checkbox + textarea ديال القناة تحيّدو، وولى كارت **مقفول للقراءة فقط** 🔒 |

تحقّق حقيقي (محلياً، وضع المحاكاة): البوابة كتظهر قبل أي استعمال، وكتفضّل مقفولة حتى إلا طاح `getChatMember`.

---

## 5) استقرار البوت

- **`handleUpdate`**: كل مسار (callback / my_chat_member / join request / chat_member / new members / message) كيدوز من `run()` بـ try/catch مستقل → خطأ في تحديث واحد ما كيوقفش البوت، وكيتسجّل.
- **`instrumentation.ts`**: `installProcessGuards()` كتسجّل `unhandledRejection` + `uncaughtException` في سجل الأخطاء (بلا ما تقتل العملية).
- **`src/lib/errors.ts`**: سجل مركزي بـ **حجب الأسرار** (توكن البوت، `DATABASE_URL`, أي `token=`/`secret=`) + تهدئة (throttle) باش ما يغرقش السجل + سقف 120 مدخل.
- **`src/lib/retry.ts`**: `retry()` بـ exponential backoff + `withTimeout()` + `backoffDelay()`.
- **تيليغرام (`telegram.ts`)**: إعادة محاولة للنداءات **idempotent فقط** (getMe/getChatMember/sendMessage/edit/answerCallback)، احترام `retry_after` ديال 429، وكل فشل شبكي كيتوسم `uncertain` → ما كاينش إرسال مزدوج.
- **الويب هوك**: `claimUpdate()` لمنع تكرار `update_id` (ذاكرة 10 دقائق + مجموعات مشتركة يومية، **مفصولة لكل بوت** `b2`)، مهلة 50 ثانية على `handleUpdate`، و**دائماً 200** باش تيليغرام ما يعاودش يصيفط (إعادة الإرسال = نقاط مضاعفة).
- **حدود الرشق**: `rateLimit()` — رسائل 20/دقيقة (`FLOOD_LIMIT`)، أزرار 45 (`CALLBACK_LIMIT`)، ذكاء اصطناعي (`AI_LIMIT`)، وكل تجاوز كيتسجّل.
- **`resolveOwnerId()`**: وعد مشترك + بلا `await` في كل تحديث (كان كيسكان 200 ألف مستخدم في كل رسالة).

---

## 6) مراقبة وأخطاء في اللوحة (جديدة)

| المسار/العرض | الوظيفة |
|---|---|
| `GET /api/health` (عام، بلا أسرار) | 200/503: توكن، تخزين، قاعدة، ترحيلات، بوابة، تيليغرام، ويب هوك، أخطاء، مستخدمين |
| `GET /api/panel/health` (بمفتاح) | نفس الشي + تفاصيل + سجل الأخطاء |
| `bot_view=errors` + `op=errors_clear` | تبويب **«الأخطاء»** في اللوحة مع التفاصيل والتفريغ |
| `bot_view=health` | تبويب **«الفحص»**: القاعدة، الترحيلات، البوابة، الويب هوك |
| `bot_view=ledger` | تبويب **«دفتر النقاط»**: كل حركة رصيد |

كلها مضافة في `lib/botBridge.js` (allowlist) و`api/admin.js` و`public/dashboard-bot.js`.

---

## 7) متغيّرات البيئة

**زدت في `ft-bot`:** `PANEL_URL=https://ft-panel-blue.vercel.app` (كان ناقص، البوت كان كيعتمد على قيمة مضمّنة)، `MANDATORY_CHANNELS=@mxabdou` (تأكيد صريح للقناة المحمية).

**موجود وسليم:** `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_SECRET`, `ADMIN_PASSWORD`, `PANEL_PUBLIC_KEY=ftai-life-7c3e91`, `CRON_SECRET`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN_2`.

**في `ft-panel`:** `BOT_BASE_URL`, `BOT_PANEL_KEY`, `REDIS_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `SCAN_KEY`, `AGENT_*` — كلها موجودة.

**مهم:** `BOT_PANEL_KEY` (اللوحة) خاصو يساوي `PANEL_PUBLIC_KEY` (البوت) = `ftai-life-7c3e91`. القيمة الحالية موجودة ومطابقة.
**ممنوع:** ما تديرش `GATE_OFF` — الكود ما بقاش كيقراه، لكن خليه محيّد.

---

## 8) التحقّق اللي دار (نتائج حقيقية)

| الاختبار | النتيجة |
|---|---|
| `npx tsc --noEmit` (ft-contest-bot) | **0 أخطاء** |
| `npx next build` (ft-contest-bot) | **ناجح** — 24 مسار |
| `node scripts/verify.mjs` (ويب هوك حقيقي، وضع محاكاة) | **14/14 ناجح**: البوابة قبل الاستعمال · fail-closed عند فشل تيليغرام · منع تكرار `update_id` · `/api/health` 200 · `/api/panel/health` بمفتاح 200 وبلا مفتاح 401 |
| مخطط Postgres + الترحيلات (`test/pg/schema.pg.test.mjs`, PGlite) | 6/6 ترحيلات + إعادة تطبيق idempotent + 8 جداول + 16 فهرس + rollback صحيح |
| كل عمليات المخزن على Postgres (`test/pg/store.pg.test.mjs`) | get/set/incr/zset/list/lease — **كلها ناجحة** (بما فيها باگ `set→incr` اللي تكشف هنا) |
| `ft-panel`: `npm run check` | ناجح (زاد `gateGuard.js`) |
| `ft-panel`: `npm test` | **22/22 ناجح** |

اختبارات Postgres محفوظة في `ft-contest-bot/test/pg/` مع README (كتحتاج `@electric-sql/pglite` + `typescript`).

---

## 9) حدود التحقّق (بصراحة)

1. **ما نقدرش نوصل لتيليغرام ولا Vercel من هاد الساندبوكس** (الشبكة محدودة)، فما درتش `getMe`/`getWebhookInfo` ولا `getChatMember` على `@mxabdou` الحقيقي، ولا بعثت `/start` للبوت الحقيقي. التحقّق ديال البوابة والويب هوك دار محلياً على **نفس الكود** بـ `TELEGRAM_MOCK=1`.
2. **البوت على Vercel ما تنجّمش نتأكد منو حياً** من هنا. عندك مسار واحد سريع: `https://ft-bot-bice.vercel.app/api/health` — إلا رجع 200 فالتوكن والقاعدة والبوابة سليمين.
3. **`ft_conset`**: الكود القديم ما كانش موجود لا في المستودع لا عاماً. الترحيل مبني على `ft-panel/lib/legacy.js` + `ft-contest-bot/src/lib/legacyImport.ts` + `/api/panel/migrate` (idempotent، معاينة افتراضية) — ما ندّعيش أني قريت الكود الأصلي.
4. **نظامان للنقاط** ما زالو موجودين: `points.ts` (نقاط الإحالات، سقف 3) و`rewards.ts` (محفظة المتجر). ما دمجتهمش — هادشي تغيير في المنتج ماشي إصلاح، وخلّيتو موثّق هنا.

---

## 10) شنو خاصك تدير دابا (خطوات قصيرة)

1. افتح `https://ft-bot-bice.vercel.app/api/health` — خاصو يرجع `ok: true` و`gate: enforced · @mxabdou`.
2. جرّب البوت: `/start` بحساب ما مشتركش في `@mxabdou` → خاصو يوقف عند البوابة. بعد الاشتراك + «✅ تحقّقت» → كيدخل.
3. اللوحة `https://ft-panel-blue.vercel.app` → تبويب **الفحص** و**الأخطاء** و**دفتر النقاط** (جدد).
4. إلا بغيت النشر التلقائي: فعّل Git deployments في المشروعين، وإلا غادي تبقى بحال دابا (نشر يدوي/بالوكيل).
