# Nexus AI v18 — ما الجديد

## 1. GPT-6 Astra (Pro)
- نموذج جديد في القائمة باسم **GPT-6 Astra** (`provider: openai`).
- المعرّف الافتراضي `gpt-6-astra` قابل للتغيير بـ `OPENAI_ASTRA_MODEL` إن غيّرت OpenAI الاسم.
- بدون `OPENAI_API_KEY` يُوجَّه الطلب تلقائيًا إلى GPT-4o عبر OpenRouter.
- الملفات: `src/lib/model-router.ts` (`streamAstra`) · `src/lib/models-v12.ts` · `src/lib/model-access.ts`.

## 2. صور بنماذج Hugging Face (Qwen-Image أولًا)
- ترتيب المحركات: Gemini ← OpenRouter ← **Qwen-Image** ← FLUX.1-schnell ← Pollinations.
- الدرجات السريعة (v5 / v6) تبدأ بـ FLUX.1-schnell. الدرجات الأعلى تبدأ بـ Qwen-Image.
- `HF_IMAGE_MODEL` يضع أي نموذج تختاره في المقدمة. الملف: `src/lib/image-gen.ts`.

## 3. دخول أسرع
- تسجيل الدخول لم يعد ينتظر حفظ الملف الشخصي في السيرفر: التطبيق يفتح فورًا والمزامنة تكمل في الخلفية.
- `/api/user/sync`: الكتابات والقراءات المستقلة تعمل بالتوازي بعد إنشاء الصف.
- `recordLogin`: كتابتان في استعلام واحد.
- حجم اتصال قاعدة البيانات لكل نسخة: `DB_POOL_MAX` (افتراضي 5). للآلاف من المستخدمين استعمل رابط Pooler (Neon / Supabase).

## 4. الدخول برقم الهاتف (SMS)
- تبويب «برقم الهاتف» في صفحة `/login` و`/signup`، مع رمز تحقق من 6 أرقام.
- reCAPTCHA غير مرئي تلقائيًا. الأرقام تُحوَّل إلى E.164 (مثلًا `0550…` ← `+213550…`).
- **يتطلب تفعيل Phone** في Firebase → Authentication → Sign-in method، وإضافة النطاق في Authorized domains.
- الملفات: `src/lib/auth-context.tsx` · `src/components/auth/auth-screen.tsx` · `src/lib/phone.ts`.

## 5. واجهة الانتظار
- خط التقدم المستقيم أثناء توليد الكود استُبدل بـ**مقياس إشارة** متحرك (تسعة أعمدة + النسبة).
- الملف: `nx-signal` في `src/app/globals.css`، والعرض في `src/components/app/chat.tsx`.

## 6. إعداد جديد: تقليل الحركة
- الإعدادات ← **تقليل الحركة**: يوقف الأنيميشن الدائم (مفيد للهواتف الضعيفة وتوفير البطارية).
- يُحفظ على الجهاز نفسه. الملفات: `src/lib/motion-pref.ts` · `src/app/app/settings/page.tsx`.

## التحقق
- `npx tsc --noEmit` ✅ · `npx next build` ✅ · `/login` و`/signup` تُعرضان من الخادم مع تبويب الهاتف ✅
- `src/lib/phone.ts` مختبر على 6 حالات (محلي، دولي، `00`، فارغ، نص غير صالح) ✅
