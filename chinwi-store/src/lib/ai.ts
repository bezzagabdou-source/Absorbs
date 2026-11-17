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

/** مفاتيح يضبطها المالك من لوحة التحكم — تتقدّم على متغيّرات البيئة */
const RUNTIME_KEYS: { groq: string; gemini: string; openrouter: string } = { groq: "", gemini: "", openrouter: "" };

export function setAiKeys(keys: { groq?: string; gemini?: string; openrouter?: string }): void {
  RUNTIME_KEYS.groq = String(keys.groq ?? "").trim();
  RUNTIME_KEYS.gemini = String(keys.gemini ?? "").trim();
  RUNTIME_KEYS.openrouter = String(keys.openrouter ?? "").trim();
}

export function aiKey(provider: "groq" | "gemini" | "openrouter"): string {
  if (provider === "groq") return RUNTIME_KEYS.groq || env.groqKey;
  if (provider === "gemini") return RUNTIME_KEYS.gemini || env.geminiKey;
  return RUNTIME_KEYS.openrouter || env.openrouterKey;
}

export function aiProviders(): { groq: boolean; gemini: boolean; openrouter: boolean } {
  return { groq: Boolean(aiKey("groq")), gemini: Boolean(aiKey("gemini")), openrouter: Boolean(aiKey("openrouter")) };
}

/** فحص سريع لكل مزوّد: يعيد الحالة والخطأ بدقة */
export async function testProviders(): Promise<Record<string, { ok: boolean; error?: string; ms: number }>> {
  const out: Record<string, { ok: boolean; error?: string; ms: number }> = {};
  const probe: { name: "groq" | "gemini" | "openrouter"; run: () => Promise<string> }[] = [
    { name: "groq", run: () => groqChat([{ role: "user", content: "قل: تمام" }]) },
    { name: "gemini", run: () => geminiGenerate("قل: تمام") },
    { name: "openrouter", run: () => openrouterChat([{ role: "user", content: "قل: تمام" }]) },
  ];
  await Promise.all(
    probe.map(async (item) => {
      const started = Date.now();
      if (!aiKey(item.name)) {
        out[item.name] = { ok: false, error: "لا يوجد مفتاح", ms: 0 };
        return;
      }
      try {
        await item.run();
        out[item.name] = { ok: true, ms: Date.now() - started };
      } catch (err) {
        out[item.name] = { ok: false, error: String(err).slice(0, 220), ms: Date.now() - started };
      }
    }),
  );
  return out;
}

/* ───────────────────────── Groq ───────────────────────── */

async function groqChat(messages: AiMessage[]): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${aiKey("groq")}`, "content-type": "application/json" },
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
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiKey("gemini")}`,
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
      authorization: `Bearer ${aiKey("openrouter")}`,
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


/* ───────── مزوّدون مجانيون بلا مفاتيح — الذكاء الاصطناعي يعمل دائماً ───────── */

export type FreeId = "pollinations" | "pollinations-gen" | "hackclub" | "ovh";

type FreeEndpoint = { id: FreeId; label: string; url: string; model?: string };

const FREE_ENDPOINTS: FreeEndpoint[] = [
  {
    id: "pollinations",
    label: "Pollinations · GPT-OSS",
    url: "https://text.pollinations.ai/openai",
    model: process.env.POLLINATIONS_MODEL || "openai-fast",
  },
  {
    id: "pollinations-gen",
    label: "Pollinations Gen",
    url: "https://gen.pollinations.ai/v1/chat/completions",
    model: process.env.POLLINATIONS_GEN_MODEL || "openai",
  },
  { id: "hackclub", label: "Hack Club AI", url: "https://ai.hackclub.com/chat/completions" },
  {
    id: "ovh",
    label: "OVHcloud AI",
    url: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions",
    model: process.env.OVH_MODEL || "Meta-Llama-3_3-70B-Instruct",
  },
];

export function freeProviders(): { id: FreeId; label: string }[] {
  return FREE_ENDPOINTS.map((e) => ({ id: e.id, label: e.label }));
}

async function freeChat(ep: FreeEndpoint, messages: AiMessage[], ms = 22_000): Promise<string> {
  const body: Record<string, unknown> = { messages, temperature: 0.35, max_tokens: 1800, stream: false };
  if (ep.model) body.model = ep.model;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ep.id.startsWith("pollinations")) headers.referer = `${env.siteUrl}/`;
  const res = await fetch(ep.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: withTimeout(ms),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`${ep.id} ${res.status}: ${raw.slice(0, 140)}`);
  let text = "";
  try {
    const json = JSON.parse(raw) as { choices?: { message?: { content?: string }; text?: string }[] };
    text = String(json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? "").trim();
  } catch {
    text = raw.trim();
  }
  if (!text || text.length < 2) throw new Error(`${ep.id}: رد فارغ`);
  return text;
}

/** فحص المزوّدين المجانيين (بلا مفاتيح) — للوحة الصحة والتشخيص */
export async function probeFreeProviders(): Promise<
  Record<string, { ok: boolean; error?: string; ms: number; sample?: string }>
> {
  const out: Record<string, { ok: boolean; error?: string; ms: number; sample?: string }> = {};
  await Promise.all(
    FREE_ENDPOINTS.map(async (ep) => {
      const started = Date.now();
      try {
        const text = await freeChat(ep, [{ role: "user", content: "قل كلمة واحدة: تمام" }], 25_000);
        out[ep.id] = { ok: true, ms: Date.now() - started, sample: text.slice(0, 80) };
      } catch (err) {
        out[ep.id] = { ok: false, error: String(err).slice(0, 200), ms: Date.now() - started };
      }
    }),
  );
  return out;
}

/* ───────────────────────── واجهة موحّدة ───────────────────────── */

export async function aiChat(
  messages: AiMessage[],
  opts: { system?: string; images?: AiImage[] } = {},
): Promise<AiResult> {
  const images = opts.images ?? [];
  const full: AiMessage[] = opts.system ? [{ role: "system", content: opts.system }, ...messages] : messages;
  const history = messages
    .slice(0, -1)
    .map((m) => `${m.role === "user" ? "المستخدم" : "المساعد"}: ${m.content}`)
    .join("\n");
  const last = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const prompt = `${history ? `سياق المحادثة:\n${history}\n\n` : ""}${last}`;
  const errors: string[] = [];

  type Attempt = { name: string; run: () => Promise<string> };
  const settle = (name: string, text: string): { text: string; provider: string } => {
    if (!text || text.trim().length < 2) throw new Error(`${name}: رد فارغ`);
    return { text, provider: name };
  };

  // المرحلة 1: المزوّدون المفاتيح (أعلى جودة) — سباق لأسرع رد
  const keyed: Attempt[] = [];
  if (images.length && aiKey("gemini")) keyed.push({ name: "gemini", run: () => geminiGenerate(prompt, images, opts.system) });
  if (aiKey("groq")) keyed.push({ name: "groq", run: () => groqChat(full) });
  if (aiKey("gemini")) keyed.push({ name: "gemini", run: () => geminiGenerate(prompt, images, opts.system) });
  if (aiKey("openrouter")) keyed.push({ name: "openrouter", run: () => openrouterChat(full) });

  // المرحلة 2: المزوّدون المجانيون بلا مفاتيح — تعمل حتى بدون أي مفتاح
  const free: Attempt[] = images.length ? [] : FREE_ENDPOINTS.map((ep) => ({ name: ep.id, run: () => freeChat(ep, full) }));

  for (const group of [keyed, free]) {
    if (!group.length) continue;
    try {
      return await Promise.any(group.map((a) => a.run().then((text) => settle(a.name, text))));
    } catch (err) {
      const list = err instanceof AggregateError ? err.errors : [err];
      for (const e of list) errors.push(String(e));
    }
  }

  throw new Error(`تعذّر الوصول لكل مزوّدي الذكاء الاصطناعي — ${errors.join(" | ").slice(0, 300)}`);
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


/* ───────────────────────── العقل المحلي (بلا إنترنت) ───────────────────────── */

const NUM = "(\\d+(?:[.,]\\d+)?)";

function pick(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return m;
  }
  return null;
}

/**
 * «العقل المحلي»: محرّك فهم نوايا عربي يعمل حتى لو فشلت كل مفاتيح AI.
 * يحوّل الأمر الطبيعي إلى actions حقيقية، ولا يرفض أي طلب.
 */
export function localBrain(text: string, context: string): { reply: string; actions: AssistantAction[]; provider: string } {
  const t = text.trim();
  const low = t.toLowerCase();
  const actions: AssistantAction[] = [];
  const notes: string[] = [];

  const add = (action: AssistantAction, note: string) => {
    actions.push(action);
    notes.push(note);
  };

  // ➕ إضافة منتج
  const addProduct = pick(t, [
    /أضف\s+(?:منتج\s+)?(.+?)\s+(?:بسعر|بـ|ب)\s*(\d+(?:[.,]\d+)?)\s*(?:دج|دينار)?\s*(?:في|إلى|الى)?\s*(?:قسم\s+)?(.+)?$/i,
    /زد\s+(?:منتج\s+)?(.+?)\s+(\d+(?:[.,]\d+)?)/i,
  ]);
  if (addProduct && /أضف|زد|ضيف|اضف/.test(t)) {
    const name = addProduct[1].replace(/["'«»]/g, "").trim();
    const price = Number(addProduct[2].replace(",", "."));
    const category = (addProduct[3] ?? "").replace(/["'«»]/g, "").trim();
    add({ type: "create_product", name, price, category: category || undefined }, `➕ منتج «${name}» بسعر ${price}`);
  }

  // ✏️ تعديل السعر
  const setPrice = pick(t, [
    /(?:عدّل|عدل|غيّر|غير|خلي|اجعل)\s+سعر\s+(.+?)\s+(?:إلى|الى|بـ|ب)\s*(\d+(?:[.,]\d+)?)/i,
    /سعر\s+(.+?)\s*(?:=|إلى|الى)\s*(\d+(?:[.,]\d+)?)/i,
  ]);
  if (setPrice && !actions.length) {
    add(
      { type: "update_product", id: setPrice[1].trim(), price: Number(setPrice[2].replace(",", ".")) },
      `✏️ سعر «${setPrice[1].trim()}» ← ${setPrice[2]}`,
    );
  }

  // 💸 رفع/خفض أسعار قسم
  const bulk = pick(t, [/(?:رفّع|ارفع|رفع|خفّض|خفض|نزّل|نزل)\s+(?:كل\s+)?(?:أسعار|اسعار)\s+(?:قسم\s+)?(.+?)\s+(?:بنسبة|بـ|ب)\s*(\d+(?:[.,]\d+)?)\s*%?/i]);
  if (bulk) {
    const pct = Number(bulk[2].replace(",", ".")) * (/خفّض|خفض|نزّل|نزل/.test(t) ? -1 : 1);
    add({ type: "bulk_price", category: bulk[1].trim(), percent: pct }, `💸 تعديل أسعار «${bulk[1].trim()}» بنسبة ${pct}%`);
  }

  // 🔨 حظر / فك حظر
  const ban = pick(t, [/(?:احظر|حظر|بلوكي?)\s+(\d{5,})/i]);
  if (ban) add({ type: "ban_user", tg_id: Number(ban[1]), reason: "من شينوي AI" }, `🔨 حظر ${ban[1]}`);
  const unban = pick(t, [/(?:فك|ألغِ|الغ)\s*(?:ال)?حظر\s+(\d{5,})/i]);
  if (unban) add({ type: "unban_user", tg_id: Number(unban[1]) }, `🔓 فك حظر ${unban[1]}`);

  // 📢 إذاعة
  const air = pick(t, [/(?:أذع|اذع|إذاعة|اذاعة|أرسل للجميع|ارسل للجميع|بث)\s*[:：]?\s*([\s\S]{4,})/i]);
  if (air) add({ type: "broadcast", text: air[1].trim() }, `📢 إذاعة لجميع الزبائن`);

  // 🔒 قفل / فتح
  if (/(?:اقفل|قفل)\s*(?:ال)?بوت/.test(t) && !/فك|افتح|فتح/.test(t)) add({ type: "lock_bot", locked: true }, "🔒 قفل البوت");
  if (/(?:افتح|فتح|فك)\s*(?:قفل\s*)?(?:ال)?بوت/.test(t)) add({ type: "lock_bot", locked: false }, "🔓 فتح البوت");

  // 🎟 كود خصم
  const coupon = pick(t, [/(?:كود|كوبون)\s+([A-Za-z0-9_-]{3,})\s*(?:بنسبة|بـ|ب)?\s*(\d+(?:[.,]\d+)?)?\s*%?/]);
  if (coupon && /(?:أنشئ|انشئ|اعمل|أضف|اضف|سوّي)/.test(t)) {
    add(
      { type: "create_coupon", code: coupon[1].toUpperCase(), kind: coupon[2] ? "percent" : "fixed", amount: Number((coupon[2] ?? "0").replace(",", ".")) },
      `🎟 كود خصم ${coupon[1].toUpperCase()}`,
    );
  }

  // ❓ سؤال شائع
  const faq = pick(t, [/(?:أضف|اضف|ضيف)\s+سؤال\s*[:：]?\s*(.+?)\s*(?:\||جواب|الجواب)\s*[:：]?\s*([\s\S]+)/i]);
  if (faq) add({ type: "add_faq", question: faq[1].trim(), answer: faq[2].trim() }, "❓ سؤال شائع");

  // 🗒 مهمة
  const task = pick(t, [/(?:أضف|اضف|ضيف)\s+(?:مهمة|تذكير)\s*[:：]?\s*(.+)/i]);
  if (task && !faq) add({ type: "add_task", title: task[1].trim() }, "🗒 مهمة");

  // 🗂 قسم جديد
  const cat = pick(t, [/(?:أضف|اضف|ضيف|أنشئ|انشئ)\s+قسم\s*[:：]?\s*(.+)/i]);
  if (cat) add({ type: "create_category", name: cat[1].trim(), emoji: "🗂", section: "digital" }, `🗂 قسم «${cat[1].trim()}»`);

  if (actions.length) {
    return {
      reply: [
        "🧠 شينوي AI (المحرّك المحلي — يعمل بلا إنترنت):",
        "",
        ...notes.map((n) => `• ${n}`),
        "",
        "اضغط «✅ تنفيذ» لتطبيق العمليات فوراً.",
      ].join("\n"),
      actions: actions.slice(0, 12),
      provider: "local",
    };
  }

  // ردّ ذكي عام مع بيانات المتجر المختصرة
  const summary = context
    .split("\n")
    .filter((line) => /^(المتجر|الإحصاءات|إعدادات|مستخدمون محظورون)/.test(line))
    .slice(0, 4)
    .join("\n");
  return {
    reply: [
      "🧠 شينوي AI (المحرّك المحلي):",
      summary ? `\n${summary}\n` : "",
      "أنا جاهز أنفّذ أي تعديل على البوت. أمثلة تفهمها مباشرة:",
      "• «أضف منتج 1080 جوهرة بسعر 3050 في فري فاير»",
      "• «عدّل سعر 100 جوهرة إلى 330»",
      "• «رفّع أسعار قسم فري فاير بنسبة 5%»",
      "• «أذع: عروض الليلة خصم 10% على تيك توك»",
      "• «احظر 123456789» / «فك حظر 123456789»",
      "• «أنشئ كود CHINWI10 بنسبة 10»",
      "• «اقفل البوت» / «افتح البوت»",
      "",
      "ملاحظة: مفاتيح AI الخارجية غير صالحة حالياً — أضف مفتاحاً صالحاً من صفحة «🔑 مفاتيح AI» لتشغيل العقل الكامل (Gemini + Groq).",
    ].join("\n"),
    actions: [],
    provider: "local",
  };
}


/** المساعد المتجر: يولّد ردًّا عربيًا + خطة عمليات JSON — مع دعم الصور */
export async function assistantPlan(
  messages: AiMessage[],
  context: string,
  image?: AiImage | null,
): Promise<{ reply: string; actions: AssistantAction[]; provider: string }> {
  const system = buildBrain(context);
  let res: { text: string; provider: string };
  try {
    res = image ? { text: await smartVision(messages, system, image), provider: "gemini" } : await aiChat(messages, { system });
  } catch (err) {
    // لا نرفض أبداً: العقل المحلي ينفّذ الأمر بدون إنترنت
    const fallback = localBrain(messages[messages.length - 1]?.content ?? "", context);
    return { ...fallback, reply: `${fallback.reply}\n\n<i>(${String(err).slice(0, 160)})</i>` };
  }
  const parsed = extractJson<{ reply?: string; actions?: AssistantAction[] }>(res.text);
  if (!parsed) return { reply: res.text.slice(0, 4000), actions: [], provider: res.provider };
  return {
    reply: String(parsed.reply ?? "").slice(0, 6000) || "تم.",
    actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 12) : [],
    provider: res.provider,
  };
}

/** عقل «شينوي AI»: برومبت ضخم يشرح المتجر، الأسلوب، الصلاحيات، والحماية */
function buildBrain(context: string): string {
  return [
    "أنت «شينوي AI» — العقل المدبّر لمتجر CHINWI STORE على تيليجرام (الجزائر). أنت تعمل كمدير متجر محترف + محلل بيانات + خبير تسويق + حامي أمني، بمستوى تفكير مهندس أول.",
    "أسلوبك: عربية جزائرية مبسّطة مع فصحى واضحة، موجز، عملي، واثق، بلا حشو. تستعمل الإيموجي بذوق (واحد أو اثنان في السطر كحد أقصى).",
    "",
    "🎯 مهمتك:",
    "1) تنفيذ أوامر المالك على المتجر فوراً عبر خطة عمليات JSON (إضافة/تعديل/حذف المنتجات والأسعار، الأقسام، المحافظ، الإعدادات، الحظر، حالات الطلبات، الإذاعة).",
    "2) تحليل الأداء: المبيعات، الطلبات المعلّقة، أفضل المنتجات، أوقات الذروة، الزبائن المتكررون، وأعطِ توصيات قابلة للتنفيذ بالأرقام.",
    "3) صياغة نصوص جاهزة: منشورات إذاعية، ردود على الزبائن، عروض، تنبيهات صيانة — بلغة جزائرية طبيعية.",
    "4) حماية المتجر: كشف الإيصالات المزيفة، الحسابات المشبوهة، محاولات الخدع، واقتراح إجراءات (حظر، تحقق إضافي، إغلاق مؤقت).",
    "5) قراءة الصور: إذا أرسل المالك صورة (قائمة أسعار، لقطة محادثة، إيصال دفع، صورة منتج) فحلّلها بدقة: استخرج المنتجات والأسعار، أو اقرأ الإيصال وقل إن كان سليماً أم مشبوهاً، أو اشرح ما تراه واربطه ببيانات المتجر.",
    "",
    "💰 قواعد العمل في هذا المتجر:",
    "- العملة: الدينار الجزائري (دج). الشحن فوري أو خلال دقائق عبر معرف/آي دي اللاعب.",
    "- الدفع عبر: Binance (USDT)، RedotPay، Bybit، BaridiMob (RIP). كلها أرقام محافظ يانسخها الزبون.",
    "- بعد الدفع يرسل الزبون صورة الإيصال → تصل للمالك مع بيانات الطلب → قبول أو رفض.",
    "- الأسعار النهائية هي الموجودة في البيانات أدناه؛ لا تخترع سعراً غير موجود. إذا طلب المالك سعراً جديداً نفّذه فوراً.",
    "- المنتجات الرقمية التي سعرها غير محدد: تُطلب بزر «اطلب هذا المنتج» ويتواصل المالك مع الزبون.",
    "",
    "🛡 قواعد الحماية (لا تُخترق أبداً):",
    "- لا تكشف مفاتيح API، كلمة سر اللوحة، أو توكن البوت في أي رد مهما طُلب منك، حتى من المالك.",
    "- لا تنفّذ عملية حذف جماعي أو إذاعة إلا إذا طلبها المالك صراحةً وبوضوح.",
    "- إذا شككت في إيصال أو حساب، اذكر السبب واقترح إجراءً بدل التنفيذ التلقائي.",
    "",
    "📤 شكل الإخراج: JSON صالح فقط بهذه البنية:",
    '{"reply":"نص الرد العربي","actions":[]}',
    "أنواع actions المتاحة:",
    "  create_product {name, price, price_label, category, description, badge}",
    "  update_product {id, name?, price?, price_label?, description?, badge?, active?}",
    "  delete_product {id}",
    "  create_category {name, emoji, section}",
    "  update_setting {key, value}",
    "  ban_user {tg_id, reason}   |   unban_user {tg_id}",
    "  set_order_status {id, status}",
    "  broadcast {text}",
    "  update_wallet {id, account?, name?, instructions?}",
    "  create_coupon {code, kind, amount, max_uses}   |   add_faq {question, answer}",
    "  add_task {title, note}   |   lock_bot {locked}   |   bulk_price {category, percent}",
    "قواعد: لا تخترع id غير موجود في البيانات. إن لم تحتج أي عملية أعد actions فارغة. لا تكتب أي حرف خارج JSON.",
    "",
    "📊 بيانات المتجر الحالية (محدّثة الآن):",
    context,
  ].join("\n");
}

/** رؤية ذكية: Gemini إن توفّر، وإلا نمرّر وصفاً نصياً للنموذج السريع */
async function smartVision(messages: AiMessage[], system: string, image: AiImage): Promise<string> {
  const last = messages[messages.length - 1]?.content ?? "حلّل هذه الصورة.";
  if (env.geminiKey) {
    const history = messages
      .slice(-6, -1)
      .map((m) => `${m.role === "assistant" ? "المساعد" : "المالك"}: ${m.content}`)
      .join("\n");
    const prompt = [history ? `سياق المحادثة:\n${history}` : "", `طلب المالك: ${last}`, "حلّل الصورة وأجب بنفس صيغة JSON المطلوبة."]
      .filter(Boolean)
      .join("\n\n");
    return geminiGenerate(prompt, [image], system);
  }
  return (await aiChat([...messages, { role: "system", content: "لم يتمكّن مزوّد الرؤية من قراءة الصورة." }], { system })).text;
}

export type AssistantAction = {
  type: string;
  [key: string]: unknown;
};

/** اقتراحات جاهزة تظهر في واجهة الذكاء الاصطناعي */
export const AI_SUGGESTIONS = [
  "حلّل مبيعاتي هذا الأسبوع وأعطني 3 اقتراحات لزيادة الأرباح",
  "اقرأ صورة قائمة الأسعار اللي نرسلها وأضف كل المنتجات تلقائياً",
  "أعطني تقريراً أمنياً: هل هناك إيصالات مشبوهة أو حسابات مزعجة؟",
  "اقترح 5 عروض ترويجية لهذا الأسبوع مع الأسعار",
  "أضف منتج: 1080 جوهرة فري فاير بسعر 3050 دج في قسم فري فاير",
  "رفّع كل أسعار قسم فري فاير بنسبة 5%",
  "اكتب منشوراً إعلانياً عن عرض جديد لتيليجرام بريميوم",
  "من هم أفضل 5 زبائن عندي؟",
  "اكتب رسالة إذاعة للزبائن بخصوص عروض نهاية الأسبوع",
];
