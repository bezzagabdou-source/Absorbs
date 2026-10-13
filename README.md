# Nexus AI — التطبيق الجديد ⚡

تطبيق ذكاء اصطناعي **خفيف وسريع**: محادثة عربية (RTL) بواجهة زجاجية، تسجيل دخول، حفظ المحادثات، وأكواد تفعيل Pro.

- **46 ملف فقط** · بلا أي حِمل زائد: بلا صفحات تسويقية ثقيلة، بلا مكتبات ضخمة.
- **الخطوط داخل التطبيق** (self-hosted عبر `@fontsource`) ⇒ بلا طلب إلى Google في كل زيارة، وبلا تأخير في أول رسم.
- **بلا مفاتيح؟ يخدم.** إذا ما كانش مفتاح AI، يجاوب **المحرّك المحلي التجريبي** (`src/lib/engine.ts`) بنفس تجربة البث (streaming).
- **المفاتيح على السيرفر فقط** — لا يُرسل أي مفتاح إلى المتصفح.

---

## 🚀 التشغيل محليًا

```bash
npm install
cp .env.example .env.local   # عيّن على الأقل DATABASE_URL + مفتاح AI واحد
npm run dev                  # http://localhost:3000
```

فحص قبل النشر:

```bash
npx tsc --noEmit && npx next build
```

---

## 🔑 المتغيرات (`.env.example`)

| المتغير | إلزامي؟ | الوصف |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL (Neon / Supabase / Vercel Postgres) — الجداول تُنشأ تلقائيًا عند أول طلب |
| `GEMINI_API_KEY` / `OPENROUTER_API_KEY` / `GROQ_API_KEY` / `CEREBRAS_API_KEY` | اختياري | كل مفتاح تزيده يدخل سلسلة الاحتياط تلقائيًا |
| `ADMIN_SECRET` | اختياري | 12+ حرفًا — يفتح `POST /api/admin/promo` لإنشاء أكواد Pro بلا SQL |
| `NEXT_PUBLIC_FIREBASE_*` | اختياري | مفاتيح الويب (عامة بطبيعتها) — فيها افتراضي جاهز |
| `NEXT_PUBLIC_FIREBASE_AUTH_PROXY` | اختياري | `1` ⇒ تمرّ مصادقة Firebase عبر نطاقك (يحل مشكل Safari/iOS) |

---

## 🧱 البنية

```
src/
├─ app/
│  ├─ page.tsx                 الواجهة الرئيسية (Auth → App Shell)
│  ├─ layout.tsx               RTL + المظهر الليلي/النهاري قبل أول رسم
│  ├─ icon.svg                 أيقونة التطبيق
│  └─ api/
│     ├─ chat/                 المحادثة (بث + سلاسل الاحتياط)
│     ├─ conversations/        حفظ/حذف المحادثات
│     ├─ user/me               الملف والخطة (Pro / تجربة)
│     ├─ billing/redeem        تفعيل كود Pro
│     ├─ admin/promo           إنشاء أكواد (x-admin-secret)
│     └─ health                حالة القاعدة والمفاتيح
├─ components/                 واجهة المستخدم (shell · chat · composer · sidebar …)
├─ lib/                        ai-providers · engine · store · auth · rate-limit · promo
└─ db/                         Drizzle schema + إنشاء تلقائي للجداول
```

---

## ☁️ النشر على Vercel

1. **Import** المستودع في Vercel.
2. في **Settings → Environment Variables** أضف `DATABASE_URL` ومفتاح AI واحد على الأقل.
3. **Deploy** — وبعد أي تغيير في المتغيرات اعمل **Redeploy**.

> 🔎 `/api/health` يقولك واش القاعدة والمفاتيح خدّامين.

---

## 🎟️ تفعيل Pro

```bash
curl -X POST https://YOUR_DOMAIN/api/admin/promo \
  -H "x-admin-secret: YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"code":"NEXUS-VIP","days":30,"maxUses":100}'
```

---

## 📄 الرخصة

استخدام خاص — © صاحب المستودع.
