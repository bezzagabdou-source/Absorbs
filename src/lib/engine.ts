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

/** Stream a long text in small natural chunks to a writer. */
export async function streamText(text: string, emit: (delta: string) => void | Promise<void>) {
  // chunk on word boundaries so markdown never splits mid-token badly
  const parts = text.match(/[\s\S]{1,64}(?=\s|$)|[\s\S]{1,64}/g) ?? [text];
  for (const p of parts) {
    await emit(p);
    await sleep(2 + Math.random() * 4);
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
