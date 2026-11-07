# Nexus Chat — موقع HTML مربوط بسيرفر OpenCode

## الرابط الحالي (شغّال)

```
https://experience-markers-tech-myself.trycloudflare.com
```

- افتحه من أي متصفح/تليفون → تلقى واجهة شات عربية RTL.
- نفس الأصل يخدم أيضاً API الخاص بـ OpenCode (بلا CORS نهائياً).
- للتطبيق OpenCode Mobile: نفس الرابط كـ **Server URL**، والباسورد فارغ.

> الرابط يتبدّل كل مرة يتعاود الـ workflow. الحديث دايمًا:
> `gh api repos/bezzagabdou-source/Absorbs/commits/arena/3d01ef96-absorbs/statuses --jq '.[]|select(.context=="opencode/url")|.description'`

## كيفاش مربوط (البنية)

```
المتصفح / التطبيق
      │  https://<tunnel>
      ▼
cloudflare quick tunnel (http2)
      ▼
gateway  scripts/opencode-gateway.mjs   ← 0.0.0.0:8080
   ├── GET /            → web/index.html   (موقع الشات)
   └── /api/* /session /event …  → opencode serve (127.0.0.1:8081)
```

- **نفس الأصل** = صفر مشاكل CORS (وهذا كان سبب "Connecting…" في التطبيق).
- الـ gateway يعيد بث `text/event-stream` بلا buffering وبلا timeout، ويقبل preflight.
- `scripts/opencode-supervisor.sh` يراقب كل 30 ثانية: السيرفر / الـ gateway / النفق،
  يعيد تشغيل الميّت، ويولّد نفق جديد إذا لزم، وينشر الرابط كـ commit status
  (`opencode/url` مع `api=200 web=ok`).

## الموقع (web/index.html)

- HTML/CSS/JS خام بلا أي framework ولا build — صفحة واحدة.
- ينشئ session (`POST /api/session`)، يبثّ الأحداث (`EventSource /api/session/:id/event`)،
  ويرسل (`POST /api/session/:id/prompt`).
- يقرأ النماذج من `GET /api/model` ويعرض المتاحة المجانية فقط.
- ستريمنغ حرف بحرف + إيقاف + اقتراحات جاهزة + دعم كود (``` blocks).

## تشغيل محلي

```bash
npm i -g opencode-ai
opencode serve --hostname 127.0.0.1 --port 8081 &
node scripts/opencode-gateway.mjs --listen 0.0.0.0:8080 --upstream 127.0.0.1:8081
# http://localhost:8080
```

## ملاحظات مهمة

1. **المزوّد (LLM):** الحساب يحتاج مزوّد مفعّل. إذا ما كانش، الأحداث توصل
   (`prompt.admitted` / `prompted`) لكن الرد يفشل بـ `UnsupportedApiError` أو
   `HTTP transport failed`. الحل: داخل الـ Codespace/runner نفّذ
   `opencode auth login` لـ `opencode` (المجاني) أو `github-copilot`، أو ضع المفتاح
   كـ Actions secret.
2. **بلا كلمة سر** على السيرفر — أي حد عندو الرابط يقدر يستعمل الـ agent على الكود.
   بدّل كلمة السر لو بغيت (`OPENCODE_SERVER_PASSWORD` في supervisor).
3. **مدة الحياة:** المهمة تبقى حتى ~5 ساعات (حد Actions)؛ أعد التشغيل من
   **Actions → opencode server tunnel → Run workflow**.
