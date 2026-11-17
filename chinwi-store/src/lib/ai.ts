import { env } from "./env";

/**
 * ai.ts — محرّك الذكاء الاصطناعي للوحة التحكم.
 * المزوّدون: Groq (سريع) → Google Gemini (رؤية) → OpenRouter (احتياط).
 * كل مزوّد متاح يعمل تلقائياً، وإذا فشل واحد ينتقل للآخر.
 */

export type AiMessage = { role: "user" | "assistant" | "system"; content: string };
export type AiImage = { mime: string; data: Buffer };
export type AiResult = { text: string; provider: string };

const TIMEOUT = 30_000;

function withTimeout(ms = TIMEOUT): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

export function aiProviders(): { groq: boolean; gemini: boolean; openrouter: boolean } {
  return { groq: Boolean(env.groqKey), gemini: Boolean(env.geminiKey), openrouter: Boolean(env.openrouterKey) };
}

/* ───────────────────────── Groq ───────────────────────── */

async function groqChat(messages: AiMessage[]): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.groqKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      messages,
      temperature: 0.4,
      max_tokens: 2400,
    }),
    signal: withTimeout(),
  });
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("groq: empty");
  return text;
}

/* ───────────────────────── Gemini ───────────────────────── */

async function geminiGenerate(prompt: string, images: AiImage[] = [], system?: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mime, data: img.data.toString("base64") } });
  }
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.geminiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: withTimeout(45_000),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("gemini: empty");
  return text;
}

/* ───────────────────────── OpenRouter ───────────────────────── */

async function openrouterChat(messages: AiMessage[]): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.openrouterKey}`,
      "content-type": "application/json",
      "HTTP-Referer": env.siteUrl,
      "X-Title": "CHINWI STORE",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3.1",
      messages,
      temperature: 0.4,
      max_tokens: 2400,
    }),
    signal: withTimeout(),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("openrouter: empty");
  return text;
}

/* ───────────────────────── واجهة موحّدة ───────────────────────── */

export async function aiChat(
  messages: AiMessage[],
  opts: { system?: string; images?: AiImage[] } = {},
): Promise<AiResult> {
  const errors: string[] = [];
  const images = opts.images ?? [];
  const full: AiMessage[] = opts.system ? [{ role: "system", content: opts.system }, ...messages] : messages;

  if (images.length) {
    if (env.geminiKey) {
      try {
        const last = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
        const history = messages
          .slice(0, -1)
          .map((m) => `${m.role === "user" ? "المستخدم" : "المساعد"}: ${m.content}`)
          .join("\n");
        const prompt = `${history ? `سياق المحادثة:\n${history}\n\n` : ""}${last}`;
        return { text: await geminiGenerate(prompt, images, opts.system), provider: "gemini" };
      } catch (err) {
        errors.push(String(err));
      }
    }
    if (env.groqKey && images.length === 0) {
      /* Groq لا يدعم الصور في هذا المسار */
    }
  } else {
    if (env.groqKey) {
      try {
        return { text: await groqChat(full), provider: "groq" };
      } catch (err) {
        errors.push(String(err));
      }
    }
    if (env.geminiKey) {
      try {
        const history = messages
          .slice(0, -1)
          .map((m) => `${m.role === "user" ? "المستخدم" : "المساعد"}: ${m.content}`)
          .join("\n");
        const last = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
        const prompt = `${history ? `سياق المحادثة:\n${history}\n\n` : ""}${last}`;
        return { text: await geminiGenerate(prompt, [], opts.system), provider: "gemini" };
      } catch (err) {
        errors.push(String(err));
      }
    }
    if (env.openrouterKey) {
      try {
        return { text: await openrouterChat(full), provider: "openrouter" };
      } catch (err) {
        errors.push(String(err));
      }
    }
  }

  throw new Error(
    `لا يوجد مزوّد ذكاء اصطناعي متاح${errors.length ? ` — ${errors.join(" | ").slice(0, 300)}` : ""}`,
  );
}

/** استخراج JSON من ردّ قد يحتوي على شرح أو Code fence */
export function extractJson<T>(raw: string): T | null {
  const text = String(raw ?? "").trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fenced?.[1], text];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    } catch {
      continue;
    }
  }
  return null;
}

/* ───────────────────────── تحليل صورة أسعار ───────────────────────── */

export type ExtractedProduct = {
  name: string;
  price: number | null;
  price_label?: string | null;
  category?: string;
  description?: string;
};

export async function extractProductsFromImage(
  image: AiImage,
  categories: string[],
): Promise<{ products: ExtractedProduct[]; note?: string; provider: string }> {
  const system =
    "أنت خبير في تحليل صور قوائم أسعار المتاجر الرقمية. تُرجع JSON فقط بدون أي نص إضافي.";
  const prompt = [
    "حلّل هذه الصورة (قائمة أسعار متجر شحن/منتجات رقمية) واستخرج كل المنتجات والأسعار.",
    "قواعد:",
    "- العملة هي الدينار الجزائري (دج).",
    "- إن كان السعر غير واضح أو مكتوب (تواصل مع المالك) اجعل price = null و price_label = \"تواصل مع المالك\".",
    "- استخرج أسماء المنتجات كما هي مكتوبة بالعربية (مثال: 100 جوهرة، شحن 500 كوينز، عضوية أسبوعية).",
    `- الأقسام المتاحة في المتجر: ${categories.join(" ، ")}. اقترح القسم الأنسب لكل منتج.`,
    "- أعد النتيجة بهذا الشكل:",
    '{"products":[{"name":"...","price":320,"price_label":null,"category":"...","description":"..."}],"note":"ملاحظاتك"}',
  ].join("\n");

  const raw = env.geminiKey
    ? await geminiGenerate(prompt, [image], system)
    : await aiChat([{ role: "user", content: prompt }], { system }).then((r) => r.text);
  const parsed = extractJson<{ products?: ExtractedProduct[]; note?: string }>(raw);
  if (!parsed?.products) throw new Error("تعذّر استخراج المنتجات من الصورة — جرّب صورة أوضح.");
  return {
    products: parsed.products.filter((p) => p?.name).slice(0, 80),
    note: parsed.note,
    provider: env.geminiKey ? "gemini" : "text",
  };
}

/** مساعد المتجر: يولّد ردًّا عربيًا + خطة عمليات JSON */
export async function assistantPlan(
  messages: AiMessage[],
  context: string,
): Promise<{ reply: string; actions: AssistantAction[]; provider: string }> {
  const system = [
    "أنت «شينوي AI» — المساعد الذكي الكامل لمتجر CHINWI STORE على تيليجرام (متجر شحن ألعاب ومنتجات رقمية بالجزائر).",
    "تتحدث العربية الجزائرية المبسطة والفصحى، بأسلوب احترافي ودود ومختصر.",
    "لديك صلاحية تنفيذ أي عملية في المتجر عبر خطة عمليات JSON.",
    "",
    "بيانات المتجر الحالية:",
    context,
    "",
    "قواعد صارمة:",
    "1) أعد دائماً JSON صالحاً بهذه البنية فقط:",
    '{"reply":"نص الرد العربي للمالك","actions":[]}',
    "2) إذا طلب المالك عملية (إضافة/تعديل/حذف منتج، تعديل سعر، حظر مستخدم، قبول طلب، تغيير إعداد، إذاعة…) ضعها في actions.",
    "3) أنواع actions المسموحة فقط:",
    "   create_product {name, price, price_label, category, description, badge}",
    "   update_product {id, name?, price?, price_label?, description?, badge?, active?}",
    "   delete_product {id}",
    "   create_category {name, emoji, section}",
    "   update_setting {key, value}",
    "   ban_user {tg_id, reason}",
    "   unban_user {tg_id}",
    "   set_order_status {id, status}",
    "   broadcast {text}",
    "   update_wallet {id, account?, name?, instructions?}",
    "4) لا تخترع أرقام id — استخدم فقط المعرفات الموجودة في البيانات أعلاه.",
    "5) اشرح في reply ما ستفعله باختصار، ولا تكتب أي شيء خارج JSON.",
  ].join("\n");

  const res = await aiChat(messages, { system });
  const parsed = extractJson<{ reply?: string; actions?: AssistantAction[] }>(res.text);
  if (!parsed) return { reply: res.text.slice(0, 4000), actions: [], provider: res.provider };
  return {
    reply: String(parsed.reply ?? "").slice(0, 6000) || "تم.",
    actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 12) : [],
    provider: res.provider,
  };
}

export type AssistantAction = {
  type: string;
  [key: string]: unknown;
};

/** اقتراحات جاهزة تظهر في واجهة الذكاء الاصطناعي */
export const AI_SUGGESTIONS = [
  "حلّل مبيعاتي هذا الأسبوع وأعطني 3 اقتراحات لزيادة الأرباح",
  "أضف منتج: 1080 جوهرة فري فاير بسعر 3050 دج في قسم فري فاير",
  "رفّع كل أسعار قسم فري فاير بنسبة 5%",
  "اكتب منشوراً إعلانياً عن عرض جديد لتيليجرام بريميوم",
  "من هم أفضل 5 زبائن عندي؟",
  "اكتب رسالة إذاعة للزبائن بخصوص عروض نهاية الأسبوع",
];
