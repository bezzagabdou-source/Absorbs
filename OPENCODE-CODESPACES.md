# Nexus Chat — موقع شات ثابت (بلا سيرفر، بلا نفق)

## ✅ الرابط الثابت (مُختبَر، يفتح فورًا)

```
https://cdn.jsdelivr.net/gh/bezzagabdou-source/Absorbs@6a93c3eef0a27d438343358748af1d502b379a5d/docs/nexus-chat.html
```

هذا ملف HTML واحد يخدمه CDN عالمي (jsDelivr). **ما كاينش سيرفر يتوقف، ما كاينش نفق يموت،
وما كاينش cold start.** الملف يتخزّن في الريبو ويتحدّث تلقائيًا مع كل push.

بديل أقصر (نفس الملف، يتحدّث مع كل push):

```
https://cdn.jsdelivr.net/gh/bezzagabdou-source/Absorbs@arena/3d01ef96-absorbs/docs/nexus-chat.html
```

## علاش الروابط القديمة ما كانتش تفتح

| المحاولة | النتيجة |
|---|---|
| GitHub Codespaces | ❌ التوكن بلا صلاحية `codespace` (403) |
| Cloudflare quick tunnel | ⚠️ يشتغل ثم يموت: `openssl s_client` يرجّع TLS reset بعد ~20-70 ثانية، والمهمة تُلغى auto-cancel عند push جديد |
| GitHub Pages | ❌ تفعيل Pages ممنوع على التوكن (`403 Resource not accessible`) — يحتاج تفعيل يدوي من Settings |
| Vercel (public/chat.html) | ❌ المشروع `absorbs-main` ينشر، لكن `chat.html` يرجع 404 (rewrite غير مطبّق في نطاق المشروع) |
| **jsDelivr من الريبو** | ✅ **200 + HTML صحيح — ثابت ومجاني وبلا حدود** |

## الميزات

- شات **ستريمنغ** حرف بحرف، واجهة عربية RTL، ماركداون وكود.
- **رفع ملفات**: 📎 · سحب وإفلات · لصق `Ctrl+V` لصورة.
  - صور → تتعرض وتتبعت للنموذج (حتى 3MB، inline base64)
  - ملفات نصية/كود/CSV/JSON → المحتوى يدخل السياق (حتى 24k حرف)
  - فيديو/صوت/PDF → معاينة + بيانات وصفية
- **3 نماذج** مجانية + تبديل فوري.
- **سلسلة مزوّدين**: إذا الأول محجوب، يجرّب الثاني تلقائيًا.
- **أخطاء واضحة**: إذا المزوّد رفض، تشوف الرسالة بالعربية مع الكود — ما تبقاش "Connecting…".

## البنية (كلش client-side)

```
المتصفح ──> CDN (jsDelivr)         : الملف HTML
        └─> text.pollinations.ai   : ردود الذكاء الاصطناعي (بلا مفتاح)
```

ما كاينش أي سيرفر تاعنا في الطريق ⇒ ما كاينش شي يتوقف.

## الملفات

| ملف | وظيفته |
|---|---|
| `docs/nexus-chat.html` + `docs/index.html` | الموقع (نفس المحتوى) |
| `web-pages/` | المصدر |
| `public/chat.html` | نسخة احتياطية تخدمها Vercel |
| `.github/workflows/pages.yml` | ينسخ `web-pages/` إلى `docs/` عند كل تعديل |

## تحديث الموقع

عدّل `web-pages/index.html` ثم:

```bash
rsync -a web-pages/ docs/ && cp web-pages/index.html public/chat.html
git add docs web-pages public/chat.html && git commit -m "update chat" && git push
```

الرابط القديم `@arena/3d01ef96-absorbs` يتحدّث فورًا؛ الرابط المثبّت `@<sha>` يبقى ثابت للأبد.

## إذا المزوّد توقّف يومًا

المزوّد المجاني `text.pollinations.ai` بلا مفتاح. بديل بسطر واحد:
افتح الملف وغيّر `ENDPOINTS` لأي API متوافق مع OpenAI (Groq / OpenRouter / DeepSeek…) + المفتاح.
