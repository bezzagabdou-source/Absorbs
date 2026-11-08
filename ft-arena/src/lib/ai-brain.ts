/**
 * 🧠 مسابقات MX Brain — محرّك الأوامر الذكي (مستقل عن HTTP ليكون قابلًا للاختبار وإعادة الاستخدام).
 *  1) محرّكات LLM متعددة (تُستخدم إن توفّر أي مفتاح في البيئة).
 *  2) محرّك فهم عربي مدمج يعمل بدون أي مفتاح.
 *  3) منفّذ عمليات آمن على وثيقة البوت.
 */
import { env } from "./env";
import { addPoints, displayName } from "./bot-utils";
import { sendMessage } from "./tg";
import type { DB, Reward, Task, User } from "./types";

export type Action = { name: string; args: Record<string, unknown> };
export type Plan = { reply: string; actions: Action[]; provider: string };
export type ActionResult = { name: string; ok: boolean; detail?: string };

const safeDetail = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 300);



const SYSTEM = `أنت "مسابقات MX Brain" — مساعد تحكم ذكي لبوت تيليجرام للمسابقات والنقاط.
مهمتك: ترجمة طلب الأدمن (بالعربية أو الفرنسية أو الإنجليزية) إلى JSON فقط لتنفيذ عمليات على البوت.
أعد دائمًا JSON صالحًا فقط بهذا الشكل:
{"reply":"رسالة قصيرة للمدير بالعربية","actions":[{"name":"...","args":{...}}]}
العمليات المتاحة:
set_points {points:{"dailyMin":1,"dailyMax":3,"refJoin":3,"refActive":2,"wheelCooldownHours":12,"streakBonus":1}}
set_texts {texts:{"startBody":"...","rules":"...","support":"...","shareText":"..."}}
set_bot {botName?, brandEmoji?, maintenance?:boolean, botEnabled?:boolean}
set_feature {feature:"daily|wheel|leaderboard|referrals|tasks|shop|contests", enabled:boolean}
set_force_join {enabled:boolean, username:"@..." , title?:"..."}
add_reward {title, cost, desc?, emoji?, delivery?, stock?}
edit_reward {title, cost?, desc?, active?}
delete_reward {title}
add_task {title, points, type:"channel|link|custom", target?, repeat:"once|daily", emoji?}
delete_task {title}
add_points {user:"@username أو id", amount:number}
broadcast {text, buttonLabel?, buttonUrl?}
add_contest {title, desc, prize, winnersCount, days}
set_points_for {query, amount} , ban_user {query}, vip_user {query}
لا تخترع عمليات غير موجودة. إن كان الطلب غير واضح استخدم reply للتوضيح ولا تُرجع actions.`;

/* ─────────────────────────── محرّك الفهم العربي المدمج ─────────────────────────── */

const AR_DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
const norm = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => AR_DIGITS[d] ?? d)
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .toLowerCase();

function numbersIn(text: string): number[] {
  return (norm(text).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

export function localPlan(prompt: string): Plan {
  const p = norm(prompt);
  const nums = numbersIn(prompt);
  const actions: Action[] = [];
  const reply: string[] = [];

  const findReward = (name: string) => name;

  if (/(صيانه|maintenance|ايقاف مؤقت)/.test(p)) {
    const off = /(اطفي|اطفئ|اوقف|الغ|الغي|ابطال|ايقاف الصيانه|off|disable|انهي|اقفلت)/.test(p);
    const on = /(شغل|فعل|فعلي|تشغيل|بدا|on|enable)/.test(p) && !off;
    if (off || on) {
      actions.push({ name: "set_bot", args: { maintenance: on } });
      reply.push(on ? "تم تشغيل وضع الصيانة." : "تم إلغاء الصيانة.");
    }
  }
  if (/(هديه يوميه|الهديه اليوميه|daily)/.test(p)) {
    if (nums.length >= 2) {
      actions.push({ name: "set_points", args: { points: { dailyMin: nums[0], dailyMax: nums[1] } } });
      reply.push(`تم جعل الهدية اليومية من ${nums[0]} إلى ${nums[1]} نقطة.`);
    } else if (nums.length === 1) {
      actions.push({ name: "set_points", args: { points: { dailyMin: nums[0], dailyMax: nums[0] } } });
      reply.push(`تم جعل الهدية اليومية ${nums[0]} نقطة ثابتة.`);
    }
  }
  if (/(احاله|إحاله|referral|دعوه|دعوة)/.test(p) && nums.length && /(نقطه|نقاط|point)/.test(p)) {
    actions.push({ name: "set_points", args: { points: { refJoin: nums[0] } } });
    reply.push(`مكافأة الإحالة عند الدخول: ${nums[0]} نقطة.`);
  }
  if (/(عجله|wheel)/.test(p) && nums.length && /(ساعه|ساعات|hour|ساع)/.test(p)) {
    actions.push({ name: "set_points", args: { points: { wheelCooldownHours: nums[0] } } });
    reply.push(`تبريد العجلة: ${nums[0]} ساعة.`);
  }
  if (/(اسم البوت|bot name|غير الاسم)/.test(p)) {
    const m = prompt.match(/(?:اسم البوت|bot name|غير الاسم)\s*(?:الى|إلى|:)?\s*(.+)/i);
    if (m) {
      actions.push({ name: "set_bot", args: { botName: m[1].trim().slice(0, 40) } });
      reply.push(`تم تغيير اسم البوت إلى: ${m[1].trim().slice(0, 40)}`);
    }
  }
  if (/(اضف جائزه|أضف جائزة|add reward|جائزه جديده|جائزة جديدة)/.test(p)) {
    const titleMatch = prompt.match(/(?:جائزه|جائزة|reward)\s+(.+?)(?:\s+(?:ب|بسعر|سعر|price|cost)\s*|$)/i);
    const title = titleMatch?.[1]?.trim().slice(0, 40) || "جائزة جديدة";
    const cost = nums[0] ?? 20;
    actions.push({ name: "add_reward", args: { title, cost, desc: `جائزة ${title}`, delivery: "يُسلّم بعد الموافقة." } });
    reply.push(`أضفت الجائزة «${title}» بسعر ${cost} نقطة.`);
  }
  if (/(خصم|نقص|خصم نقاط|remove points)/.test(p) && nums.length) {
    const who = prompt.match(/@[a-zA-Z0-9_]{3,32}/)?.[0] || prompt.match(/\b\d{6,}\b/)?.[0];
    if (who) {
      actions.push({ name: "add_points", args: { user: who, amount: -Math.abs(nums[0]) } });
      reply.push(`خصمت ${Math.abs(nums[0])} نقطة من ${who}.`);
    }
  } else if (/(اعطي|أعطي|اضف نقاط|أضف نقاط|add points)/.test(p) && nums.length) {
    const who = prompt.match(/@[a-zA-Z0-9_]{3,32}/)?.[0] || prompt.match(/\b\d{6,}\b/)?.[0];
    if (who) {
      actions.push({ name: "add_points", args: { user: who, amount: Math.abs(nums[0]) } });
      reply.push(`أضفت ${Math.abs(nums[0])} نقطة إلى ${who}.`);
    }
  }
  if (/(بث|اذاعه|إذاعة|broadcast|ارسل للجميع|أرسل للجميع)/.test(p)) {
    const m = prompt.match(/(?:بث|اذاعه|إذاعة|broadcast|ارسل للجميع|أرسل للجميع)\s*:?\s*(.+)/i);
    if (m) {
      actions.push({ name: "broadcast", args: { text: m[1].trim() } });
      reply.push("أرسلت البث لكل الأعضاء.");
    }
  }
  if (/(اضف مهمه|أضف مهمة|add task)/.test(p)) {
    const m = prompt.match(/(?:مهمه|مهمة|task)\s+(.+)/i);
    const title = m?.[1]?.trim().slice(0, 60) || "مهمة جديدة";
    actions.push({ name: "add_task", args: { title, points: nums[0] ?? 1, type: "custom", repeat: "once" } });
    reply.push(`أضفت المهمة «${title}».`);
  }
  if (/(قوانين|قانون|rules)/.test(p) && prompt.length > 25) {
    const m = prompt.match(/(?:قوانين|قانون|rules)\s*:?\s*([\s\S]+)/i);
    if (m) {
      actions.push({ name: "set_texts", args: { texts: { rules: m[1].trim().slice(0, 1500) } } });
      reply.push("حدّثت نصوص القوانين.");
    }
  }
  if (/(اشتراك اجباري|force join|قناه الاشتراك|قناه الاشتراك الاجباري)/.test(p) && /@[a-zA-Z0-9_]{3,32}/.test(prompt)) {
    const u = prompt.match(/@[a-zA-Z0-9_]{3,32}/)![0];
    actions.push({ name: "set_force_join", args: { enabled: true, username: u } });
    reply.push(`قناة الاشتراك الإجباري: ${u}`);
  }

  // أي طلب يحتوي «قناة @...» + كلمة اشتراك
  if (
    !actions.some((a) => a.name === "set_force_join") &&
    /(اشتراك اجباري|قناه الاشتراك|قناة الاشتراك|force.?join|اجعل.*قناه|خلي.*قناه)/.test(p) &&
    /@[a-zA-Z0-9_]{3,32}/.test(prompt)
  ) {
    const u = prompt.match(/@[a-zA-Z0-9_]{3,32}/)![0];
    actions.push({ name: "set_force_join", args: { enabled: true, username: u } });
    reply.push(`قناة الاشتراك الإجباري: ${u}`);
  }

  /* ───────────── مُفسِّر عام أوسع: يغطّي صيغًا كثيرة بالعربية والفرنسية ───────────── */

  // أسماء للتوجيه بالعامية (نقّص/زيد/بدّل/خلي/سوّي…)
  const wantsChange = /(غير|غيّر|بدل|بدّل|خلي|خلّي|سوي|سوّي|اجعل|عدل|عدّل|نقص|زيد|ارفع|خفض|اضبط|ظبط|حول|حول|rend|change|set|make|update)/.test(p);

  // المهام: «أضف مهمة ... مقابل N نقطة»
  if (!actions.some((a) => a.name === "add_task") && /(مهمه|مهمة|task)/.test(p) && wantsChange) {
    const m = prompt.match(/(?:مهمه|مهمة|task)\s*:?\s*([\s\S]+?)(?:\s+(?:مقابل|ب|بـ|بسعر|سعر|=)\s*\d|$)/i);
    const title = (m?.[1] ?? "").trim().replace(/[.،,]$/, "").slice(0, 80);
    if (title.length > 2) {
      const isChannel = /@[a-zA-Z0-9_]{3,32}/.test(title);
      const handle = title.match(/@[a-zA-Z0-9_]{3,32}/)?.[0] ?? "";
      actions.push({
        name: "add_task",
        args: {
          title: isChannel ? `اشترك في قناة ${handle}` : title,
          points: nums[0] ?? 2,
          type: isChannel ? "channel" : "custom",
          target: handle.replace(/^@/, ""),
          repeat: /(يومي|كل يوم|daily)/.test(p) ? "daily" : "once",
        },
      });
      reply.push(`أضفت المهمة «${isChannel ? `اشترك في ${handle}` : title}» مقابل ${nums[0] ?? 2} نقطة.`);
    }
  }

  // الحذف (جائزة/مهمة)
  if (!actions.some((a) => a.name.startsWith("delete_"))) {
    if (/(احذف|امسح|الغي|شيل|delete|remove)/.test(p) && /(جائزه|جائزة|reward)/.test(p)) {
      const name = prompt.split(/(?:جائزه|جائزة|reward)/i).pop()?.replace(/^[:\s]+/, "").trim() ?? "";
      if (name.length > 1) {
        actions.push({ name: "delete_reward", args: { title: name } });
        reply.push(`حذفت الجائزة «${name}».`);
      }
    }
    if (/(احذف|امسح|الغي|شيل|delete|remove)/.test(p) && /(مهمه|مهمة|task)/.test(p)) {
      const name = prompt.split(/(?:مهمه|مهمة|task)/i).pop()?.replace(/^[:\s]+/, "").trim() ?? "";
      if (name.length > 1) {
        actions.push({ name: "delete_task", args: { title: name } });
        reply.push(`حذفت المهمة «${name}».`);
      }
    }
  }

  // تعديل سعر جائزة موجودة
  if (!actions.some((a) => a.name === "edit_reward") && /(سعر|ثمن|نقطه|نقاط|price|cost)/.test(p) && nums.length) {
    const known = ["netflix", "google play", "coinbase", "بيس", "نتفليكس", "جوجل", "بوت"];
    const hit = known.find((k) => p.includes(k));
    if (hit && /(غير|غيّر|عدل|عدّل|خلي|خلّي|بدل|بدّل|اجعل|خفض|ارفع)/.test(p)) {
      actions.push({ name: "edit_reward", args: { title: hit, cost: nums[0] } });
      reply.push(`جعلت سعر «${hit}» = ${nums[0]} نقطة.`);
    }
  }

  // تشغيل/إيقاف ميزة
  if (!actions.some((a) => a.name === "set_feature")) {
    const feats: [RegExp, string, string][] = [
      [/(هديه|هدية|daily)/, "daily", "الهدية اليومية"],
      [/(عجله|عجلة|wheel)/, "wheel", "عجلة الحظ"],
      [/(متصدر|ترتيب|leaderboard)/, "leaderboard", "المتصدرون"],
      [/(احال|إحال|referral)/, "referrals", "الإحالات"],
      [/(مهم|مهام|task)/, "tasks", "المهام"],
      [/(متجر|shop)/, "shop", "المتجر"],
      [/(مسابق|contest)/, "contests", "المسابقات"],
    ];
    if (/(اطفي|اطفئ|اوقف|ايقاف|عطل|الغ|disable|off)/.test(p)) {
      const f = feats.find(([re]) => re.test(p));
      if (f) {
        actions.push({ name: "set_feature", args: { feature: f[1], enabled: false } });
        reply.push(`أوقفت ${f[2]}.`);
      }
    } else if (/(شغل|شغّل|فعّل|فعل|تشغيل|enable|turn on)/.test(p)) {
      const f = feats.find(([re]) => re.test(p));
      if (f) {
        actions.push({ name: "set_feature", args: { feature: f[1], enabled: true } });
        reply.push(`شغّلت ${f[2]}.`);
      }
    }
  }

  // حظر / VIP / منح نقاط بأي صيغة
  if (!actions.some((a) => ["ban_user", "vip_user", "set_points_for", "add_points"].includes(a.name))) {
    const who = prompt.match(/@[a-zA-Z0-9_]{3,32}/)?.[0] || prompt.match(/\b\d{6,}\b/)?.[0];
    if (who) {
      if (/(احظر|حظر|ban)/.test(p)) {
        actions.push({ name: "ban_user", args: { query: who } });
        reply.push(`حظرت ${who}.`);
      } else if (/(vip|في اي بي|مميز)/.test(p)) {
        actions.push({ name: "vip_user", args: { query: who } });
        reply.push(`رقّيت ${who} إلى VIP.`);
      } else if (nums.length && /(نقط|point)/.test(p)) {
        actions.push({ name: "set_points_for", args: { query: who, amount: nums[0] } });
        reply.push(`جعلت رصيد ${who} = ${nums[0]} نقطة.`);
      }
    }
  }

  // مسابقة سريعة
  const contestIntent =
    /(انشئ|أنشئ|اعمل|سوي|سوّي|اضف|أضف|جهز|جهّز|new|create|add)/.test(p) && /(مسابق|contest|tournament)/.test(p);
  if (!actions.some((a) => a.name === "add_contest") && contestIntent) {
    const title = prompt.replace(/^[^:]*[:：]\s*/, "").slice(0, 60) || "مسابقة MX";
    const days = /(يوم|day)/.test(p) ? (nums.find((n) => n > 0 && n <= 60) ?? 7) : 7;
    actions.push({
      name: "add_contest",
      args: { title, desc: title, prize: nums[0] ?? 50, winnersCount: 1, days },
    });
    reply.push(`أنشأت مسابقة «${title}» بجائزة ${nums[0] ?? 50} نقطة لمدة ${days} يوم.`);
  }

  // نص الترحيب / الدعم / المشاركة
  if (!actions.some((a) => a.name === "set_texts")) {
    const rulesM = prompt.match(/(?:ترحيب|رساله الترحيب|welcome)\s*:?\s*([\s\S]{6,})/i);
    if (rulesM) {
      actions.push({ name: "set_texts", args: { texts: { startBody: rulesM[1].trim().slice(0, 1200) } } });
      reply.push("حدّثت رسالة الترحيب.");
    }
    const supM = prompt.match(/(?:دعم|support)\s*:?\s*([\s\S]{4,})/i);
    if (supM) {
      actions.push({ name: "set_texts", args: { texts: { support: supM[1].trim().slice(0, 800) } } });
      reply.push("حدّثت نص الدعم.");
    }
  }

  // اسم البوت بصيغ أخرى
  if (!actions.some((a) => a.name === "set_bot" && "botName" in (a.args as object))) {
    const m =
      prompt.match(/(?:اسم البوت|bot name)\s*(?:الى|إلى|:|=)?\s*([^\n]{2,40})/i) ||
      prompt.match(/(?:سمّ?ي البوت|خلي اسمه|غير الاسم)\s*([^\n]{2,40})/i);
    if (m) {
      const name = m[1].trim().slice(0, 40);
      actions.push({ name: "set_bot", args: { botName: name } });
      reply.push(`اسم البوت أصبح: ${name}`);
    }
  }

  const text =
    reply.length > 0
      ? reply.join("\n")
      : "فهمت طلبك لكن لم أجد عملية مطابقة. جرّب مثلًا: «الهدية اليومية من 2 إلى 4 نقاط» أو «أضف جائزة PlayStation بسعر 40» أو «بث: مسابقة جديدة غدًا».";
  return { reply: text, actions, provider: "builtin-ar" };
}

/* ─────────────────────────── محرّكات LLM ─────────────────────────── */

async function callGemini(_p: string, _s: string, keyIn?: string, modelIn?: string): Promise<string | null> {
  const key = (keyIn || (process.env.GEMINI_API_KEY ?? "")).trim();
  if (!key) return null;
  const model = (modelIn || process.env.AI_MODEL || "gemini-2.5-flash").trim();
  const prompt = CTX.prompt, sys = CTX.sys;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1400, responseMimeType: "application/json" },
      }),
      cache: "no-store",
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? null;
}

async function callOpenAICompat(
  url: string,
  key: string,
  model: string,
  _p: string,
  _s: string,
  extraHeaders: Record<string, string> = {}
): Promise<string | null> {
  if (!key) return null;
  const prompt = CTX.prompt, sys = CTX.sys;
  const body = (jsonMode: boolean) =>
    JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1400,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
    });

  let res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...extraHeaders },
    body: body(true),
    cache: "no-store",
  });

  // بعض الموديلات (مثل gpt-oss) ترفض وضع JSON الصارم — نعيد المحاولة بدونه
  if (!res.ok) {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...extraHeaders },
      body: body(false),
      cache: "no-store",
    });
  }
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? null;
}

async function callClaude(_p: string, _s: string, keyIn?: string): Promise<string | null> {
  const key = (keyIn || (process.env.ANTHROPIC_API_KEY ?? "")).trim();
  if (!key) return null;
  const prompt = CTX.prompt, sys = CTX.sys;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: (process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5").trim(),
      max_tokens: 1400,
      system: sys,
      messages: [{ role: "user", content: prompt }],
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: { text?: string }[] };
  return data.content?.map((c) => c.text ?? "").join("") ?? null;
}

/** مُهلة قصيرة لكل مزوّد: نريد أسرع رد لا أبطأ انتظار */
const AI_TIMEOUT = Number(process.env.AI_TIMEOUT_MS ?? 9000);

async function withTimeout<T>(p: Promise<T>, ms = AI_TIMEOUT): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error("ai_timeout")), ms);
  });
  try {
    return await Promise.race([p, guard]);
  } finally {
    clearTimeout(timer!);
  }
}

/** يقرأ المفتاح من اللوحة أولًا ثم من البيئة — حتى يعمل بلا إعادة نشر */
function providerList(db: DB): { name: string; label: string; run: () => Promise<string | null> }[] {
  const savedKey = (db.settings.ai?.apiKey ?? "").trim();
  const savedBase = (db.settings.ai?.apiBase ?? "").trim().replace(/\/$/, "");
  const forced = (db.settings.ai?.provider ?? "auto").trim();
  const savedModel = (db.settings.ai?.model ?? "").trim();

  const env = (k: string) => (process.env[k] ?? "").trim();

  const list: { name: string; label: string; run: () => Promise<string | null> }[] = [];

  // مزوّد متوافق مع OpenAI يُضبط يدويًا من اللوحة (يعمل فورًا)
  if (savedKey && savedBase) {
    list.push({
      name: "custom",
      label: "مخصّص",
      run: () =>
        callOpenAICompat(
          `${savedBase}/chat/completions`,
          savedKey,
          savedModel || "gpt-4o-mini",
          "",
          ""
        ),
    });
  }

  // ⚡️ الترتيب مقصود: Groq أولًا (أسرع استجابة فعلية)، ثم Cerebras، ثم البقية
  const compat: { name: string; url: string; key: string; model: string }[] = [
    { name: "cerebras", url: "https://api.cerebras.ai/v1/chat/completions", key: env("CEREBRAS_API_KEY"), model: env("CEREBRAS_MODEL") || "gpt-oss-120b" },
    { name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", key: env("OPENROUTER_API_KEY"), model: env("OPENROUTER_MODEL") || "google/gemini-2.0-flash-001" },
    { name: "deepseek", url: "https://api.deepseek.com/chat/completions", key: env("DEEPSEEK_API_KEY"), model: env("DEEPSEEK_MODEL") || "deepseek-chat" },
    { name: "xai", url: "https://api.x.ai/v1/chat/completions", key: env("XAI_API_KEY") || env("GROK_API_KEY"), model: env("XAI_MODEL") || "grok-4-fast" },
    { name: "openai", url: "https://api.openai.com/v1/chat/completions", key: env("OPENAI_API_KEY"), model: env("OPENAI_MODEL") || "gpt-4o-mini" },
  ];
  for (const c of compat) {
    if (!c.key) continue;
    list.push({ name: c.name, label: c.name, run: () => callOpenAICompat(c.url, c.key, c.model, "", "") });
  }

  // ⚡️ Groq: سلسلة موديلات احتياطية — أيّها متاح لحسابك يعمل
  const groqKey = env("GROQ_API_KEY");
  if (groqKey) {
    // qwen أسرع وأثبت مع JSON؛ gpt-oss-120b أقوى لكنه يفشل أحيانًا في وضع JSON الصارم
    const chain = [
      savedModel,
      env("GROQ_MODEL"),
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "allam-2-7b",
    ].filter(Boolean) as string[];
    const uniq = Array.from(new Set(chain));
    list.push({
      name: "groq",
      label: "Groq",
      run: async () => {
        for (const m of uniq) {
          const out = await callOpenAICompat("https://api.groq.com/openai/v1/chat/completions", groqKey, m, "", "");
          if (out) return out;
        }
        return null;
      },
    });
  }

  const claudeKey = env("ANTHROPIC_API_KEY");
  if (claudeKey) list.push({ name: "claude", label: "Claude", run: () => callClaude("", "", claudeKey) });

  // Gemini احتياطًا في آخر القائمة (بطيء أحيانًا) — أو إن كان المفتاح المحفوظ لـ Gemini
  const gKey = savedKey && !savedBase ? savedKey : env("GEMINI_API_KEY");
  if (gKey) {
    list.push({ name: "gemini", label: "Gemini", run: () => callGemini("", "", gKey, savedModel || undefined) });
  }

  // احترام اختيار المزوّد من اللوحة إن حُدّد
  const only = forced && forced !== "auto" ? list.filter((x) => x.name === forced) : list;
  return only.length ? only : list;
}

/**
 * ⚡️ تسابق المزوّدين بالتوازي: أول رد صالح يفوز — أسرع بكثير من الانتظار التسلسلي.
 * الكل يتلقى نفس التعليمات والطلب.
 */
async function askLLM(db: DB, prompt: string): Promise<Plan | null> {
  const list = providerList(db);
  if (!list.length) return null;

  const attempts = list.slice(0, 4).map(async (c) => {
    const raw = await withTimeout(c.run === undefined ? Promise.resolve(null) : runProvider(c, prompt));
    return { name: c.name, plan: parsePlan(raw) };
  });

  // أول خطة صالحة تفوز
  return await new Promise<Plan | null>((resolve) => {
    let done = false;
    let pending = attempts.length;
    for (const a of attempts) {
      a.then((r) => {
        pending -= 1;
        if (done) return;
        if (r.plan) {
          done = true;
          resolve({ ...r.plan, provider: r.name });
          return;
        }
        if (pending === 0) resolve(null);
      }).catch(() => {
        pending -= 1;
        if (pending === 0 && !done) resolve(null);
      });
    }
  });
}

/** ينفّذ مزوّدًا واحدًا — التعليمات والطلب يُمرّران عبر متغيّر مؤقت لتفادي التكرار */
let CTX: { prompt: string; sys: string } = { prompt: "", sys: "" };
async function runProvider(
  c: { name: string; run: () => Promise<string | null> },
  prompt: string
): Promise<string | null> {
  CTX = { prompt, sys: SYSTEM };
  return c.run();
}

function parsePlan(raw: string | null): Plan | null {
  if (!raw) return null;
  try {
    const from = raw.indexOf("{");
    const to = raw.lastIndexOf("}");
    if (from < 0 || to <= from) return null;
    const parsed = JSON.parse(raw.slice(from, to + 1)) as { reply?: string; actions?: Action[] };
    if (!parsed || typeof parsed !== "object") return null;
    return {
      reply: String(parsed.reply ?? "تم."),
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 12) : [],
      provider: "llm",
    };
  } catch {
    return null;
  }
}

/* ─────────────────────────── تنفيذ العمليات ─────────────────────────── */

function findUserByQuery(db: DB, q: string): User | undefined {
  const s = q.replace(/^@/, "").trim().toLowerCase();
  return Object.values(db.users).find(
    (u) => String(u.id) === s || (u.username ?? "").toLowerCase() === s || displayName(u).toLowerCase().includes(s) || u.refCode === s
  );
}

async function runActionsImpl(db: DB, actions: Action[]): Promise<ActionResult[]> {
  const out: { name: string; ok: boolean; detail?: string }[] = [];
  for (const a of actions) {
    try {
      const args = (a.args ?? {}) as Record<string, unknown>;
      switch (a.name) {
        case "set_points": {
          Object.assign(db.settings.points, args.points ?? {});
          out.push({ name: a.name, ok: true, detail: JSON.stringify(args.points) });
          break;
        }
        case "set_texts": {
          Object.assign(db.settings.texts, args.texts ?? {});
          out.push({ name: a.name, ok: true });
          break;
        }
        case "set_bot": {
          if (typeof args.botName === "string") db.settings.botName = args.botName.slice(0, 40);
          if (typeof args.brandEmoji === "string") db.settings.brandEmoji = args.brandEmoji.slice(0, 4);
          if (typeof args.maintenance === "boolean") db.settings.maintenance = args.maintenance;
          if (typeof args.botEnabled === "boolean") db.settings.botEnabled = args.botEnabled;
          out.push({ name: a.name, ok: true });
          break;
        }
        case "set_feature": {
          const f = String(args.feature ?? "");
          if (f in db.settings.features) {
            (db.settings.features as unknown as Record<string, boolean>)[f] = Boolean(args.enabled);
            out.push({ name: a.name, ok: true, detail: `${f}=${args.enabled}` });
          } else out.push({ name: a.name, ok: false, detail: "feature غير معروف" });
          break;
        }
        case "set_force_join": {
          Object.assign(db.settings.forceJoin, {
            enabled: args.enabled === undefined ? true : Boolean(args.enabled),
            ...(args.username ? { username: String(args.username).replace(/^@/, "") } : {}),
            ...(args.title ? { title: String(args.title) } : {}),
            ...(args.username ? { url: `https://t.me/${String(args.username).replace(/^@/, "")}` } : {}),
          });
          out.push({ name: a.name, ok: true });
          break;
        }
        case "add_reward": {
          const r: Reward = {
            id: `rw_${Math.random().toString(36).slice(2, 9)}`,
            emoji: String(args.emoji ?? "🎁"),
            title: String(args.title ?? "جائزة"),
            desc: String(args.desc ?? ""),
            cost: Math.max(1, Number(args.cost ?? 10)),
            stock: args.stock === undefined || args.stock === null ? null : Number(args.stock),
            active: true,
            delivery: String(args.delivery ?? "يتم التسليم بعد المراجعة."),
            order: db.rewards.length + 1,
          };
          db.rewards.push(r);
          out.push({ name: a.name, ok: true, detail: `${r.title} (${r.cost})` });
          break;
        }
        case "edit_reward": {
          const r =
            db.rewards.find((x) => x.title.includes(String(args.title ?? "")) || x.id === args.title) ??
            db.rewards.find((x) => String(args.title ?? "").toLowerCase().includes(x.title.toLowerCase()));
          if (!r) {
            out.push({ name: a.name, ok: false, detail: "الجائزة غير موجودة" });
            break;
          }
          if (args.cost !== undefined) r.cost = Math.max(1, Number(args.cost));
          if (args.desc !== undefined) r.desc = String(args.desc);
          if (args.active !== undefined) r.active = Boolean(args.active);
          out.push({ name: a.name, ok: true, detail: r.title });
          break;
        }
        case "delete_reward": {
          const before = db.rewards.length;
          db.rewards = db.rewards.filter((x) => !x.title.includes(String(args.title ?? "___")));
          out.push({ name: a.name, ok: db.rewards.length < before });
          break;
        }
        case "add_task": {
          const t: Task = {
            id: `tk_${Math.random().toString(36).slice(2, 9)}`,
            emoji: String(args.emoji ?? "⭐️"),
            title: String(args.title ?? "مهمة"),
            type: (String(args.type ?? "custom") as Task["type"]) ?? "custom",
            target: String(args.target ?? ""),
            points: Math.max(1, Number(args.points ?? 1)),
            active: true,
            repeat: args.repeat === "daily" ? "daily" : "once",
            order: db.tasks.length + 1,
          };
          db.tasks.push(t);
          out.push({ name: a.name, ok: true, detail: t.title });
          break;
        }
        case "delete_task": {
          const before = db.tasks.length;
          db.tasks = db.tasks.filter((x) => !x.title.includes(String(args.title ?? "___")));
          out.push({ name: a.name, ok: db.tasks.length < before });
          break;
        }
        case "add_points": {
          const u = findUserByQuery(db, String(args.user ?? ""));
          if (!u) {
            out.push({ name: a.name, ok: false, detail: "المستخدم غير موجود" });
            break;
          }
          addPoints(db, u.id, Number(args.amount ?? 0), "admin", "أمر من الذكاء الاصطناعي");
          await sendMessage(u.id, `💎 تم تعديل رصيدك من الإدارة: <b>${Number(args.amount ?? 0) > 0 ? "+" : ""}${Number(args.amount ?? 0)}</b> نقطة`);
          out.push({ name: a.name, ok: true, detail: `${displayName(u)} → ${u.points}` });
          break;
        }
        case "set_points_for": {
          const u = findUserByQuery(db, String(args.query ?? ""));
          if (!u) {
            out.push({ name: a.name, ok: false, detail: "المستخدم غير موجود" });
            break;
          }
          const target = Math.max(0, Number(args.amount ?? 0));
          addPoints(db, u.id, target - u.points, "admin", "تعيين الرصيد (AI)");
          out.push({ name: a.name, ok: true, detail: `${displayName(u)} → ${u.points}` });
          break;
        }
        case "ban_user": {
          const u = findUserByQuery(db, String(args.query ?? ""));
          if (!u) {
            out.push({ name: a.name, ok: false, detail: "المستخدم غير موجود" });
            break;
          }
          u.banned = true;
          u.banReason = "قرار إداري (AI)";
          out.push({ name: a.name, ok: true, detail: displayName(u) });
          break;
        }
        case "vip_user": {
          const u = findUserByQuery(db, String(args.query ?? ""));
          if (!u) {
            out.push({ name: a.name, ok: false, detail: "المستخدم غير موجود" });
            break;
          }
          u.vip = !u.vip;
          out.push({ name: a.name, ok: true, detail: `${displayName(u)} vip=${u.vip}` });
          break;
        }
        case "broadcast": {
          const targets = Object.values(db.users).filter((u) => !u.banned);
          let sent = 0;
          for (let i = 0; i < targets.length; i += 20) {
            const slice = targets.slice(i, i + 20);
            await Promise.all(
              slice.map(async (u) => {
                const markup =
                  args.buttonLabel && args.buttonUrl
                    ? { inline_keyboard: [[{ text: String(args.buttonLabel), url: String(args.buttonUrl) }]] }
                    : undefined;
                const res = await sendMessage(u.id, String(args.text ?? ""), markup);
                if (res) sent += 1;
              })
            );
            if (i + 20 < targets.length) await new Promise((r) => setTimeout(r, 800));
          }
          out.push({ name: a.name, ok: true, detail: `${sent}/${targets.length}` });
          break;
        }
        case "add_contest": {
          db.contests.push({
            id: `ct_${Math.random().toString(36).slice(2, 9)}`,
            title: String(args.title ?? "مسابقة"),
            desc: String(args.desc ?? ""),
            prize: String(args.prize ?? "جائزة"),
            winnersCount: Math.max(1, Number(args.winnersCount ?? 3)),
            endsAt: new Date(Date.now() + Math.max(1, Number(args.days ?? 7)) * 86400_000).toISOString(),
            status: "active",
          });
          out.push({ name: a.name, ok: true });
          break;
        }
        default:
          out.push({ name: a.name, ok: false, detail: "عملية غير معروفة" });
      }
    } catch (e) {
      out.push({ name: a.name, ok: false, detail: safeDetail(e) });
    }
  }
  return out;
}


export async function planPrompt(db: DB, prompt: string): Promise<Plan & { builtin: boolean }> {
  let plan: Plan | null = null;
  if (db.settings.ai.enabled) plan = await askLLM(db, prompt);
  if (plan) {
    if (plan.actions.length === 0) {
      const local = localPlan(prompt);
      if (local.actions.length > 0) {
        return { ...local, reply: `${plan.reply}\n${local.reply}`, provider: `${plan.provider}+builtin`, builtin: true };
      }
    }
    return { ...plan, builtin: false };
  }
  return { ...localPlan(prompt), builtin: true };
}

export async function runActions(db: DB, actions: Action[]): Promise<ActionResult[]> {
  return runActionsImpl(db, actions);
}

