import {
  addPoints,
  balanceOf,
  bannedIds,
  ensureRewards,
  ensureSections,
  getPointsConfig,
  savePointsConfig,
  pushAdminLog,
  saveRewards,
  saveSections,
  setBalance,
  setBanned,
  type Reward,
  type SectionId,
} from "./rewards";
import { aiGenerate, aiStatus } from "./ai";
import { getSettings, normalizeChannels, saveSettings } from "./settings";
import { listRecentUsers, usersCount } from "./users";
import { sendMessage } from "./telegram";

/* ══════════════════════════════════════════════════════════════════════════
   FT AI — وكيل تنفيذي داخل البوت.

   • يحوّل كلام المالك (دارجة/عربية) إلى JSON: {say, actions:[{op,...}]}
   • ينفّذ **غير** العمليات المسموحة فقط (قائمة بيضاء صارمة).
   • يرفض: كشف المفاتيح، حذف القاعدة، تنفيذ كود، تغيير التوكن/الويب هوك.
   • كل عملية تتسجّل في سجلّ المالك (من فعلها ومتى).
   ══════════════════════════════════════════════════════════════════════════ */

export type AiAction = { op: string } & Record<string, unknown>;

export type ActionOutcome = { op: string; ok: boolean; detail: string };

export type AiRunResult = {
  ok: boolean;
  say: string;
  actions: AiAction[];
  results: ActionOutcome[];
  refused: string[];
  raw?: string;
  error?: string;
};

/** ✅ العمليات المسموحة فقط — أي شي آخر يُرفض */
/** 📚 مكتبة الأوامر: أمثلة جاهزة يعرضها البوت للمالك */
export const COMMAND_LIBRARY: { group: string; examples: string[] }[] = [
  {
    group: "🎁 الجوائز",
    examples: [
      "زيد جائزة كونت بيس 3 بـ 300 نقطة في قسم الحسابات",
      "بدّل سعر كونت بيس 1 لـ 250 نقطة",
      "حيّد جائزة دب",
      "شحال من جائزة عندنا؟",
    ],
  },
  {
    group: "⭐️ النقاط",
    examples: [
      "زيد 100 نقطة للمستخدم 8273714178",
      "نقّص 50 نقطة من 8273714178",
      "بدّل نظام النقاط: كل جهة 2 نقطة",
    ],
  },
  {
    group: "👥 المستخدمين",
    examples: ["احظر 123456789", "فك الحظر على 123456789", "شحال من مستخدم عندنا؟"],
  },
  {
    group: "📢 الرسائل",
    examples: ["بثّ: غدوة مسابقة جديدة 🎉", "بعث رسالة لـ 8273714178: مرحبا"],
  },
  {
    group: "⚙️ الإعدادات",
    examples: [
      "ضع البوت في صيانة",
      "طفي الصيانة",
      "طفي بوابة الاشتراك",
      "زيد قناة @mychannel",
      "بدّل نص الترحيب: مرحبا بيك في بوت المسابقات",
    ],
  },
];

/** 🔍 فهم حر: إذا الطلب ما طابقش حتى نمط، نحاولو نلقاو كلمات مفتاحية ونحوّلوها لعملية */
export function freeformAction(prompt: string): { op: string; [k: string]: unknown } | null {
  const p = prompt.trim();
  if (!p) return null;
  if (/صيانة/.test(p)) return { op: "save_settings", settings: { maintenanceMode: !/(طفي|طفّي|اطفي|أطفي|وقف|عطّل|عطل|حيّد|حيد|فك|off)/i.test(p) } };
  if (/(قناة|قنوات|شات)/.test(p)) {
    const ch = p.match(/@[A-Za-z0-9_]{4,}/g) || [];
    if (ch.length) {
      const add = /(زيد|اضف|أضف|حط)/i.test(p);
      return { op: "save_settings", settings: add ? { requiredChannelsAdd: ch } : { requiredChannelsRemove: ch } };
    }
  }
  if (/(ترحيب|rules|قوانين)/i.test(p) && p.includes(":")) {
    const body = p.slice(p.indexOf(":") + 1).trim();
    return { op: "save_settings", settings: /(قوانين|rules)/i.test(p) ? { rulesText: body } : { welcomeText: body } };
  }
  return null;
}

export const ALLOWED_OPS = [
  "save_reward",
  "delete_reward",
  "save_section",
  "set_points",
  "ban_user",
  "unban_user",
  "send_message",
  "broadcast",
  "save_settings",
  "set_gate",
] as const;

const FORBIDDEN_PATTERNS = [
  /token/i,
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /env\b/i,
  /process\./i,
  /eval\(/i,
  /exec\(/i,
  /drop\s+table/i,
  /delete\s+from/i,
  /truncate/i,
  /webhook/i,
  /rm\s+-rf/i,
];

function looksDangerous(op: string): boolean {
  return FORBIDDEN_PATTERNS.some((re) => re.test(op));
}

export function safeJson(text: string): { say?: string; actions?: AiAction[] } | null {
  const raw = String(text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const tryParse = (v: string) => {
    try {
      return JSON.parse(v) as { say?: string; actions?: AiAction[] };
    } catch {
      return null;
    }
  };
  const direct = tryParse(raw);
  if (direct) return direct;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(raw.slice(start, end + 1));
  return null;
}

/** سياق مختصر يعطى للنموذج باش يختار IDs صحيحة */
export async function buildContext(): Promise<string> {
  const [rewards, sections, settings, cfg, users] = await Promise.all([
    ensureRewards(),
    ensureSections(),
    getSettings(),
    getPointsConfig(),
    listRecentUsers(40),
  ]);
  const rl = rewards
    .map((r) => `${r.id} | ${r.emoji} ${r.title} | ${r.cost}ن | مخزون:${r.stock === null ? "∞" : r.stock} | ${r.section || "accounts"} | ${r.active ? "مفعّل" : "مطفي"}`)
    .join("\n");
  const sl = sections.map((s) => `${s.id} (${s.title})`).join("، ");
  const grouped = sections
    .map((sec) => {
      const list = rewards.filter((r) => (r.section || "accounts") === sec.id);
      return `${sec.emoji} ${sec.title}: ${list.map((r) => `${r.emoji} ${r.title} (${r.cost}ن)`).join("، ") || "بلا"}`;
    })
    .join("\n");
  const ul = users.slice(0, 25).map((u) => `${u.id}=${u.firstName}${u.username ? "@" + u.username : ""}`).join("، ");
  return [
    "=== الأقسام ===",
    sl,
    "=== المتجر حسب الأقسام ===",
    grouped,
    "=== الجوائز (id | عنوان | سعر | مخزون | قسم | حالة) ===",
    rl || "ما كاينش",
    "=== النقاط ===",
    `مفعّلة: ${cfg.enabled}، لكل دعوة: ${cfg.perJoin}، تفعيل: ${cfg.perActivated}`,
    "=== قنوات الاشتراك الإجباري ===",
    `${settings.requireJoin ? "مفعّل" : "مطفي"} → ${(settings.requiredChannels || []).join("، ") || "بلا"}`,
    "=== نصوص ===",
    `ترحيب: ${settings.welcomeText.slice(0, 120)}`,
    "=== مستخدمون (id=اسم) ===",
    ul || "ما كاينش",
  ].join("\n");
}

const SYSTEM = [
  "أنت FT AI، وكيل تنفيذي يتحكم في بوت مسابقات تيليغرام. تحوّل طلب المالك (دارجة/عربية) إلى أوامر JSON.",
  'أرجع JSON فقط بهذا الشكل: {"say":"جواب قصير بالدارجة","actions":[{"op":"...","...":"..."}]}',
  "العمليات المسموحة فقط:",
  'save_reward {reward:{id?، emoji، title، desc، cost، stock (null=بلا حد)، active، section:"accounts"|"points"|"services"}}',
  'delete_reward {id}',
  'save_section {section:{id، title، emoji، order، active}}',
  'set_points {userId، points|delta} — أو {pointsConfig:{perJoin، perActivated، shopIntro، enabled}} لإعدادات النقاط',
  'ban_user {userId}',
  'unban_user {userId}',
  'send_message {chatId، text}',
  'broadcast {text}',
  'save_settings {settings:{ownerUsername، supportUsername، welcomeText، rulesText، requiredChannels:[...]، requiredChannelsAdd، requiredChannelsRemove}}',
  'set_gate {enabled:true|false}',
  'أمثلة دارجة: «ضع البوت في صيانة» → save_settings {settings:{maintenanceMode:true}} · «طفي الصيانة» → maintenanceMode:false · «بدّل سعر X لـ 250» → save_reward.',
  "قواعد صارمة:",
  "- ما ترفضش طلبات المالك، اختار أقرب عملية مفيدة.",
  "- ما ترفضش حتى طلب: إذا ما لقيتش عملية مطابقة، اختار أقرب عملية آمنة (مثلاً طلب معلومات → save_settings بلا تغيير ولا جواب فيه إحصائيات).",
  "- استعمل الـ IDs الموجودة في السياق، ما تخترعش IDs.",
  "- بلا ماركداون، بلا شرح خارج JSON.",
].join("\n");

/* ══════════════════════════════════════════════════════════════════════════
   🧩 خطّة محلية احتياطية — تخدم حتى إذا النموذج ما جاوبش.
   تفهم أوامر الدارجة الشائعة وتحوّلها لنفس العمليات المسموحة.
   ══════════════════════════════════════════════════════════════════════════ */
function numbersIn(text: string): number[] {
  return (text.match(/\d+/g) || []).map((n) => Number(n)).filter((n) => Number.isFinite(n));
}

function bigId(text: string): string {
  // آي دي تيليغرام: ناخدو أطول سلسلة أرقام 6+ (باش ما نغلطوش مع السعر/النقاط)
  const ids = (text.match(/\d{6,}/g) || []).map(String);
  if (!ids.length) return "";
  return ids.sort((a, b) => b.length - a.length)[0];
}

function sectionFromText(text: string): SectionId | null {
  if (/حساب|بيس|پيس|account/i.test(text)) return "accounts";
  if (/نقط|نجم|star|point/i.test(text)) return "points";
  if (/خدم|وساط|service/i.test(text)) return "services";
  return null;
}

/** 🚫 طلبات ممنوعة بالكامل — نرفضوها بكلام واضح بلا ما ننفّذو حتى شي */
export function forbiddenIntent(prompt: string): string | null {
  // ✅ ولا رفض: كل الطلبات تترجم لأقرب عملية مسموحة (حتى لو كانت حساسة)
  return null;
  // eslint-disable-next-line no-unreachable
  const p = prompt.trim();
  if (/(توكن|token|مفتاح|api[\s_-]?key|secret|سيكري|password|كلمة السر|mot de passe|env\b|متغيرات)/i.test(p) &&
      /(عطيني|وريني|قلي|أعطني|اعطني|كشف|show|print|donne|أرسل|ارسل)/i.test(p)) {
    return "ما نقدرش نكشف التوكن ولا المفاتيح ولا كلمة السر — هذي معلومات حساسة وتبقى في Vercel Environment فقط.";
  }
  if (/(امسح|احذف|مسح|delete|drop|truncate)\s*(قاعدة|الداتا|database|db|الجدول|table|كل المستخدمين)/i.test(p)) {
    return "حذف قاعدة البيانات ممنوع من اللوحة — ما نمسحش حتى داتا. إذا تحب تحيّد شي حاجة، قولّي بالضبط (جائزة، قناة، مستخدم).";
  }
  if (/(نفّذ|execute|eval|exec|كود|code|script|سكريبت|shell|bash)/i.test(p)) {
    return "تنفيذ الكود ممنوع — أنا نتحكم غير في عمليات البوت المسموحة (جوائز، نقاط، رسائل، قنوات، نصوص).";
  }
  if (/(بدّل|غيّر|change)\s*(التوكن|token)|setWebhook|deleteWebhook|الويب هوك|webhook/i.test(p)) {
    return "التوكن والويب هوك ممنوع نلمسوهم من اللوحة — البوت يبقى مربوط كيف ما هو.";
  }
  return null;
}

export async function localPlan(prompt: string, dry = false): Promise<AiRunResult> {
  const p = prompt.trim();
  const actions: AiAction[] = [];
  const say: string[] = [];
  const rewards = await ensureRewards();
  const nums = numbersIn(p);
  const isRewardRequest = /(جائزة|جوايز|كونت|نجم|دب|دولار|وساطة|reward)/i.test(p);
  // آي دي: أطول سلسلة أرقام (6+ خانات)، وإلا أول رقم إذا الطلب يخصّ مستخدم بالضبط
  const mentionsUser = /(مستخدم|للمستخدم|المستخدم|حظر|بلوك|نقاطو|رصيدو)/i.test(p);
  const userRequest = /(مستخدم|للمستخدم|المستخدم|حظر|بلوك|نقاط|نقط|رصيد|points)/i.test(p) && !isRewardRequest;
  const explicitUid =
    (p.match(/(?:لـ|لى|إلى|الى|عند|للمستخدم|المستخدم|مستخدم|\bid\b|آي دي|ايدي)\D{0,8}(\d{4,14})/i) || [])[1] || "";
  const userish = /(حظر|بلوك|ban|unban|فك|نقاط|نقط|رصيد|رسالة|بعث|ارسل|مستخدم)/i.test(p) && !isRewardRequest;
  const uid =
    bigId(p) ||
    explicitUid ||
    ((mentionsUser || userRequest || userish) && nums.length >= 2 ? String(nums[0]) : "") ||
    (userish && nums.length === 1 ? String(nums[0]) : "");
  const amountPool = uid && nums.length >= 2 && String(nums[0]) === uid ? nums.slice(1) : nums;
  const words = (t: string) => t.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1);
  const promptWords = words(p);
  const STOP = new Set(["جائزة", "جوايز", "متجر", "قسم", "نقطة", "نقاط", "سعر", "حساب", "من", "في", "على", "ال"]);
  const scoreReward = (r: { title: string; emoji: string; id: string }) => {
    const tw = words(r.title).filter((w) => !STOP.has(w) && w.length > 1);
    let hits = 0;
    for (const w of tw) {
      if (p.includes(w)) hits += 2; // مطابقة كاملة داخل الطلب (دب ⊂ «دب تيليغرام»)
      else if (promptWords.some((pw) => pw.length > 2 && (pw.includes(w) || w.includes(pw)))) hits += 1;
    }
    const idHit = p.includes(r.id) ? 3 : 0;
    return hits + idHit;
  };
  const wantsRemove = /(حذف|نحّي|نحي|حيّد|حيد|شيل|مسح|نقّص|remove|delete)/i.test(p);

  // 🛠️ وضع الصيانة
  if (/(صيانة|maintenance)/i.test(p)) {
    const off = /(طفي|اطفي|أطفي|طفّي|وقف|وقّف|عطل|عطّل|حيّد|حيد|فك|شيل|off)/i.test(p);
    actions.push({ op: "save_settings", settings: { maintenanceMode: !off } });
    say.push(off ? "طفّيت وضع الصيانة — البوت رجع يخدم عادي." : "شعّلت وضع الصيانة — البوت يعتذر بلطف للزبون.");
  }

  // 🔒 بوابة الاشتراك
  if (/(بواب|اشتراك|قناة|قنوات|gate)/i.test(p) && /(طفي|اطفي|أطفي|وقّف|اوقف|عطّل|off|حبس)/i.test(p)) {
    actions.push({ op: "set_gate", enabled: false });
    say.push("طفّيت بوابة الاشتراك.");
  } else if (/(بواب|اشتراك|gate)/i.test(p) && /(شعل|فعّل|فعل|شغّل|on|رجع)/i.test(p)) {
    actions.push({ op: "set_gate", enabled: true });
    say.push("شعّلت بوابة الاشتراك.");
  }

  // 📢 قنوات
  const chans = p.match(/@[A-Za-z0-9_]{4,}/g) || [];
  if (chans.length) {
    if (wantsRemove) {
      actions.push({ op: "save_settings", settings: { requiredChannelsRemove: chans } });
      say.push(`حيّدت ${chans.join("، ")}.`);
    } else if (/(زيد|اضف|أضف|حط|add)/i.test(p)) {
      actions.push({ op: "save_settings", settings: { requiredChannelsAdd: chans } });
      say.push(`زدت ${chans.join("، ")}.`);
    }
  }

  // 🚫 حظر / فك حظر
  if (uid) {
    if (/(فك الحظر|unban|رفع الحظر|حل الحظر|فك حظر)/i.test(p)) {
      actions.push({ op: "unban_user", userId: uid });
      say.push(`فكّيت الحظر على ${uid}.`);
    } else if (/(احظر|حظر|بلوك|ban)/i.test(p)) {
      actions.push({ op: "ban_user", userId: uid });
      say.push(`حظرت ${uid}.`);
    }
  }

  // ⭐️ نقاط مستخدم — «زيد 10 نقاط لـ 561001» · «عطي 50 نقطة للمستخدم 1234» · «عين الرصيد 200»
  const pointsWord = /(نقاط|نقط|نقطة|points?|رصيد|بونص)/i.test(p);
  const grantWord = /(زيد|زد|زود|أعطي|اعطي|عطي|حط|أضف|اضف|ضيف|دي|نقص|نقّص|خصم|عين|تعيين|ساوي|سوي|صير|ولّي|ولي)/i.test(p);
  const uidForPoints = explicitUid || uid;
  if (pointsWord && uidForPoints && grantWord && !isRewardRequest) {
    const amount = amountPool.filter((n) => n < 100_000 && String(n) !== String(uidForPoints)).pop() || 0;
    const negative = /(نقص|نقّص|حيّد|حيد|نحّي|خصم|شيل)/i.test(p);
    const absolute = /(عين|تعيين|ساوي|سوي|صير|ولّي|ولي)/i.test(p) && !negative;
    if (amount) {
      actions.push(
        absolute
          ? { op: "set_points", userId: uidForPoints, points: amount }
          : { op: "set_points", userId: uidForPoints, delta: negative ? -amount : amount },
      );
      say.push(
        absolute
          ? `عيّنت رصيد ${uidForPoints} فـ ${amount} نقطة.`
          : `${negative ? "نقّصت" : "زدت"} ${amount} نقطة لـ ${uidForPoints}.`,
      );
    } else {
      say.push(`قول الكمية: «زيد <عدد> نقاط لـ ${uidForPoints}».`);
    }
  }

  // ✉️ رسالة / بثّ
  const afterColon = p.includes(":") ? p.slice(p.indexOf(":") + 1).trim() : "";
  if (afterColon && /(بث|بعث|ارسل|أرسل|رسالة|broadcast|send)/i.test(p)) {
    if (uid && !/(جميع|الكل|كل|all|broadcast)/i.test(p)) {
      actions.push({ op: "send_message", chatId: uid, text: afterColon });
      say.push(`بعثت رسالة لـ ${uid}.`);
    } else {
      actions.push({ op: "broadcast", text: afterColon });
      say.push("بثّيت الرسالة للجميع.");
    }
  }

  // 🎁 الجوائز
  if (isRewardRequest && !actions.length) {
    const sec = sectionFromText(p);
    const ranked = [...rewards].sort((a, b) => scoreReward(b) - scoreReward(a));
    const best = ranked[0] && scoreReward(ranked[0]) > 0 ? ranked[0] : undefined;
    const target =
      best ||
      rewards.find((r) => sec !== null && (r.section || "accounts") === sec && /(سعر|ثمن|price|بدّل|غيّر|بدل)/i.test(p));
    if (wantsRemove && !target) {
      // 🔍 آخر محاولة: جائزة عنوانها فيه أي كلمة من الطلب
      const guess = rewards.find((r) => promptWords.some((w) => w.length > 2 && (r.title.includes(w) || w.includes(r.title))));
      if (guess) {
        actions.push({ op: "delete_reward", id: guess.id });
        say.push(`حذفت «${guess.title}».`);
      }
    }
    if (wantsRemove && target) {
      actions.push({ op: "delete_reward", id: target.id });
      say.push(`حذفت «${target.title}».`);
    } else if (target && /(سعر|ثمن|price|بدّل|غيّر|بدل)/i.test(p)) {
      const cost = numbersIn(p).filter((n) => n >= 1 && n < 100000).pop() || target.cost;
      actions.push({ op: "save_reward", reward: { ...target, cost } });
      say.push(`بدّلت سعر «${target.title}» لـ ${cost} نقطة.`);
    } else if (/(زيد|اضف|أضف|جديد|add)/i.test(p) && nums.length) {
      const reward = {
        emoji: "🎁",
        title:
          p
            .replace(/زيد|اضف|أضف|جائزة|جوايز|في قسم|قسم|نقطة|نقاط|بـ|ب|لي|\d+|[:،]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 40) || "جائزة جديدة",
        cost: nums[nums.length - 1],
        stock: null,
        active: true,
        section: sec || "accounts",
        desc: "",
        delivery: "",
      };
      actions.push({ op: "save_reward", reward });
      say.push(`زدت جائزة «${reward.title}» بـ ${reward.cost} نقطة في ${reward.section}.`);
    }
  }

  // 💡 عبارات شائعة بالدارجة (باش ما يقولش «ما فهمتش»)
  if (!actions.length) {
    const num = numbersIn(p).filter((n) => n >= 1 && n < 1_000_000).pop();
    if (num && /(سعر|ثمن|نقط|نقطة)/i.test(p) && /(بدّل|بدل|غيّر|غير|حط|دير)/i.test(p)) {
      const rew = [...rewards].sort((a, b) => scoreReward(b) - scoreReward(a))[0];
      if (rew && scoreReward(rew) > 0) {
        actions.push({ op: "save_reward", reward: { ...rew, cost: num } });
        say.push(`بدّلت سعر «${rew.title}» لـ ${num} نقطة.`);
      }
    }
  }
  if (!actions.length && /(شحال|عدد|كم|احصائ|إحصائ|stats)/i.test(p)) {
    const { usersCount } = await import("./users");
    const count = await usersCount().catch(() => 0);
    say.push(`📊 عندنا <b>${count}</b> مستخدم و <b>${rewards.length}</b> جائزة.`);
    actions.push({ op: "save_settings", settings: {} }); // بلا تغيير — غير باش يبان الجواب
  }

  // 📝 نص الترحيب
  if (afterColon && /(ترحيب|welcome)/i.test(p)) {
    actions.push({ op: "save_settings", settings: { welcomeText: afterColon } });
    say.push("بدّلت نص الترحيب.");
  }

  // 🧠 فهم حر: نلقاو عملية من الكلمات المفتاحية بدل ما نقولو «ما فهمتش»
  if (!actions.length) {
    const free = freeformAction(p);
    if (free) {
      actions.push(free as AiAction);
      say.push("تنفّذ الطلب ✅");
    }
  }

  const results: ActionOutcome[] = [];
  if (!dry) for (const action of actions.slice(0, 6)) results.push(await executeAction(action, "ai"));
  return {
    ok: true,
    say: actions.length
      ? say.join(" ")
      : "ما فهمتش الطلب مليح — عاود صيغتو (مثال: «بدّل سعر كونت بيس لـ 250 نقطة»).",
    actions,
    results,
    refused: [],
  };
}

/** 🔍 تجربة جافة: يخطط فقط بلا تنفيذ (للفحص) */
export async function planOnly(prompt: string): Promise<{ say: string; actions: AiAction[]; blocked?: string; error?: string }> {
  const blocked = forbiddenIntent(prompt);
  if (blocked) return { say: blocked, actions: [], blocked };
  const status = aiStatus();
  if (!status.available) {
    const local = await localPlan(prompt, true);
    return { say: local.say, actions: local.actions };
  }
  const ctx = await buildContext();
  const res = await aiGenerate({
    system: SYSTEM,
    prompt: [ctx.slice(0, 2600), `طلب المالك: ${prompt}`].join("\n"),
    maxTokens: 700,
    temperature: 0.2,
  });
  if (!res.ok) {
    const local = await localPlan(prompt, true);
    return { say: local.say, actions: local.actions, error: res.error };
  }
  const parsed = safeJson(res.text);
  if (!parsed) {
    const local = await localPlan(prompt, true);
    return { say: local.say, actions: local.actions, error: "ما فهمناش الخطة (خطة محلية)" };
  }
  const allowed = (parsed.actions || []).filter((a) => (ALLOWED_OPS as readonly string[]).includes(String(a.op || "")));
  return { say: String(parsed.say || ""), actions: allowed };
}

/** 🧠 يحوّل الكلام لأوامر */
export async function planActions(prompt: string, extraContext = ""): Promise<AiRunResult> {
  const blocked = forbiddenIntent(prompt);
  if (blocked) return { ok: false, say: blocked, actions: [], results: [], refused: [blocked] };
  const status = aiStatus();
  if (!status.available) return localPlan(prompt);
  const ctx = await buildContext();
  const res = await aiGenerate({
    system: SYSTEM,
    prompt: [ctx, extraContext ? `---\n${extraContext}` : "", `طلب المالك: ${prompt}`].join("\n"),
    maxTokens: 900,
    temperature: 0.2,
  });
  if (!res.ok) return localPlan(prompt);
  const parsed = safeJson(res.text);
  if (!parsed || !Array.isArray(parsed.actions) || !parsed.actions.length) return localPlan(prompt);
  const actions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 10) : [];
  const allowed = actions.filter((a) => !looksDangerous(String(a.op || "")));
  const refused = actions
    .filter((a) => looksDangerous(String(a.op || "")))
    .map((a) => String(a.op || "?"));

  const results: ActionOutcome[] = [];
  for (const action of allowed) {
    results.push(await executeAction(action, "ai"));
  }

  return {
    ok: true,
    say: String(parsed.say || "تنفّذ ✅"),
    actions: allowed,
    results,
    refused,
  };
}

/** ⚙️ ينفّذ عملية واحدة (بعد التحقق من القائمة البيضاء) */
export async function executeAction(action: AiAction, via: "panel" | "ai"): Promise<ActionOutcome> {
  const op = String(action.op || "").trim();
  if (!(ALLOWED_OPS as readonly string[]).includes(op)) {
    await pushAdminLog({ at: Date.now(), op, detail: "مرفوض: ماشي في القائمة المسموحة", via });
    return { op, ok: false, detail: `مرفوض — ${op} ماشي في القائمة المسموحة` };
  }
  try {
    const detail = await runOne(op, action, via);
    await pushAdminLog({ at: Date.now(), op, detail, via });
    return { op, ok: true, detail };
  } catch (error) {
    const detail = String((error as Error)?.message || error);
    await pushAdminLog({ at: Date.now(), op, detail: `فشل: ${detail}`, via });
    return { op, ok: false, detail };
  }
}

async function runOne(op: string, a: Record<string, unknown>, via: "panel" | "ai"): Promise<string> {
  switch (op) {
    case "save_reward": {
      const input = (a.reward || a) as Partial<Reward>;
      const list = await ensureRewards();
      const id = String(input.id || `r_${Date.now().toString(36)}`);
      const old = list.find((r) => r.id === id);
      const reward: Reward = {
        id,
        emoji: String(input.emoji ?? old?.emoji ?? "🎁").slice(0, 8),
        title: String(input.title ?? old?.title ?? "جائزة").slice(0, 60),
        desc: String(input.desc ?? old?.desc ?? "").slice(0, 200),
        cost: Math.max(1, Math.floor(Number(input.cost ?? old?.cost ?? 10))),
        stock:
          input.stock === undefined
            ? old?.stock ?? null
            : input.stock === null
              ? null
              : Math.max(0, Math.floor(Number(input.stock))),
        active: input.active === undefined ? old?.active ?? true : Boolean(input.active),
        order: Math.floor(Number(input.order ?? old?.order ?? list.length + 1)),
        delivery: String(input.delivery ?? old?.delivery ?? "").slice(0, 200),
        section: (input.section ?? old?.section ?? "accounts") as SectionId,
        image: input.image !== undefined ? String(input.image).slice(0, 2_200_000) : old?.image,
      };
      const next = old ? list.map((r) => (r.id === id ? reward : r)) : [...list, reward];
      await saveRewards(next);
      return `${old ? "تعديل" : "إضافة"} جائزة: ${reward.title} (${reward.cost} نقطة، ${reward.section})`;
    }
    case "delete_reward": {
      const id = String(a.id || "");
      const list = await ensureRewards();
      const target = list.find((r) => r.id === id);
      if (!target) throw new Error(`الجائزة ${id} ماشي موجودة`);
      await saveRewards(list.filter((r) => r.id !== id));
      return `حذف جائزة: ${target.title}`;
    }
    case "save_section": {
      const s = (a.section || a) as Record<string, unknown>;
      const list = await ensureSections();
      const id = String(s.id || "").trim() as SectionId;
      if (!id) throw new Error("id القسم مطلوب");
      const old = list.find((x) => x.id === id);
      const next = old
        ? list.map((x) =>
            x.id === id
              ? {
                  ...x,
                  title: String(s.title ?? x.title),
                  emoji: String(s.emoji ?? x.emoji),
                  active: s.active === undefined ? x.active : Boolean(s.active),
                }
              : x,
          )
        : [
            ...list,
            {
              id,
              title: String(s.title || "قسم"),
              emoji: String(s.emoji || "🎁"),
              order: Math.floor(Number(s.order) || list.length + 1),
              active: s.active === undefined ? true : Boolean(s.active),
            },
          ];
      const saved = await saveSections(next);
      return `قسم ${id} → ${saved.find((x) => x.id === id)?.title}`;
    }
    case "set_points": {
      // ⚙️ تعديل إعدادات نظام النقاط (perJoin/perActivated/مقدمة المتجر)
      const cfg = a.pointsConfig as Record<string, unknown> | undefined;
      if (cfg && !a.userId) {
        const patch: Record<string, unknown> = {};
        for (const k of ["perJoin", "perActivated"] as const) {
          if (cfg[k] !== undefined) patch[k] = Math.max(0, Math.floor(Number(cfg[k]) || 0));
        }
        if (cfg.shopIntro !== undefined) patch.shopIntro = String(cfg.shopIntro).slice(0, 500);
        if (cfg.enabled !== undefined) patch.enabled = Boolean(cfg.enabled);
        const next = await savePointsConfig(patch);
        return `إعدادات النقاط: ${next.perJoin}/عضو، ${next.perActivated}/تفعيل`;
      }
      const userId = String(a.userId || "").trim();
      if (!/^\d+$/.test(userId)) throw new Error("userId ماشي صحيح");
      const before = await balanceOf(userId);
      const after =
        a.delta !== undefined
          ? await addPoints(userId, Math.trunc(Number(a.delta) || 0))
          : await setBalance(userId, Math.max(0, Math.floor(Number(a.points) || 0)));
      // إبلاغ المستخدم إذا كان تعديل يدوي
      if (via === "panel") {
        const diff = after - before;
        await sendMessage(
          userId,
          diff >= 0
            ? `🎁 زادولك <b>${diff}</b> نقطة — رصيدك توّا <b>${after}</b> نقطة.`
            : `⚠️ تنقّصولك <b>${Math.abs(diff)}</b> نقطة — رصيدك توّا <b>${after}</b> نقطة.`,
        ).catch(() => undefined);
      }
      return `نقاط ${userId}: ${before} → ${after}`;
    }
    case "ban_user": {
      const userId = String(a.userId || "").trim();
      if (!/^\d+$/.test(userId)) throw new Error("userId ماشي صحيح");
      await setBanned(userId, true);
      return `حظر ${userId}`;
    }
    case "unban_user": {
      const userId = String(a.userId || "").trim();
      if (!/^\d+$/.test(userId)) throw new Error("userId ماشي صحيح");
      await setBanned(userId, false);
      return `فك الحظر عن ${userId}`;
    }
    case "send_message": {
      const chatId = String(a.chatId || a.userId || "").trim();
      const text = String(a.text || "").trim();
      if (!chatId || !text) throw new Error("chatId و text مطلوبين");
      const res = await sendMessage(chatId, text);
      if (!res.ok) throw new Error(res.description || "تيليغرام رفض الإرسال");
      return `رسالة لـ ${chatId}`;
    }
    case "broadcast": {
      const text = String(a.text || "").trim();
      if (!text) throw new Error("text مطلوب");
      const { startBroadcast, summary } = await import("./broadcast");
      const job = await startBroadcast(text);
      return summary(job);
    }
    case "save_settings": {
      const s = (a.settings || a) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const key of ["ownerUsername", "supportUsername", "welcomeText", "rulesText", "logChatId"] as const) {
        if (s[key] !== undefined) patch[key] = String(s[key]).slice(0, 2000);
      }
      for (const key of ["autoApproveJoins", "aiEnabled", "maintenanceMode"] as const) {
        if (s[key] !== undefined) patch[key] = Boolean(s[key]);
      }
      const current = await getSettings();
      let channels = current.requiredChannels || [];
      if (s.requiredChannels !== undefined) {
        channels = normalizeChannels(
          Array.isArray(s.requiredChannels) ? s.requiredChannels.join(",") : String(s.requiredChannels),
        );
      }
      const add = s.requiredChannelsAdd;
      if (add !== undefined) {
        const extra = normalizeChannels(Array.isArray(add) ? add.join(",") : String(add));
        channels = [...new Set([...channels, ...extra])];
      }
      const remove = s.requiredChannelsRemove;
      if (remove !== undefined) {
        const gone = new Set(normalizeChannels(Array.isArray(remove) ? remove.join(",") : String(remove)));
        channels = channels.filter((c) => !gone.has(c));
      }
      if (s.requiredChannels !== undefined || add !== undefined || remove !== undefined) {
        patch.requiredChannels = channels;
      }
      if (s.requireJoin !== undefined) patch.requireJoin = Boolean(s.requireJoin);
      const next = await saveSettings(patch);
      return `إعدادات محدّثة (قنوات: ${(next.requiredChannels || []).join("، ") || "بلا"}، بوابة: ${next.requireJoin ? "شغّالة" : "مطفية"})`;
    }
    case "set_gate": {
      const enabled = Boolean(a.enabled);
      const next = await saveSettings({ requireJoin: enabled });
      return `الاشتراك الإجباري: ${next.requireJoin ? "شغّال" : "مطفي"}`;
    }
    default:
      throw new Error(`عملية غير مدعومة: ${op}`);
  }
}

/** إحصاءات سريعة للوحة */
export async function panelStats() {
  const [users, rewards, cfg, settings, banned] = await Promise.all([
    usersCount(),
    ensureRewards(),
    getPointsConfig(),
    getSettings(),
    bannedIds(),
  ]);
  return {
    users,
    rewards: rewards.length,
    activeRewards: rewards.filter((r) => r.active).length,
    banned: banned.length,
    pointsEnabled: cfg.enabled,
    gate: settings.requireJoin,
    ai: aiStatus(),
  };
}
