# Nexus AI v18 — اختيار محرك الصور · شاشة سلسة

## 1) اختيار محرك الصور (استوديو الصور)
- أضيف صف **«المحرك»** في استوديو الصور: **تلقائي · Gemini · OpenRouter · Hugging Face**.
- المحرك المختار يُجرَّب أولاً؛ إذا فشل ينتقل تلقائياً إلى باقي المحركات (الاحتياط لا يتوقف).
- الرد يعرض دائماً النموذج الذي رسم الصورة فعلاً (مثلاً `openrouter:google/gemini-2.5-flash-image`).
- Hugging Face يعمل بـ FLUX.1-schnell افتراضياً، ويمكن تغييره بـ `HF_IMAGE_MODEL=org/model`.
- صورة المرجع (التعديل والتوليد حسب صورة): Hugging Face لا يقرأ الصور المرجعية، لذلك يُعطَّل خيار Hugging Face عند رفع مرجع.
- `generateImage()` صار سلسلة محركات مرتبة (Step) بدل كتلة متداخلة؛ السلوك التلقائي كما كان.

الملفات: `src/lib/image-types.ts` · `src/lib/image-gen.ts` · `src/app/api/ai/image/route.ts` · `src/components/app/image-studio.tsx`

## 2) الشاشة لا تهتز أثناء الحركة
- السبب: طبقات الخلفية المتحركة (aurora بتمويه 90px، وlumenDrift، وgrid) تُعاد رسمها في كل إطار أثناء التمرير والسحب.
- `StableViewport` يضيف `html.is-moving` أثناء التمرير/السحب/تغيير حجم الشاشة/فتح لوحة المفاتيح، فتتوقف الحركة الخلفية ~180 ms ثم تعود.
- على شاشات اللمس تبقى الطبقات الخلفية ثابتة (تدرّج جميل بدون حركة لكل إطار).
- حلقة تركيز واضحة (`:focus-visible`) لكل الأزرار والروابط.
- يحترم `prefers-reduced-motion`.

الملفات: `src/components/stable-viewport.tsx` · `src/app/globals.css` (قسم v18 في آخر الملف)

## الفحص
- `npx tsc --noEmit` ✅
- `npx eslint` على الملفات المعدّلة: 0 أخطاء ✅
- `npx next build` ✅
- اختبار ترتيب المحركات بمحاكاة `fetch` (بلا شبكة): تلقائي، OpenRouter، Hugging Face، صورة مرجعية، وفشل OpenRouter ✅
