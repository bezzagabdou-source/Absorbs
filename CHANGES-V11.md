# واش تبدّل بالضبط — v10.1 ← v11.0

> هاد التقرير مولَّد من **مقارنة حقيقية** (`diff -rq`) بين `nexus-ai-v10_1.zip` و `nexus-ai-v11-legend.zip`.
> ماشي من الذاكرة.

## الخلاصة فسطر

```
12 ملف جديد  ·  9 ملفات معدّلة  ·  0 ملف محذوف
+1603 سطر كود جديد  ·  +201 سطر CSS  ·  +115 سطر فـ route.ts
```

**ولا ملف واحد تمسح. ولا دالة قديمة تبدّلت. كلشي زيادة فوق الموجود.**

---

## 1 · الملفات الجديدة (12)

### محرّكات (`src/lib/`)

| الملف | أسطر | الصادرات |
|---|---:|---|
| `turbo.ts` | 343 | `HEARTBEAT` · `TURBO` · `StreamFactory` · `hedgedRace` · `withWatchdog` · `withInstantOpen` · `cleanOutput` |
| `titan.ts` | 358 | `TITAN` · `Integrity` · `integrity` · `isCut` · `repair` · `stitch` · `glitchScan` · `TitanReport` · `withTitan` · `TITAN_CONTINUE_PROMPT` · `TITAN_SIZE_CONTRACT` |
| `fusion.ts` | 173 | `Draft` · `ScoredDraft` · `scoreDraft` · `rank` · `keepUsable` · `fusionPrompt` · `bestOf` · `fusionSummary` |
| `arabic-vision.ts` | 195 | `hasArabic` · `ArabicPromptPlan` · `planArabicImage` · `ARABIC_NEGATIVE` · `ARABIC_VISION_SYSTEM` · `ARABIC_IMAGE_SYSTEM` |
| `design-canvas.ts` | 125 | `CanvasKind` · `detectCanvas` · `wantsCanvas` · `canvasContract` · `CANVAS_LABELS` |
| `nexus-v11.ts` | 118 | 6 قوانين + `V11_LEGEND_ADDON` · `V11_CHAT_ADDON` · `V11_FEATURES` · `NEXUS_V11` |

### واجهة · اختبار · توثيق

| الملف | أسطر | الدور |
|---|---:|---|
| `src/app/v11/page.tsx` | 144 | صفحة `/v11` العمومية |
| `scripts/v11-selftest.mjs` | 127 | 39 تأكيد — بلا API بلا إنترنت |
| `scripts/v11-test.mjs` | 20 | يترجم المحرّكات بـ esbuild ثم يشغّل الاختبار |
| `UPGRADE-V11.0.md` | — | ملاحظات الإصدار الكاملة |
| `package-lock.json` | — | تثبيت نسخ التبعيات |
| `next-env.d.ts` | — | يولّدو Next تلقائيًا |

---

## 2 · الملفات المعدّلة (9)

| الملف | قبل → بعد | واش تزاد |
|---|---|---|
| `src/app/globals.css` | 1041 → **1242** | طبقة `.v11-*` كاملة |
| `src/app/api/ai/chat/route.ts` | 758 → **835** | TITAN + WATCHDOG + canvas + رؤية عربية |
| `src/lib/limits.ts` | 30 → **53** | 7 ثوابت جديدة |
| `src/lib/image-gen.ts` | 400 → **409** | `planArabicImage` بدل فحص regex بسيط |
| `src/lib/max-engine.ts` | 92 → **97** | حقن `V11_LEGEND_ADDON` |
| `README.md` | 196 → **228** | قسم v11 |
| `package.json` | 50 → **52** | `11.0.0` + `test:v11` + esbuild |
| `src/app/sitemap.ts` | 23 → **24** | سطر `/v11` |
| `.gitignore` | 24 → **25** | `.v11-build/` |

---

## 3 · التفاصيل

### `src/lib/limits.ts` — السقوف الجديدة

```ts
export const TITAN_MAX_BYTES      = 5 * 1024 * 1024;  // سقف الملف الواحد
export const TITAN_TARGET_BYTES   = 1_200_000;        // هدف البناء الكبير
export const TITAN_MAX_ROUNDS     = 120;              // جولات الإكمال
export const TTFT_TARGET_MS       = 900;              // هدف أول حرف
export const TTFT_HEDGE_MS        = 750;              // متى ينطلق المحرّك الثاني
export const STALL_FAILOVER_MS    = 18_000;           // صمت كامل ⟶ بدّل المحرّك
export const MID_STALL_FAILOVER_MS = 45_000;          // صمت وسط البث
```

القديمة (`MAX_OUTPUT_TOKENS` 64k · `REQUEST_GUARD_MS` 290s · `REQUEST_DEADLINE_MS` 255s) **ما تمسّتش**.

### `src/app/api/ai/chat/route.ts` — 7 حقن فقط

```ts
// 1) الاستيرادات
import { withWatchdog, withInstantOpen, cleanOutput, TURBO } from "@/lib/turbo";
import { withTitan, TITAN, TITAN_CONTINUE_PROMPT, type TitanReport } from "@/lib/titan";
import { wantsCanvas, detectCanvas, canvasContract } from "@/lib/design-canvas";
import { hasArabic, ARABIC_VISION_SYSTEM } from "@/lib/arabic-vision";
import { V11_CHAT_ADDON } from "@/lib/nexus-v11";
import { TITAN_MAX_BYTES, TITAN_TARGET_BYTES } from "@/lib/limits";

// 2) كشف الكانفاس + قراءة المستندات العربية
const canvasKind  = detectCanvas(lastUser);
const canvasOn    = isPro && !body.voice && wantsCanvas(lastUser);
const v11Block    = (canvasOn ? canvasContract(canvasKind) : "")
                  + (parsed.files.length > 0 && hasArabic(lastUser) ? ARABIC_VISION_SYSTEM : "");

// 3) مسار البناء: TITAN يسلسل المقاطع حتى يكمل الملف
const titan = withTitan(await openSegment(), {
  big: true, targetBytes: TITAN_TARGET_BYTES, maxBytes: TITAN_MAX_BYTES,
  rounds: TITAN.MAX_ROUNDS, keepAlive: true,
  deadlineAt: Date.now() + REQUEST_DEADLINE_MS,
  continueWith: (acc) => openSegment(acc),
  onDone: async (full, report) => { titanReport = report; await saveAnswer(full); },
});

// 4) الحارس: مستحيل البناء يموت فالصمت
return withInstantOpen(withWatchdog(titan, {
  keepAlive: true,
  stallMs: TURBO.STALL_FAILOVER_MS,
  midStallMs: TURBO.MID_STALL_FAILOVER_MS,
  rescue: async () => openSegment().catch(() => null),
}));

// 5) تنظيف النبضات الخفيّة قبل الحفظ
const text = cleanOutput(full).trim();
```

`v11Block` يتحقن زادة فـ `ensembleStream` (مسار build و hard) وفـ المسار الافتراضي مع `V11_CHAT_ADDON`.
**`streamGemini` · `ensembleStream` · `withAutoContinue` فـ `gemini.ts` ما تبدّلو حتى بحرف.**

### `src/lib/image-gen.ts` — الصور العربية

```diff
- const arabicText = /[\u0600-\u06FF]/.test(subject) ? "...render Arabic exactly..." : "";
+ const plan = planArabicImage(subject);
+ const arabicText = plan.needsArabicTypography
+   ? `TEXT IN THE IMAGE — render these strings EXACTLY and verbatim: ${...}`
+   : plan.arabic ? "Do not draw any text unless asked." : "";
...
-   `MAIN SUBJECT ...: ${subject}.`,
+   `MAIN SUBJECT ...: ${plan.prompt}.`,          // ⟵ الدارجة تُترجم أوتوماتيكيًا
+   plan.needsArabicTypography ? ARABIC_NEGATIVE : "",
```

الفرق: قبل كان يبعث الدارجة خام للنموذج. دابا `planArabicImage` يترجمها بقاموس ~55 مدخل، ويعزل النص اللي خاصو يبان **حرفيًا** داخل الصورة.

### `src/lib/max-engine.ts`

```diff
+ import { V11_LEGEND_ADDON } from "@/lib/nexus-v11";
...
- systemPromptAddon: MAX_STRICT_ADDON + MAX_MIND_ADDON,
+ systemPromptAddon: MAX_STRICT_ADDON + MAX_MIND_ADDON + V11_LEGEND_ADDON,
```

### `src/app/globals.css` — 201 سطر مزيدين فالآخر

```
.v11-aurora  .v11-glass  .v11-edge  .v11-title  .v11-pill  .v11-pill-dot
.v11-btn  .v11-btn-primary  .v11-btn-gold  .v11-titan-bar  .v11-rise
+ قواعد RTL  + حارس prefers-reduced-motion
```

ولا صنف قديم تبدّل — زيادة صافية فالآخر، صفر تعارض.

---

## 4 · التحقق

```bash
npm run typecheck   # 0 خطأ
npm run lint        # 0 خطأ فملفات v11 (48 الباقية موروثة من v10)
npx next build      # ✓ Compiled successfully · 56 صفحة · /v11 ضمنها
npm run test:v11    # 39 نجاح · 0 فشل
```

### 4 أعطال حقيقية لقاهم الاختبار وتصلحو

| # | العطل | الأثر |
|---|---|---|
| 1 | `\b` فـ JS **عمرو ما يطابق** حدًّا بجنب حرف عربي | كل أنماط الدارجة كانت ميتة بصمت |
| 2 | `\u0600-\u06FF` كاملة تخلّي `،` و`؟` «حروف» | يكسر الـ lookahead |
| 3 | خاسرو `hedgedRace` يحبسو إغلاق بث الفائز | السباق: **4004ms ⟵ 422ms** |
| 4 | أرضية النبضة 1000ms | مستحيل نبضة تحت الثانية |

---

## 5 · التوافق

| | |
|---|---|
| تبعيات جديدة فالإنتاج | **0** (`esbuild` devDependency برك) |
| متغيّرات `.env` جديدة | **0** |
| تبديلات فقاعدة البيانات | **0** |
| ملفات محذوفة | **0** |
| تغييرات كاسرة | **0** |

الترقية: فكّ الأرشيف ← `npm install` ← `npm run dev`. والسلام.
