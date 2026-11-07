# Nexus Chat — موقع HTML مربوط بسيرفر OpenCode

## ✅ الرابط (شغّال الآن)

```
https://personnel-frequently-packing-thinks.trycloudflare.com
```

افتحه في أي متصفح أو تليفون → واجهة شات عربية RTL، تكلّم السيرفر مباشرة وتشوف الجواب
يتكتب حرف بحرف. نفس الرابط يصلح كـ **Server URL** في تطبيق OpenCode Mobile (بلا باسورد).

> الرابط يتبدّل كل مرة يتعاود الـ workflow. الحديث دايمًا من:
> ```bash
> gh api repos/bezzagabdou-source/Absorbs/commits/arena/3d01ef96-absorbs/statuses \
>   --jq '.[]|select(.context=="opencode/url")|.target_url' | head -1
> ```
> وحالة الذكاء الاصطناعي في status مستقل اسمه `opencode/llm`.

## البنية (كلش على أصل واحد = صفر CORS)

```
المتصفح / التطبيق
      │  https://<tunnel>
      ▼
cloudflare quick tunnel (http2)
      ▼
gateway  scripts/opencode-gateway.mjs   ← 0.0.0.0:8080
   ├── GET /                      → web/index.html      (موقع الشات)
   ├── GET /api/session/:id/event → SSE (بلا buffering ولا timeout)
   └── /api/* /session /config …  → opencode serve (127.0.0.1:8081)
```

| ملف | وظيفته |
|---|---|
| `web/index.html` | الموقع: صفحة واحدة، بلا framework ولا build، ستريمنغ + إيقاف + اختيار النموذج |
| `scripts/opencode-gateway.mjs` | proxy + CORS + SSE + passthrough للـ WebSocket + يخدم الموقع |
| `scripts/opencode-supervisor.sh` | يراقب كل 30 ثانية، يعيد تشغيل الميّت، يبدّل النفق، ينشر الرابط |
| `scripts/opencode-selftest.mjs` | يجرّب شات حقيقي (session → prompt → SSE) ويطبع `SELFTEST llm=ok/fail` |
| `.github/workflows/opencode-tunnel.yml` | يشغّل الكل على runner مجاني (يبقى ~5 ساعات) |

## الموقع كيفاش يخدم

1. `POST /api/session` → session جديدة
2. `EventSource /api/session/:id/event` → بث حيّ
3. `POST /api/session/:id/prompt` → يرسل السؤال
4. يستقبل `session.next.text.delta` ويرسم الجواب حرف بحرف
5. النماذج من `GET /api/model` (يعرض المجانية فقط)

## الـ LLM — اقرأ هذا

السيرفر، الموقع، والبث كلهم مثبتين (status: `api=200 web=ok`).
الجواب النهائي يحتاج **مزوّد نماذج**:

- الحساب المجاني عندو مزوّدون بلا مفتاح (`opencode/...-free`) لكن ما نجحوش في اختبارنا
  (الـ runner يرجّع `llm=fail`).
- الحل: أضف مفتاح واحد كـ **repository secret** (Settings → Secrets → Actions):

  `OPENROUTER_API_KEY` أو `GROQ_API_KEY` أو `OPENAI_API_KEY` أو `ANTHROPIC_API_KEY`
  أو `GEMINI_API_KEY` أو `DEEPSEEK_API_KEY` أو `XAI_API_KEY`

  الـ workflow يمرّرها تلقائيًا، و opencode يفعّل المزوّد وحدو. بعدها:
  **Actions → opencode server tunnel → Run workflow**.
- تلقى النتيجة في status `opencode/llm` (fيه سبب الفشل إذا بقى).

## تشغيل محلي

```bash
npm i -g opencode-ai
opencode serve --hostname 127.0.0.1 --port 8081 &
node scripts/opencode-gateway.mjs --listen 0.0.0.0:8080 --upstream 127.0.0.1:8081
# http://localhost:8080
```

## تنبيه أمني

بلا كلمة سر: أي حد عندو الرابط يقدر يستعمل الـ agent على الكود. الرابط مؤقت (نفق عشوائي)،
لكن ما تشاركوش. لتقييده أضف `OPENCODE_SERVER_PASSWORD` في `scripts/opencode-supervisor.sh`.
