# Nexus Chat — موقع شات + رفع ملفات، مربوط بـ OpenCode

## ✅ الرابط (شغّال، ومُختبر)

```
https://gst-enemies-scenario-surf.trycloudflare.com
```

| اللي جرّبناه | النتيجة |
|---|---|
| الموقع يفتح | `web=ok` (title: Nexus Chat) |
| API الشات | `api=200` |
| رد الذكاء الاصطناعي | **`llm=ok` — 592ms — text="pong"`** ✅ |
| رفع ملفات/صور/فيديو | ✅ حتى 120MB، مع شريط تقدّم |

كلشي يشتغل **بلا أي مفتاح API**.

## واش يخدم الموقع

- **شات ستريمنغ** حرف بحرف (SSE)، RTL، ماركداون وكود.
- **رفع ملفات**: 📎، أو سحب وإفلات، أو لصق (Ctrl+V) صورة.
  - صور → تتعرض في الرسالة وتتحوّل لسياق للنموذج
  - ملفات نصية (txt/md/json/csv/code…) → تتقرأ وتدخل في السياق (حتى 24k حرف)
  - فيديو/صوت/PDF/أي ملف → يتخزّن وتتوصّل البيانات الوصفية، مع معاينة/تحميل
- **3 نماذج** مجانية (Pollinations: openai / mistral / llama).
- **اختيار تلقائي للمزوّد**: إذا حطّيت مفتاح (`OPENROUTER_API_KEY`, `GROQ_API_KEY`,
  `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `XAI_API_KEY`)
  كـ repo secret، الـ chat api يستعملو وحدو بدل المجاني — أسرع وأقوى.

## البنية

```
المتصفح / التطبيق
   │ https://<tunnel>
   ▼
cloudflare quick tunnel (http2)
   ▼
gateway  0.0.0.0:8080   scripts/opencode-gateway.mjs
   ├── /                     → web/index.html            (الموقع)
   ├── /web/*                → chat api 127.0.0.1:8090   (ردود + رفع ملفات)
   └── /api/* /session /event → opencode  127.0.0.1:8081 (agent + API الأصلي)
```

| ملف | وظيفته |
|---|---|
| `web/index.html` | الواجهة: شات + رفع ملفات + ستريمنغ (بلا build) |
| `scripts/opencode-webapi.mjs` | API الشات: sessions, SSE, upload, pollinations/provider |
| `scripts/opencode-gateway.mjs` | proxy + CORS + SSE + توجيه `/web/*` + يخدم الموقع |
| `scripts/opencode-supervisor.sh` | يراقب كل 30ث، يعيد تشغيل الميّت، يبدّل النفق، ينشر الرابط |
| `scripts/opencode-selftest.mjs` | يجرّب شات حقيقي ويطبع `SELFTEST llm=ok/fail` |
| `.github/workflows/opencode-tunnel.yml` | يشغّل الكل على runner (يبقى ~5 ساعات) |

## ليش كان "ما يردّ"

1. المزوّد المجاني تاع opencode (`opencode.ai/inference`) يرجّع **429** من IP الـ runner.
2. السيرفر كان يبلع الخطأ وما يبعتش حدث فشل → التطبيق يبقى "Connecting…"/صامت.

الحل: قناة **pollinations** (بلا مفتاح، مُتحقَّق منها: HTTP 200) + إظهار الأخطاء دائمًا
كحدث في البث، + self-test ينشر النتيجة في status `opencode/llm`.

## الرابط يتبدّل عند كل push

```bash
gh api repos/bezzagabdou-source/Absorbs/commits/arena/3d01ef96-absorbs/statuses \
  --jq '.[]|select(.context=="opencode/url")|.description' | head -1
```

## تشغيل محلي

```bash
npm i -g opencode-ai
opencode serve --hostname 127.0.0.1 --port 8081 &
node scripts/opencode-webapi.mjs --listen 127.0.0.1:8090 &
node scripts/opencode-gateway.mjs --listen 0.0.0.0:8080 --upstream 127.0.0.1:8081 --webapi 127.0.0.1:8090
# http://localhost:8080
```

## تنبيه

الرابط عام وبلا كلمة سر: أي حد عندو يرفع ملفات ويستعمل الـ agent على الكود.
الملفات المرفوعة تبقى في `/tmp` على الـ runner وتزول مع المهمة.
