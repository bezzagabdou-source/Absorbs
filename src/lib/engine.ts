/**
 * Nexus Engine — deterministic, local assistant core.
 * Produces rich, well-structured markdown answers (Arabic / French / English)
 * and streams them token-by-token. No external API keys required.
 */

export type Lang = "ar" | "fr" | "en";

export function detectLang(text: string): Lang {
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/(^|\s)(le|la|les|je|tu|vous|nous|est|une|bonjour|merci|comment|pourquoi|faire)\b/i.test(text)) return "fr";
  return "en";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stream a long text in small natural chunks to a writer (fast — the wait is real thinking time, not fake delay). */
export async function streamText(text: string, emit: (delta: string) => void | Promise<void>) {
  // chunk on word boundaries so markdown never splits mid-token badly
  const parts = text.match(/[\s\S]{1,96}(?=\s|$)|[\s\S]{1,96}/g) ?? [text];
  for (const p of parts) {
    await emit(p);
    await sleep(1);
  }
}

/* ─────────────────────────── responses ─────────────────────────── */

const AR_GREETING = `أهلاً بيك في **Nexus** ✦

أنا مساعدك الذكي — نقدر نعاونك في:

- **الكتابة والتحرير** — مقالات، إيميلات، منشورات جاهزة للنشر
- **الكود والتطوير** — شرح، كتابة، وإصلاح بأي لغة
- **الأفكار والتخطيط** — عصف ذهني، خطط عمل، دراسة
- **الترجمة** — عربية، دارجة، فرنسية، إنجليزية

اكتب لي واش يدور في بالك ونبداو.`;

const FR_GREETING = `Bienvenue sur **Nexus** ✦

Je suis ton assistant intelligent. Je peux t'aider avec :

- **Rédaction** — articles, emails, posts prêts à publier
- **Code** — explication, écriture et débogage
- **Idées & plans** — brainstorming, business, études
- **Traduction** — arabe, darija, français, anglais

Dis-moi ce que tu as en tête et on commence.`;

const EN_GREETING = `Welcome to **Nexus** ✦

I'm your intelligent assistant. I can help you with:

- **Writing** — articles, emails, publish-ready posts
- **Code** — explain, write, and debug in any language
- **Ideas & planning** — brainstorming, business plans, study
- **Translation** — Arabic, Darija, French, English

Tell me what's on your mind and let's begin.`;

const AR_ABOUT = `## من هو Nexus؟

**Nexus** هو الجيل الجديد من المساعدات الذكية — مصمّم ليكون:

> سريع كالبرق، عميق كالمحيط، وأنيق في كل تفصيلة.

| الميزة | الوصف |
| ------ | ----- |
| **فهم السياق** | يتذكّر مجرى المحادثة ويبني عليه |
| **متعدد اللغات** | عربية فصحى، دارجة، فرنسية، إنجليزية |
| **كود احترافي** | مقتطفات جاهزة مع نسخ بضغطة واحدة |
| **خصوصية** | محادثاتك محفوظة لك وحدك |

جرّب تسقسيني على أي حاجة — من كود React وصلا لخطة مشروع كاملة.`;

const AR_CODE_REACT = `ها هو مكوّن جاهز بالمعايير العصرية — تصميم زجاجي مع تفاعل ناعم:

\`\`\`tsx
"use client";

import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export function NexusButton({ variant = "primary", className, ...props }: Props) {
  return (
    <button
      className={cn(
        "press rounded-2xl px-5 py-2.5 text-sm font-semibold transition",
        variant === "primary" && "btn-primary",
        variant === "ghost" && "glass hover-lift text-ink-2",
        className
      )}
      {...props}
    />
  );
}
\`\`\`

**نقاط القوة:**

1. \`btn-primary\` — تدرّج متوهّج مع ظل ديناميكي
2. \`press\` — انكماش فيزيائي عند الضغط (\`scale(0.94)\`)
3. متاح بنسختين: \`primary\` و \`ghost\`

تحب نزيده **حالة تحميل** ولا أيقونات؟`;

const AR_CODE_NODE = `خدمة API نظيفة في Next.js مع Drizzle — هيكلة إنتاجية كاملة:

\`\`\`ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(50);

  return NextResponse.json({ conversations: rows });
}
\`\`\`

**ملاحظات هامة:**

- \`onDelete: "cascade"\` يضمن حذف الرسائل مع المحادثة
- الفهرس على \`updatedAt\` يجعل الترتيب فوريًا حتى مع آلاف السجلات
- أعد دائمًا كائنًا مُغلَّفًا \`{ conversations }\` لتسهيل التوسّع مستقبلًا

واش راك تحب نزيد **pagination** ولا **search** فوقها؟`;

const AR_DEFAULT = (topic: string) => `فهمت قصدك — خلّيني نفصّلها لك بطريقة منظّمة.

## تحليل الطلب

> «${topic}»

## خطة العمل المقترحة

1. **التأسيس** — نحدّد الهدف النهائي والجمهور المستهدف أوّلاً
2. **التنفيذ** — نبني النواة الأساسية ثم نضيف الطبقات تدريجيًا
3. **الصقل** — مراجعة التفاصيل، التجربة، والأداء قبل الإطلاق

## الخطوة التالية

باش نعاونك أكثر، زيدني تفاصيل واحدة من هاذو:

- السياق الكامل للمشروع ولا الفكرة
- مثال ملموس على النتيجة اللي في بالك
- أي قيود (وقت، تقنية، ميزانية)

كل ما زدتني معلومات، كل ما كانت الإجابة أدقّ وأعمق. ✦`;

const FR_DEFAULT = (topic: string) => `Bien compris — laissons-moi structurer ça proprement.

## Analyse de la demande

> « ${topic} »

## Plan d'action proposé

1. **Fondation** — définir l'objectif final et le public cible
2. **Exécution** — construire le noyau, puis ajouter les couches
3. **Polissage** — revoir les détails, l'expérience et la performance

## Prochaine étape

Pour t'aider davantage, ajoute un de ces éléments :

- Le contexte complet du projet ou de l'idée
- Un exemple concret du résultat attendu
- Les contraintes (temps, techno, budget)

Plus tu m'en donnes, plus la réponse sera précise. ✦`;

const EN_DEFAULT = (topic: string) => `Got it — let me structure this properly.

## Request analysis

> "${topic}"

## Proposed plan

1. **Foundation** — define the end goal and target audience first
2. **Execution** — build the core, then layer on top progressively
3. **Polish** — review details, experience, and performance before shipping

## Next step

To help you further, give me one of these:

- Full context of the project or idea
- A concrete example of the outcome you imagine
- Any constraints (time, tech, budget)

The more detail you share, the sharper the answer gets. ✦`;

/* ─────────────────────────── router ─────────────────────────── */

export function composeReply(prompt: string, model: string): string {
  const t = prompt.trim();
  const lang = detectLang(t);
  const low = t.toLowerCase();
  const short = t.length < 90;

  // greetings
  if (short && /salam|سلام|أهلا|اهلا|مرحبا|صباح|مساء|hello|hi\b|hey|salut|bonjour|coucou/.test(low)) {
    return lang === "ar" ? AR_GREETING : lang === "fr" ? FR_GREETING : EN_GREETING;
  }

  // identity
  if (/من انت|مين انت|شكون انت|who are you|qui es-tu|nexus|نيكسوس/.test(low)) {
    if (lang === "ar") return AR_ABOUT;
    if (lang === "fr")
      return `## Qui suis-je ?\n\n**Nexus** — la nouvelle génération d'assistant intelligent. Rapide, profond, multilingue (arabe, darija, français, anglais), spécialisé en rédaction et en code avec copie en un clic.\n\nPose-moi n'importe quelle question. ✦`;
    return `## Who am I?\n\n**Nexus** — a new-generation intelligent assistant. Fast, deep, multilingual (Arabic, Darija, French, English), great at writing and code with one-click copy blocks.\n\nAsk me anything. ✦`;
  }

  // code intents
  const wantsCode = /كود|code|مكوّن|component|button|زر|react|next|api|سكريبت|script|fonction|function|tailwind|python|جافا/.test(low);
  if (wantsCode) {
    const isNode = /api|node|server|drizzle|route|سيرفر|خادم|باك/.test(low);
    if (lang === "ar") return isNode ? AR_CODE_NODE : AR_CODE_REACT;
    if (lang === "fr")
      return '```tsx\nexport function NexusButton({ children }: { children: React.ReactNode }) {\n  return (\n    <button className="btn-primary press rounded-2xl px-5 py-2.5 text-sm font-semibold">\n      {children}\n    </button>\n  );\n}\n```\n\nUn composant propre, avec retour tactile `press` et dégradé lumineux. Tu veux une variante **loading** ?';
    return '```tsx\nexport function NexusButton({ children }: { children: React.ReactNode }) {\n  return (\n    <button className="btn-primary press rounded-2xl px-5 py-2.5 text-sm font-semibold">\n      {children}\n    </button>\n  );\n}\n```\n\nA clean component with tactile `press` feedback and a luminous gradient. Want a **loading** variant too?';
  }

  // capabilities / help
  if (/تقدر|قدرات|help|مساعدة|aide|what can you/.test(low)) {
    return lang === "ar" ? AR_GREETING : lang === "fr" ? FR_GREETING : EN_GREETING;
  }

  const topic = t.replace(/\s+/g, " ").slice(0, 140);
  void model;
  return lang === "ar" ? AR_DEFAULT(topic) : lang === "fr" ? FR_DEFAULT(topic) : EN_DEFAULT(topic);
}

/** Auto-title for a conversation from the first user message. */
export function makeTitle(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (!clean) return "محادثة جديدة";
  return clean.length > 42 ? clean.slice(0, 42).trimEnd() + "…" : clean;
}

/* ─────────────────────────── web generation (local) ─────────────────────────── */

/**
 * Deterministic single-file HTML generator for the web-preview tool when no API
 * key is configured. Produces a real, working, responsive RTL page themed from
 * the prompt keywords (shop / restaurant / dashboard / default landing).
 */
export function composeHtml(prompt: string): string {
  const raw = prompt.trim().slice(0, 120) || "موقعي";
  const esc = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const low = raw.toLowerCase();
  const kind: "shop" | "food" | "dashboard" | "landing" =
    /متجر|store|shop|أزياء|بيع|ecommerce|منتجات/.test(low)
      ? "shop"
      : /مطعم|food|غداء|قهوة|cafe|مقهى|مأكولات/.test(low)
        ? "food"
        : /لوحة|dashboard|إحصائ|تقارير|admin/.test(low)
          ? "dashboard"
          : "landing";

  const products = [
    ["منتج رئيسي", "1,490 دج", "الأكثر مبيعًا"],
    ["منتج مميز", "2,290 دج", "جديد"],
    ["عرض خاص", "990 دج", "خصم 30%"],
    ["منتج فاخر", "4,990 دج", "حصري"],
    ["منتج عملي", "1,190 دج", "متوفر"],
    ["إصدار محدود", "3,490 دج", "كمية محدودة"],
  ];
  const dishes = [
    ["كبسة لحم", "900 دج"],
    ["شوربة عدس", "300 دج"],
    ["بورية دجاج", "750 دج"],
    ["كبابتين مشوية", "550 دج"],
    ["سلطة شامي", "350 دج"],
    ["عصير طبيعي", "200 دج"],
  ];
  const stats = [
    ["+12.4K", "مستخدم نشط"],
    ["98.2%", "رضا العملاء"],
    ["152", "مشروع مكتمل"],
    ["24/7", "دعم متواصل"],
  ];

  const cards =
    kind === "shop"
      ? products
          .map(
            ([n, p, tag]) => `
        <div class="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-indigo-500/50 hover:-translate-y-1 transition">
          <span class="text-[10px] font-bold text-indigo-400">${tag}</span>
          <h3 class="mt-2 text-lg font-bold">${n}</h3>
          <p class="mt-1 text-slate-400 text-sm">جودة عالية — توصيل لكل الولايات</p>
          <div class="mt-4 flex items-center justify-between">
            <span class="text-emerald-400 font-bold" dir="ltr">${p}</span>
            <button class="bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">أضف</button>
          </div>
        </div>`
          )
          .join("")
      : kind === "food"
        ? dishes
            .map(
              ([n, p]) => `
        <div class="flex items-center justify-between bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
          <div><h3 class="font-bold">${n}</h3><p class="text-slate-400 text-sm mt-0.5">طازج يوميًا — وصفة عائلية</p></div>
          <span class="text-emerald-400 font-bold whitespace-nowrap" dir="ltr">${p}</span>
        </div>`
            )
            .join("")
        : kind === "dashboard"
          ? stats
              .map(
                ([v, l]) => `
        <div class="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 text-center">
          <div class="text-3xl font-black text-indigo-400" dir="ltr">${v}</div>
          <div class="mt-2 text-slate-400 text-sm">${l}</div>
        </div>`
              )
              .join("")
          : `
        <div class="bg-slate-900/70 border border-slate-800 rounded-2xl p-8">
          <div class="w-14 h-14 bg-indigo-500/20 rounded-2xl grid place-items-center text-3xl mb-4">🚀</div>
          <h3 class="text-2xl font-bold mb-3">سرعة فائقة</h3>
          <p class="text-slate-400">أداء استثنائي من أول تحميل، بدون أي تعقيد.</p>
        </div>
        <div class="bg-slate-900/70 border border-slate-800 rounded-2xl p-8">
          <div class="w-14 h-14 bg-emerald-500/20 rounded-2xl grid place-items-center text-3xl mb-4">🎨</div>
          <h3 class="text-2xl font-bold mb-3">تصميم عصري</h3>
          <p class="text-slate-400">واجهة نظيفة ومتجاوبة تعمل على كل الأجهزة.</p>
        </div>
        <div class="bg-slate-900/70 border border-slate-800 rounded-2xl p-8">
          <div class="w-14 h-14 bg-amber-500/20 rounded-2xl grid place-items-center text-3xl mb-4">⚡</div>
          <h3 class="text-2xl font-bold mb-3">ذكي ومتجدد</h3>
          <p class="text-slate-400">محتوى قابل للتطوير مع نمو مشروعك.</p>
        </div>`;

  const title =
    kind === "shop" ? "متجر" : kind === "food" ? "مطعم" : kind === "dashboard" ? "لوحة تحكم" : "منصة";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc}</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  body { font-family: 'IBM Plex Sans Arabic', sans-serif; }
  .hero { background: linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #4c1d95 100%); }
  @keyframes floaty { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
  .floaty { animation: floaty 5s ease-in-out infinite; }
</style>
</head>
<body class="bg-slate-950 text-white">
<header class="flex items-center justify-between px-6 md:px-12 py-5 border-b border-slate-800/60">
  <div class="flex items-center gap-2 font-extrabold text-lg">
    <span class="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600">N</span>
    ${esc}
  </div>
  <nav class="hidden md:flex items-center gap-6 text-sm text-slate-300">
    <a href="#" class="hover:text-white transition">الرئيسية</a>
    <a href="#" class="hover:text-white transition">${title}</a>
    <a href="#" class="hover:text-white transition">تواصل معنا</a>
    <button class="bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2 rounded-xl font-semibold transition">ابدأ الآن</button>
  </nav>
</header>

<section class="hero relative overflow-hidden">
  <div class="absolute top-16 right-16 w-72 h-72 bg-purple-500/30 rounded-full blur-3xl"></div>
  <div class="absolute bottom-10 left-16 w-80 h-80 bg-indigo-500/30 rounded-full blur-3xl"></div>
  <div class="relative max-w-5xl mx-auto text-center px-6 py-24 md:py-32">
    <span class="inline-block bg-white/10 border border-white/15 rounded-full px-4 py-1.5 text-xs font-semibold mb-6">✦ ${title} — نسخة تجريبية مولّدة</span>
    <h1 class="text-4xl md:text-6xl font-black leading-tight mb-6">${esc}</h1>
    <p class="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-10">تجربة رقمية استثنائية: تصميم عصري، أداء سريع، ومحتوى حقيقي جاهز للتعديل.</p>
    <div class="flex gap-4 justify-center">
      <button class="bg-white text-indigo-700 px-8 py-4 rounded-2xl font-bold hover:scale-105 transition shadow-xl shadow-indigo-900/40">جرّب مجانًا</button>
      <button class="border-2 border-white/40 px-8 py-4 rounded-2xl font-bold hover:bg-white/10 transition">اعرف المزيد</button>
    </div>
  </div>
</section>

<section class="py-16 md:py-24 px-6">
  <div class="max-w-6xl mx-auto">
    <h2 class="text-3xl md:text-4xl font-bold text-center mb-4">${
      kind === "shop" ? "منتجاتنا" : kind === "food" ? "قائمة الطعام" : kind === "dashboard" ? "أرقامنا" : "لماذا نحن؟"
    }</h2>
    <p class="text-center text-slate-400 mb-12">محتوى تجريبي واقعي — استبدله بمحتواك.</p>
    <div class="${kind === "food" ? "grid gap-4 md:grid-cols-2" : "grid gap-6 md:grid-cols-3"}">${cards}</div>
  </div>
</section>

<section class="py-16 px-6 bg-gradient-to-l from-indigo-950/60 to-purple-950/60 border-y border-slate-800/60">
  <div class="max-w-3xl mx-auto text-center">
    <h2 class="text-3xl font-bold mb-4">جاهز للبدء؟</h2>
    <p class="text-slate-300 mb-8">انضم الآن وابدأ رحلتك الرقمية.</p>
    <button class="bg-white text-indigo-700 px-10 py-4 rounded-2xl font-bold text-lg hover:scale-105 transition shadow-xl">سجّل الآن</button>
  </div>
</section>

<footer class="py-10 px-6 text-center text-slate-500 text-sm border-t border-slate-800/60">
  <p>© ${new Date().getFullYear()} ${esc} — جميع الحقوق محفوظة</p>
</footer>
</body>
</html>`;
}

/* ─────────────────────────── orchestrator (local mode) ─────────────────────────── */

/**
 * Three genuinely different local "drafts" used by the smart-distribution tool
 * when no provider key is configured: a structured analysis, a direct answer
 * plan, and a short executive summary. They run in parallel like the live mode.
 */
export function composeLocalDrafts(prompt: string): { id: string; label: string; model: string; text: string }[] {
  const t = prompt.trim().replace(/\s+/g, " ").slice(0, 160);
  const lang = detectLang(t);
  const ar = lang === "ar";
  return [
    {
      id: "t-analysis",
      label: "التحليل العميق",
      model: "Nexus Engine (محلي)",
      text: ar
        ? `## التحليل\n\n> «${t}»\n\n### نقاط القوة\n- الطلب واضح ومحدد — يمكن تنفيذه على مراحل قصيرة\n- النتيجة قابلة للقياس إذا حددنا مؤشرًا واحدًا رئيسيًا\n\n### المخاطر\n- غياب تفاصيل السياق (الميزانية، الجمهور، الجدول الزمني)\n- انتظار كل التفاصيل في البداية يبطئ الانطلاق\n\n### توصية\nابدأ بأصغر نسخة تحقق من الفكرة (MVP) خلال أيام، ثم وسّع بناءً على ما يتضح.`
        : `## Analysis\n\n> "${t}"\n\n### Strengths\n- The request is concrete and can be executed in short phases\n- The outcome is measurable if we pick one primary metric\n\n### Risks\n- Missing context (budget, audience, timeline)\n- Waiting for every detail slows down the start\n\n### Recommendation\nShip the smallest working version in days, then expand based on what emerges.`
    },
    {
      id: "t-direct",
      label: "مسودة التنفيذ",
      model: "Nexus Engine (محلي)",
      text: ar
        ? `## خطة التنفيذ\n\n1. **اليوم 1–2** — تحديد الهدف النهائي وقالب النتيجة (ما الذي يعتبر «نجح»؟)\n2. **اليوم 3–5** — بناء النواة: أهم ميزة واحدة فقط، بدون حشو\n3. **اليوم 6–7** — مراجعة، تحسين التفاصيل، وتسليم\n\n### قائمة البدء\n- [ ] صياغة الهدف في جملة واحدة\n- [ ] اختيار الأدوات الأربعة الأكثر فائدة\n- [ ] تحديد من سيتابع التقييم`
        : `## Execution plan\n\n1. **Day 1–2** — Define the end goal and what "success" looks like\n2. **Day 3–5** — Build the core: one key feature only, no bloat\n3. **Day 6–7** — Review, polish details, deliver\n\n### Kickoff checklist\n- [ ] Write the goal in one sentence\n- [ ] Pick the four most useful tools\n- [ ] Name the person who will track the review`
    },
    {
      id: "t-summary",
      label: "الملخص التنفيذي",
      model: "Nexus Engine (محلي)",
      text: ar
        ? `**الخلاصة:** الفكرة قابلة للتنفيذ بسرعة إذا ضيقنا النطاق إلى الجوهر.\n\n**الخطوة الأولى الآن:** اكتب الهدف في جملة واحدة ثم اختر أهم ميزة واحدة فقط.\n\n**أقصى مدة مقترحة:** أسبوع واحد للنسخة الأولى الكاملة.`
        : `**Bottom line:** the idea is fast-executable if we narrow scope to the core.\n\n**First step now:** write the goal in one sentence, then pick the single most important feature.\n\n**Suggested max timeline:** one week to a complete first version.`
    },
  ];
}

/** Merges the local drafts into one final answer (honest: local templates, not an LLM). */
export function mergeLocalDrafts(drafts: { text: string }[]): string {
  const body = drafts.map((d, i) => `### الجزء ${i + 1}\n${d.text}`).join("\n\n---\n\n");
  return `# النتيجة النهائية\n\n${body}\n\n---\n\n*مولّد محليًا (وضع بدون مفاتيح API) — أضف مفتاح Gemini أو Groq لنتائج ذكاء اصطناعي حقيقية.*`;
}
