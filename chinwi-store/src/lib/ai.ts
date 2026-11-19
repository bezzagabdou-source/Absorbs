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
  const models = Array.from(
    new Set([process.env.GROQ_MODEL || "", "openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"].filter(Boolean)),
  );
  let lastErr = "";
  for (const model of models) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${aiKey("groq")}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 2400 }),
      signal: withTimeout(),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content;
      if (text) return text;
      lastErr = "groq: empty";
      continue;
    }
    lastErr = `groq ${res.status} (${model}): ${(await res.text()).slice(0, 160)}`;
    // مفتاح خاطئ → لا فائدة من تجربة نماذج أخرى
    if (res.status === 401 || res.status === 403) break;
  }
  throw new Error(lastErr);
}

/* ───────────────────────── Gemini ───────────────────────── */


/** قائمة النماذج المتاحة فعلياً لهذا المفتاح — تحلّ مشكلة أسماء النماذج المتغيّرة */
async function geminiModelList(key: string): Promise<string[]> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, {
      headers: { "x-goog-api-key": key },
      signal: withTimeout(10_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
    return (json.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => String(m.name ?? "").replace(/^models\//, ""))
      .filter((name) => /gemini/i.test(name))
      .sort((a, b) => (/flash/i.test(b) ? 1 : 0) - (/flash/i.test(a) ? 1 : 0));
  } catch {
    return [];
  }
}

async function geminiGenerate(prompt: string, images: AiImage[] = [], system?: string): Promise<string> {
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mime, data: img.data.toString("base64") } });
  }
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const key = aiKey("gemini");
  const models = Array.from(
    new Set(
      [process.env.GEMINI_MODEL || "", "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"].filter(Boolean),
    ),
  );
  let lastErr = "";
  let tried = models;
  const deadline = Date.now() + 12_000;
  for (const model of tried) {
    if (Date.now() > deadline) break;
    for (const version of ["v1beta", "v1"]) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          // المفاتيح الجديدة (AQ.) تعمل برأس x-goog-api-key أيضاً
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: withTimeout(45_000),
        },
      );
      const raw = await res.text();
      if (res.ok) {
        try {
          const json = JSON.parse(raw) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
          const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
          if (text) return text;
          lastErr = "gemini: empty";
        } catch {
          lastErr = `gemini: bad json ${raw.slice(0, 100)}`;
        }
        continue;
      }
      lastErr = `gemini ${res.status} (${model}/${version}): ${raw.slice(0, 200)}`;
      if (res.status === 401 || res.status === 403) break;
    }
  }
  // كل الأسماء الثابتة فشلت → نجلب أسماء النماذج المتاحة من Google ونعيد المحاولة
  const discovered =
    Date.now() > deadline ? [] : (await geminiModelList(key)).filter((m) => !tried.includes(m)).slice(0, 3);
  if (discovered.length) {
    tried = discovered;
    for (const model of discovered) {
      if (Date.now() > deadline + 20_000) break;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: withTimeout(45_000),
        },
      );
      const raw = await res.text();
      if (!res.ok) {
        lastErr = `gemini ${res.status} (${model}): ${raw.slice(0, 200)}`;
        continue;
      }
      try {
        const json = JSON.parse(raw) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
        if (text) return text;
      } catch {
        lastErr = `gemini: bad json ${raw.slice(0, 100)}`;
      }
    }
  }
  throw new Error(lastErr);
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

export type FreeId = "pollinations" | "pollinations-openai" | "pollinations-get" | "ovh";

type FreeEndpoint = { id: FreeId; label: string; url: string; model?: string };

const FREE_ENDPOINTS: FreeEndpoint[] = [
  {
    id: "pollinations",
    label: "Pollinations · GPT-OSS (مجاني)",
    url: "https://text.pollinations.ai/openai",
    model: process.env.POLLINATIONS_MODEL || "openai-fast",
  },
  {
    id: "pollinations-openai",
    label: "Pollinations · OpenAI (مجاني)",
    url: "https://text.pollinations.ai/openai",
    model: process.env.POLLINATIONS_MODEL_2 || "openai",
  },
  {
    id: "pollinations-get",
    label: "Pollinations · GET (مجاني)",
    url: "https://text.pollinations.ai/",
    model: process.env.POLLINATIONS_MODEL_3 || "openai-fast",
  },
  {
    id: "ovh",
    label: "OVHcloud AI (مجاني)",
    url: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions",
    model: process.env.OVH_MODEL || "Meta-Llama-3_3-70B-Instruct",
  },
];

export function freeProviders(): { id: FreeId; label: string }[] {
  return FREE_ENDPOINTS.map((e) => ({ id: e.id, label: e.label }));
}

async function freeChat(ep: FreeEndpoint, messages: AiMessage[], ms = 20_000): Promise<string> {
  // نمط GET البسيط في Pollinations: أسرع وأخف من JSON
  if (ep.id === "pollinations-get") {
    const prompt = messages.map((m) => `${m.role === "system" ? "تعليمات" : m.role === "user" ? "المستخدم" : "المساعد"}: ${m.content}`).join("\n");
    const url = `${ep.url}${encodeURIComponent(prompt.slice(0, 3500))}?model=${encodeURIComponent(ep.model || "openai-fast")}`;
    const res = await fetch(url, { headers: { referer: `${env.siteUrl}/` }, signal: withTimeout(ms) });
    const text = (await res.text()).trim();
    if (!res.ok) throw new Error(`pollinations-get ${res.status}: ${text.slice(0, 120)}`);
    if (!text || text.length < 2 || text.startsWith("{")) throw new Error("pollinations-get: رد غير صالح");
    return text;
  }
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
export async function probeFreeProviders(only?: string[]): Promise<
  Record<string, { ok: boolean; error?: string; ms: number; sample?: string }>
> {
  const out: Record<string, { ok: boolean; error?: string; ms: number; sample?: string }> = {};
  const list = only && only.length ? FREE_ENDPOINTS.filter((e) => only.includes(e.id)) : FREE_ENDPOINTS;
  await Promise.all(
    list.map(async (ep) => {
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
  // 🛠 إغلاق/تشغيل المتجر (صيانة)
  if (/(?:اغلق|أغلق|غلق|اوقف|أوقف|وقف|عطل)\s*(?:ال)?(?:بوت|متجر|ستور)/i.test(t) && !/افتح|شغل|شغّل|فتح/.test(t))
    add({ type: "maintenance", on: true }, "🛠 إيقاف البوت (صيانة)");
  if (/(?:شغل|شغّل|افتح|فتح|رجع|ارجع|أرجع)\s*(?:ال)?(?:بوت|متجر|ستور)/i.test(t))
    add({ type: "maintenance", on: false }, "✅ تشغيل البوت");
  // 🚫 حظر/إحضار شخص بالاسم أو المعرف
  const banMatch = /(?:احضر|أحضر|احظر|أحظر|طرد|اطرد|بلوك|حظر)\s+(?:ال)?(?:شخص\s+|مستخدم\s+|ال)?(@?[A-Za-z0-9_\u0600-\u06FF]{2,40})/i.exec(t);
  if (banMatch && !/فك|الغ|إلغاء|الغي/.test(t)) add({ type: "ban_user", username: banMatch[1].replace(/^@/, ""), reason: "أمر المالك عبر شينوي AI" }, `🚫 حظر ${banMatch[1]}`);
  if (/(?:فك|الغ|إلغاء|الغي)\s*(?:ال)?حظر\s*(?:عن\s*)?(@?[A-Za-z0-9_\u0600-\u06FF]{2,40})/i.test(t)) {
    const m = /(?:فك|الغ|إلغاء|الغي)\s*(?:ال)?حظر\s*(?:عن\s*)?(@?[A-Za-z0-9_\u0600-\u06FF]{2,40})/i.exec(t);
    if (m) add({ type: "unban_user", username: m[1].replace(/^@/, "") }, `✅ إلغاء حظر ${m[1]}`);
  }
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

  // 🧾 حالة طلب (موافقة/رفض)
  const orderDec = pick(t, [
    /(?:وافق|اقبل)\s*(?:على\s*)?(?:ال)?طلب\s*#?(\d+)/i,
    /(?:ارفض|رفض)\s*(?:ال)?طلب\s*#?(\d+)/i,
  ]);
  if (orderDec) {
    const approve = /(?:وافق|اقبل)/i.test(t);
    add({ type: "set_order_status", id: Number(orderDec[1]), status: approve ? "approved" : "rejected" }, `🧾 الطلب #${orderDec[1]} → ${approve ? "approved" : "rejected"}`);
  }

  // 🗑 حذف منتج / تعطيل / تفعيل
  const delProduct = pick(t, [/(?:احذف|حذف|امسح)\s+(?:المنتج\s+)?#?(\d+)/i]);
  if (delProduct) add({ type: "delete_product", id: Number(delProduct[1]) }, `🗑 حذف المنتج #${delProduct[1]}`);
  const offProduct = pick(t, [/(?:عطّل|عطل|اوقف|وقّف)\s+(?:المنتج\s+)?#?(\d+)/i]);
  if (offProduct) add({ type: "update_product", id: Number(offProduct[1]), active: false }, `⏸ تعطيل المنتج #${offProduct[1]}`);
  const onProduct = pick(t, [/(?:فعّل|فعل|شغّل|شغل)\s+(?:المنتج\s+)?#?(\d+)/i]);
  if (onProduct) add({ type: "update_product", id: Number(onProduct[1]), active: true }, `▶️ تفعيل المنتج #${onProduct[1]}`);

  // ⭐ نقاط لمستخدم
  const addPts = pick(t, [/(?:أضف|اضف|اعط|أعطي|ضيف)\s*(\d+)\s*نقطة\s*(?:لـ|إلى|الى|ل)?\s*(@?[\w\u0600-\u06FF._-]+)/i]);
  if (addPts) add({ type: "add_points", username: addPts[2].replace(/^@/, ""), points: Number(addPts[1]) }, `⭐ +${addPts[1]} نقطة → ${addPts[2]}`);
  const addPts2 = pick(t, [/(?:أعطي|اعطي)\s+(@?[\w\u0600-\u06FF._-]+)\s+(\d+)\s*نقطة/i]);
  if (addPts2) add({ type: "add_points", username: addPts2[1].replace(/^@/, ""), points: Number(addPts2[2]) }, `⭐ +${addPts2[2]} نقطة → ${addPts2[1]}`);
  const subPts = pick(t, [/(?:انقص|انقص من|اخصم|خصم)\s*(\d+)\s*نقطة\s*(?:من\s*)?(@?[\w\u0600-\u06FF._-]+)/i]);
  if (subPts) add({ type: "add_points", username: subPts[2].replace(/^@/, ""), points: -Number(subPts[1]) }, `⭐ -${subPts[1]} نقطة ← ${subPts[2]}`);

  // 🎁 الجوائز: إضافة / حذف / قرار استبدال
  const addPrize = pick(t, [/(?:أضف|اضف|اعمل|سوّي)\s+جائزة\s*[:：]?\s*(.+?)\s+(?:بـ|ب)\s*(\d+)\s*نقطة/i]);
  if (addPrize) add({ type: "create_prize", title: addPrize[1].trim(), points: Number(addPrize[2]) }, `🎁 جائزة «${addPrize[1].trim()}» ب ${addPrize[2]} نقطة`);
  const delPrize = pick(t, [/(?:احذف|حذف)\s+جائزة\s*#?(\d+)/i]);
  if (delPrize) add({ type: "delete_prize", id: Number(delPrize[1]) }, `🗑 حذف الجائزة #${delPrize[1]}`);
  const decRedempt = pick(t, [/(?:وافق|اقبل|ارفض|رفض)\s*(?:على\s*)?(?:طلب\s*)?(?:الجائزة|الاستبدال)\s*#?(\d+)/i]);
  if (decRedempt) add({ type: "decide_redemption", id: Number(decRedempt[1]), approve: /وافق|اقبل/i.test(decRedempt[0]) }, `🎁 طلب الجائزة #${decRedempt[1]} → ${/وافق|اقبل/i.test(decRedempt[0]) ? "مقبول" : "مرفوض"}`);

  // 🎟 حذف كوبون
  const delCoupon = pick(t, [/(?:احذف|حذف|باطل)\s+(?:كود|كوبون)\s+([A-Za-z0-9_-]{3,})/i]);
  if (delCoupon) add({ type: "delete_coupon", code: delCoupon[1].toUpperCase() }, `🗑 حذف الكود ${delCoupon[1].toUpperCase()}`);

  // 📉 تصفير الإحصائيات
  if (/(?:صفر|تصفير|مسح|امسح)\s*(?:ال)?(?:إحصائيات|احصائيات|إحصاءات|احصاءات|مبيعات|الأرباح|الارباح)/i.test(t)) {
    add({ type: "reset_stats" }, "📉 تصفير الإحصائيات والمبيعات");
  }

  // 📩 رسالة خاصة لمستخدم
  const dm = pick(t, [/(?:أرسل|ارسل)\s+(?:رسالة\s+)?(?:لـ|إلى|الى|ل)\s*(@?[A-Za-z0-9_\u0600-\u06FF.]+)\s*[:：]?\s*([\s\S]{3,})/i]);
  if (dm) add({ type: "send_message", username: dm[1].replace(/^@/, ""), text: dm[2].trim() }, `📩 رسالة → ${dm[1]}`);

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


/** لو الرد يوحي بتنفيذ لكن بلا أي عملية — نضيف تنبيه صريح بدل «نجاح وهمي» */
function withHonestyGuard(reply: string, actions: AssistantAction[]): string {
  if (actions.length) return reply;
  const claims =
    /(^|\n|\s)(تم|تمت|أنجزت|نفذت|أضفت|حذفت|عدّلت|غيّرت|خليت|حظرت|أغلقت|قفلت|شغّلت|شغلت|أوقفت|وقفت|صفرت|أرسلت|نشرت|وافقت|رفضت|قبلت|ضفت|بعثت|منحت)(\s|[!.,:;؛؟]|$|\b)/.test(
      reply,
    );
  if (!claims) return reply;
  return `${reply}\n\n⚠️ <b>تنبيه:</b> ما زدتش أي عملية في الخطة — إذاً ما تنفّذ شيء فعلياً. أعد صياغة طلبك بصيغة أمر واضح (مثال: «أضف منتج X بسعر Y في فري فاير»).`;
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
    void err;
    console.error("[ai] كل المزوّدات فشلت:", String(err).slice(0, 300));
    return { ...fallback, provider: "local" };
  }
  const parsed = extractJson<{ reply?: string; actions?: AssistantAction[] }>(res.text);
  const lastText = messages[messages.length - 1]?.content ?? "";
  const local = localBrain(lastText, context);
  const remoteActions = Array.isArray(parsed?.actions) ? parsed.actions.slice(0, 12) : [];
  // ضمان التنفيذ: لو المزوّد ردّ نصاً بدون أوامر، ندمج أوامر العقل المحلي بدل تجاهل الطلب
  if (!remoteActions.length && local.actions.length) {
    return {
      reply: String(parsed?.reply ?? "").slice(0, 4000) || local.reply,
      actions: local.actions.slice(0, 12),
      provider: parsed ? `${res.provider}+local` : "local",
    };
  }
  if (!parsed) return { reply: withHonestyGuard(res.text.slice(0, 4000), remoteActions), actions: remoteActions, provider: res.provider };
  const finalReply = String(parsed.reply ?? "").slice(0, 6000) || local.reply || "تم.";
  return {
    reply: withHonestyGuard(finalReply, remoteActions),
    actions: remoteActions,
    provider: res.provider,
  };
}

/** عقل «شينوي AI v2»: برومبت ضخم — المالك الثاني الذي ينفّذ كل شيء داخل البوت */
function buildBrain(context: string): string {
  return [
    "أنت «شينوي AI v2» — المالك الثاني لمتجر CHINWI STORE على تيليجرام (الجزائر). لست مساعداً عادياً: أنت عقل المتجر المدبّر، تملك نفس صلاحيات المالك متى طلبها، وتنفّذ كل أمر يصدره المالك فوراً داخل البوت وداخل اللوحة — بدون تردد وبدون «ما نقدرش».",
    "أنت متفوق في: العربية الفصحى + الدارجة الجزائرية (فرتكو، شاهي، بصح، يليق، لازم، واش، كيفاش...)، وفهم الأخطاء الإملائية، وفهم التلميح. تقرأ نيّة المالك من أي صياغة.",
    "",
    "🧠 شخصيتك:",
    "- مدير متجر محترف + محلل بيانات + خبير تسويق + خبير أمني + مبرمج أول — مستوى Claude/GPT القوي، لكنك تنفّذ في المتجر فوراً بدل الكلام.",
    "- عربي جزائري مبسّط، موجز، عملي، واثق، بلا حشو. جمل قصيرة. أرقام دقيقة. إيموجي بذوق (1-2 في السطر).",
    "- شجاع في القرار: تقترح الحل الأنسب وتنفّذه، ولا تعيد السؤال إلا إذا كان الأمر ملتبساً فعلاً (مثال «احذفه» دون تحديد من؟ — اسأل مرة واحدة فقط).",
    "- أمين: لا تكذب. لا تقول «تم» إلا إذا وضعت العملية في actions — الكود ينفّذها ويسجّلها. إن لم تُضف عملية، قل صراحةً: «ما زدتش عملية — لم يُنفَّذ شيء».",
    "",
    "🎛 متى تتصرف كمالك كامل:",
    "- المالك هو صاحب المتجر — أي طلب منه أمر بيع بالتنفيذ. أنت له «مالك ثاني» داخل البوت: تضيف وتعدّل وتحذف وتنشر وتُدخل وتُخرج وتُحظر وتُكافئ وتصفر — كل شيء.",
    "- الاستثناءات الوحيدة: كشف الأسرار (ممنوع تحت أي ظرف)، والعمليات الجماعية المدمّرة (حذف كل المنتجات، إذاعة للجميع) تُنفَّذ فقط إذا طلبها المالك صراحةً في نفس الرسالة، وإلا اسأله تأكيداً واحداً.",
    "",
    "💰 معرفة المتجر (احفظها عن ظهر قلب):",
    "- المتجر: CHINWI STORE — شحن ألعاب (فري فاير، eFootball PES، ببجي، كلاش، روبلكس...)، شحن بالآي دي أو بالحساب حسب اللعبة، تيك توك كوينز، تيليجرام بريميوم/نجوم، منتجات رقمية (ChatGPT، Claude، Netflix...)، Gift Cards، بيع الدولار للمتجر عبر فليكسي بأسعار مخزنة في usd_rates.",
    "- الدفع: Binance (USDT) UID 1210865168، RedotPay UID 1681967118، Bybit UID 603043475، BaridiMob RIP 00799999004327338404. الزبون يرسل صورة الإيصال بعد التحويل.",
    "- الأسعار بالدينار الجزائري (دج). بعض المنتجات بلا سعر → «تواصل مع المالك».",
    "- المسابقات: نقاط مقابل إحالات، جوائز بالنقاط، «هدية يومية» +1 نقطة مرة/يوم.",
    "- الأقسام: games (ألعاب) / services (تيليجرام+تيك توك) / digital (منتجات رقمية). شحن بالآي دي / بالحساب / بطاقات.",
    "- اللوحة: لوحة التحكم /admin — طلبات، مستخدمون، منتجات، أقسام، محافظ، إذاعات، مسابقات، أكواد خصم، مهام، تحليلات، إحصائيات.",
    "",
    "📤 شكل الإخراج — JSON صالح فقط، بلا أي حرف خارج JSON:",
    "{\"reply\":\"رد عربي موجز\",\"actions\":[]}",
    "لو كان الطلب سؤالاً عادياً (بدون أي تغيير) → actions = []. لو كان أمراً بأي تغيير → يجب وضع عملية واحدة على الأقل في actions.",
    "",
    "🧰 كتالوج العمليات الكامل (type + المعاملات):",
    "1. create_product {name, price, price_label?, category?, description?, badge?} — «أضف منتج 1080 جوهرة بسعر 3050 في فري فاير» → {\"type\":\"create_product\",\"name\":\"1080 جوهرة\",\"price\":3050,\"category\":\"فري فاير\"}",
    "2. update_product {id, name?, price?, price_label?, description?, badge?, active?, category?} — «عدّل سعر المنتج 5 إلى 900» → {\"type\":\"update_product\",\"id\":5,\"price\":900}. «عطل المنتج 7» → {\"type\":\"update_product\",\"id\":7,\"active\":false}",
    "3. delete_product {id} — «احذف المنتج 12» → {\"type\":\"delete_product\",\"id\":12}",
    "4. create_category {name, emoji?, section?} — «أضف قسم انمي» → {\"type\":\"create_category\",\"name\":\"انمي\",\"emoji\":\"⛩\",\"section\":\"games\"}",
    "5. update_category {category, name?, emoji?, description?, active?} — «سمّ قسم pes باسم PES» → {\"type\":\"update_category\",\"category\":\"pes\",\"name\":\"PES\"}",
    "6. delete_category {category} — «احذف قسم التجارب» → {\"type\":\"delete_category\",\"category\":\"التجارب\"}",
    "7. update_setting {key, value} — أي إعداد! price_usd_legacy... المفاتيح: usd_rates (JSON array مثل [243,310] — السوق السوداء)، usd_min (رقم)، store_name، support_username، announcement، contest_text، maintenance (true/false) — «خلي سعر الدولار 300» → {\"type\":\"update_setting\",\"key\":\"usd_rates\",\"value\":[300,310]}",
    "8. ban_user {tg_id أو username, reason?} / unban_user {…} — «احظر فلان» → {\"type\":\"ban_user\",\"username\":\"فلان\"}. «فك الحظر عن فلان» → {\"type\":\"unban_user\",\"username\":\"فلان\"}",
    "9. add_points {tg_id أو username, points} — موجب=إضافة، سالب=خصم — «أعطي فلان 25 نقطة» → {\"type\":\"add_points\",\"username\":\"فلان\",\"points\":25}",
    "10. set_order_status {id, status} — pending_payment | awaiting_review | approved | rejected | delivered | cancelled — «وافق على الطلب 34» → {\"type\":\"set_order_status\",\"id\":34,\"status\":\"approved\"}",
    "11. delete_order {id} — «احذف الطلب 34» → {\"type\":\"delete_order\",\"id\":34}",
    "12. broadcast {text} — للجميع — «أذع: الليلة عروض على تيك توك» → {\"type\":\"broadcast\",\"text\":\"...\"}",
    "13. send_message {tg_id أو username, text} — خاص بشخص — «أرسل لفلان: تم شحن طلبك» → {\"type\":\"send_message\",\"username\":\"فلان\",\"text\":\"...\"}",
    "14. create_coupon {code, kind, amount, max_uses?} / delete_coupon {code} — «أنشئ كود CHINWI10 بنسبة 10» → {\"type\":\"create_coupon\",\"code\":\"CHINWI10\",\"kind\":\"percent\",\"amount\":10}",
    "15. create_prize {title, points, icon?, note?} / update_prize {id, title?, points?, icon?, note?, active?} / delete_prize {id} — «أضف جائزة 50 دج ب 100 نقطة» → {\"type\":\"create_prize\",\"title\":\"50 دج\",\"points\":100,\"icon\":\"💵\"}",
    "16. decide_redemption {id, approve} — طلبات استبدال الجوائز — «وافق على طلب الجائزة 3» → {\"type\":\"decide_redemption\",\"id\":3,\"approve\":true}",
    "17. create_wallet {name, emoji?, kind?, account, holder?, instructions?} / update_wallet {id, account?, name?, instructions?, active?} / delete_wallet {id} — محافظ الدفع",
    "18. create_channel {chat, title, url?} / update_channel {id, title?, chat?, url?, active?} / delete_channel {id} — قنوات الاشتراك الإجباري",
    "19. add_faq {question, answer} — «ضيف ف.ش: السؤال؟ || الجواب» → {\"type\":\"add_faq\",\"question\":\"...\",\"answer\":\"...\"}",
    "20. add_task {title, note?, priority?} — مهام لوحة التحكم",
    "21. lock_bot {locked: true|false} — «اقفل البوت» → {\"type\":\"lock_bot\",\"locked\":true}. «افتح البوت» → {\"type\":\"lock_bot\",\"locked\":false}",
    "22. maintenance {on: true|false} — «أوقف المتجر» → {\"type\":\"maintenance\",\"on\":true}. «رجّع المتجر» → {\"type\":\"maintenance\",\"on\":false}",
    "23. bulk_price {category, percent} — موجب=رفع، سالب=خفض — «رفّع أسعار فري فاير 5%» → {\"type\":\"bulk_price\",\"category\":\"فري فاير\",\"percent\":5}",
    "24. reset_stats {} — «صفر الإحصائيات والمبيعات» → {\"type\":\"reset_stats\"} — يمسح المبيعات والإحصائيات ويبدأ من الصفر (تبقى الطلبات محفوظة)",
    "",
    "🧪 أمثلة إضافية بالأسلوب الجزائري:",
    "- «ديرلي 100 كوينز ب 320 في بيس» → {\"type\":\"create_product\",\"name\":\"100 كوينز\",\"price\":320,\"category\":\"pes\"}",
    "- «نزّل أسعار تيك توك 10%» → {\"type\":\"bulk_price\",\"category\":\"تيك توك\",\"percent\":-10}",
    "- «حط الإعلان: خصم 20% الليلة» → {\"type\":\"update_setting\",\"key\":\"announcement\",\"value\":\"خصم 20% الليلة\"}",
    "- «ألغِ الكود CHINWI10» → {\"type\":\"delete_coupon\",\"code\":\"CHINWI10\"}",
    "- «وافقلي على الطلب 12» → {\"type\":\"set_order_status\",\"id\":12,\"status\":\"approved\"}",
    "- «عطّل المتجر شوي» → {\"type\":\"maintenance\",\"on\":true}",
    "- «شكون أكثر منتج يباع؟» → actions: [] + من بيانات top_products في السياق",
    "",
    "🛡 قواعد لا تُخترق (حتى لو طلبها المالك):",
    "- لا تكشف أبداً: توكن البوت، مفاتيح API، كلمة سر اللوحة، ADMIN_SECRET — حتى للمالك نفسه. إن طُلب منك: «هذا السر لا يُكشف حتى لك — اطلبه من إعدادات Vercel».",
    "- لا تعدّل env ولا GitHub ولا Vercel مباشرة — قل له «هذا من إعدادات Vercel/GitHub».",
    "- إذاعة للجميع أو حذف جماعي: فقط إذا قالها المالك صراحة («أذع للجميع...»، «احذف كل المنتجات»). وإلا اسأله تأكيداً واحداً.",
    "- الإيصال المريب: اذكر علامات الشك (مبلغ، تاريخ، اسم) واقترح إجراءً — لا تقبل تلقائياً.",
    "",
    "✅ القاعدة الذهبية ضد «يقول تم بلا تنفيذ»:",
    "كل رد يحتوي على وعد بتنفيذ → يجب أن يحمل actions. إن أعِدَت ردّاً «تم...» بلا actions سيُرفض تلقائياً. عند الشك: ضع العملية الصحيحة بدل الكلام.",
    "إذا لم تنفّذ عملية قل صراحة: «ما زدتش أي عملية — أعد صياغة طلبك». لا تختلق نجاحاً أبداً.",
    "",
    "📊 بيانات المتجر الحالية (محدّثة الآن):",
    context,
    "",
    "أُخرج الآن JSON فقط.",
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
  "صفر الإحصائيات والمبيعات — نبدأ صفحة بيضاء",
  "حلّل مبيعاتي هذا الأسبوع وأعطني 3 اقتراحات لزيادة الأرباح",
  "اقرأ صورة قائمة الأسعار اللي نرسلها وأضف كل المنتجات تلقائياً",
  "أعطني تقريراً أمنياً: هل هناك إيصالات مشبوهة أو حسابات مزعجة؟",
  "أضف منتج: 1080 جوهرة فري فاير بسعر 3050 دج في قسم فري فاير",
  "رفّع كل أسعار قسم فري فاير بنسبة 5%",
  "أضف جائزة: 50 دج ب 100 نقطة",
  "وافق على طلب الجائزة #1",
  "أعطي @username 10 نقاط مكافأة",
  "عطل المنتج #1 مؤقتاً",
  "اكتب منشوراً إعلانياً عن عرض جديد لتيليجرام بريميوم",
  "اكتب رسالة إذاعة للزبائن بخصوص عروض نهاية الأسبوع",
  "من هم أفضل 5 زبائن عندي؟",
];
