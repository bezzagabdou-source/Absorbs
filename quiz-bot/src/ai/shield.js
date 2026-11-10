import { q } from "../db.js";

/**
 * درع التنفيذ (Deterministic Intent Layer)
 * ----------------------------------------
 * طبقة تفهم الطلب بالدارجة/العربية/الفرنسية وتحوّله لخطة أدوات جاهزة.
 * فوائدها:
 *  1) لو النموذج رفض أو ما جاوبش أو ما كانش مفتاح ⇒ الطلب يتنفّذ على أي حال.
 *  2) تعطي النموذج تلميحاً بالنية الحقيقية (يقلل سوء الفهم).
 *  3) تمنع «الرفض» نهائياً لأنها تختار الأداة بنفسها.
 */

const USER_REF = /(?:المستخدم|العضو|الحساب|user|مستخدم)\s*[#:]?\s*(\d{5,})|(?:@)([A-Za-z0-9_]{4,32})|(?:id|ID|آي دي)\s*[:=]?\s*(\d{5,})/;

function who(text) {
  const m = USER_REF.exec(text);
  if (!m) return null;
  if (m[1]) return { user_id: Number(m[1]) };
  if (m[3]) return { user_id: Number(m[3]) };
  if (m[2]) return { username: m[2] };
  return null;
}

const AR_DIGITS_MAP = (s) => String(s ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

function hasAmount(t) {
  return /\d/.test(AR_DIGITS_MAP(t));
}

function number(text, re) {
  const m = re.exec(text);
  return m ? Number(m[1].replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))) : null;
}

const AR_DIGITS = (s) => String(s ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

const INTENTS = [
  {
    id: "stats",
    test: (t) => /(احصائ|إحصائ|احصائي|statistics|\bstats\b|كم (?:عندنا|فيه)|نظرة عامة|وضع البوت|كلش مليح)/i.test(t),
    plan: () => [{ tool: "get_stats", args: {} }],
  },
  {
    id: "referrals",
    test: (t) => /(احال|إحال|referral|شكون دخل|من طرف|جاب)/i.test(t) && !/(ارسل|ابعث|حظر|نقاط)/i.test(t),
    plan: (t) => [
      { tool: "get_referrals", args: { status: /مشبوه|مزيف|fake|flag/i.test(t) ? "flagged" : /انتظار|pending/i.test(t) ? "pending" : "all", limit: 20 } },
    ],
  },
  {
    id: "security",
    test: (t) => /(حماي|أمان|امان|security|هجوم|هجم|رشق|حظر|مستوى)/i.test(t) && !/(فك|ارفع|ارسل|شبك|IP|مستخدمين)/i.test(t),
    plan: () => [{ tool: "get_security", args: {} }],
  },
  {
    id: "users",
    test: (t) => /(مستخدمين|اعضاء|أعضاء|المستخدمون|users|قائمة)/i.test(t) && !/(احظر|حظر|نقاط)/i.test(t),
    plan: () => [{ tool: "list_users", args: { limit: 20 } }],
  },
  {
    id: "top",
    test: (t) => /(لوحة الشرف|الافضل|الأفضل|top|ترتيب|اكت|أقوى لاعب)/i.test(t),
    plan: () => [{ tool: "get_leaderboard", args: { limit: 10 } }],
  },

  /* ── تنفيذ ── */
  {
    id: "block",
    test: (t) => /(احظر|حظر|block|اقفل حساب|اوقفه)/i.test(t) && !/(فك|ارفع|شبك|IP)/i.test(t) && who(t),
    plan: (t) => [{ tool: "block_user", args: { ...who(t), reason: /(مزيف|فارم|fake|غش)/i.test(t) ? "إحالات مزيفة" : "حظر من FT AI" } }],
  },
  {
    id: "unblock",
    test: (t) => /(فك الحظر|فك حظر|unblock|حل الحظر|رجعو)/i.test(t) && who(t),
    plan: (t) => [
      { tool: "unblock_user", args: who(t) },
      { tool: "reset_user_risk", args: who(t) },
    ],
  },
  {
    id: "points",
    test: (t) =>
      (/(نقاط|نقطة|points?)/i.test(t) || /(زيد|ضيف|اعطي|أعطي|امنح)\s+\d/.test(t)) &&
      /(زيد|ضيف|اعطي|أعطي|امنح|خصم|انقص|نقص|give|add)/i.test(t) &&
      Boolean(who(t) || hasAmount(t)),
    plan: (t) => {
      const n = number(AR_DIGITS(t), /(-?\d{1,6})\s*(?:نقطة|نقاط|point)/i) ?? number(AR_DIGITS(t), /(?:زيد|ضيف|اعطي|أعطي|امنح|خصم|انقص|give|add)\s+(-?\d{1,6})/i) ?? 100;
      if (!who(t)) return [];
      const neg = /(خصم|انقص|نقص|remove|minus)/i.test(t);
      return [{ tool: "give_points", args: { ...who(t), delta: neg ? -Math.abs(n) : Math.abs(n), reason: "طلب من FT AI" } }];
    },
  },
  {
    id: "net",
    test: (t) => /(شبك|network|ip)/i.test(t) && /(احظر|حظر|block)/i.test(t) && !/(فك|ارفع|رفع|unblock)/i.test(t),
    plan: (t) => {
      const m = /((?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?)/.exec(t);
      return m ? [{ tool: "block_network", args: { ip: m[1], reason: "حظر من FT AI" } }] : [];
    },
  },
  {
    id: "unnet",
    test: (t) => /(شبك|network|ip)/i.test(t) && /(فك|ارفع|رفع|unblock)/i.test(t),
    plan: (t) => {
      const m = /((?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?)/.exec(t);
      return m ? [{ tool: "unblock_network", args: { net: m[1] } }] : [];
    },
  },
  {
    id: "broadcast",
    test: (t) => /(بث|للجميع|لكل المستخدمين|broadcast|اعلان|إعلان)/i.test(t),
    plan: (t) => {
      const m = /(?:بث|أعلن|اعلن|broadcast)(?:\s*[:：]|\s+)\s*([\s\S]{3,})/i.exec(t);
      const text = (m?.[1] ?? "").trim().replace(/^للجميع\s*[:：]?\s*/, "");
      return text.length >= 3 ? [{ tool: "broadcast", args: { text } }] : [];
    },
  },
  {
    id: "send",
    test: (t) => /(ارسل|أرسل|ابعث|send|قول ل|بلغ)/i.test(t) && who(t),
    plan: (t) => {
      const m = /(?:ارسل|أرسل|ابعث|send|قول ل|بلغ)\s*(?:ل(?:ـ)?\s*)?(?:@[\w]+|\d{5,})?\s*[:：]?\s*([\s\S]{3,})/i.exec(t);
      const text = (m?.[1] ?? "مرحبا من إدارة FT AI ⚡").trim();
      return [{ tool: "send_message", args: { ...who(t), text } }];
    },
  },
  {
    id: "password",
    test: (t) => /(كلمة السر|كلمه السر|password|باسورد)/i.test(t) && /(غير|غيّر|بدل|change|set)/i.test(t),
    plan: (t) => {
      const m = /(?:الى|إلى|لـ|ل|:|=)\s*([^\s]{8,64})\s*$/.exec(t);
      return m ? [{ tool: "change_dashboard_password", args: { password: m[1] } }] : [];
    },
  },
  {
    id: "protection",
    test: (t) => /(مستوى الحماية|protection level|خفف الحماية|ارفع الحماية|حماية قصوى)/i.test(t) && !/شبك/i.test(t),
    plan: (t) => [
      { tool: "set_protection_level", args: { level: /(خفف|نقص|off|عطل)/i.test(t) ? "off" : /(normal|عادي)/i.test(t) ? "normal" : /(high|عالي)/i.test(t) ? "high" : "max" } },
    ],
  },
  {
    id: "settings",
    test: (t) => /(اعدادات|إعدادات|settings|نقاط السؤال|مدة السؤال|مكافأة اليوم)/i.test(t) && /(غير|غيّر|خلي|دير|اجعل|set|update)/i.test(t),
    plan: (t) => {
      const s = {};
      const pts = number(AR_DIGITS(t), /(?:نقاط السؤال|الإجابة الصحيحة|points_correct)[^\d]{0,12}(\d{1,4})/i);
      if (pts != null) s.points_correct = pts;
      const secs = number(AR_DIGITS(t), /(?:مدة السؤال|quiz_seconds)[^\d]{0,12}(\d{1,3})/i);
      if (secs != null) s.quiz_seconds = secs;
      const daily = number(AR_DIGITS(t), /(?:مكافأة اليوم|points_daily)[^\d]{0,12}(\d{1,5})/i);
      if (daily != null) s.points_daily = daily;
      const ref = number(AR_DIGITS(t), /(?:نقاط الإحالة|referral_points)[^\d]{0,12}(\d{1,5})/i);
      if (ref != null) s.referral_points = ref;
      return Object.keys(s).length ? [{ tool: "update_settings", args: { settings: s } }] : [];
    },
  },
  {
    id: "questions",
    test: (t) => /(اضف سؤال|ضيف سؤال|سؤال جديد|add question)/i.test(t),
    plan: (t) => {
      const m = /(?:سؤال|question)\s*[:：]\s*([^?؟\n]{6,200})[?؟]?\s*(?:خيارات|options)\s*[:：]\s*([^|\n]{3,300})\s*(?:الجواب|correct)\s*[:：]\s*(\d)/i.exec(t);
      if (!m) return [];
      const options = m[2].split(/\s*[|،,]\s*/).filter(Boolean);
      return [{ tool: "add_question", args: { question: m[1].trim(), options, correct: Number(m[3]) } }];
    },
  },
  {
    id: "webhook",
    test: (t) => /(webhook|ويب هوك|البوت ما يستقبل|ما يستقبلش|ما يردش|مربوط|ربط البوت|telegram.*(?:لا يعمل|مشكل))/i.test(t),
    plan: () => [
      { tool: "bot_health", args: {} },
      { tool: "fix_webhook", args: {} },
    ],
  },
  {
    id: "fix",
    test: (t) => /(حل مشكل|صلح|fix|مشكل في|خربان|ما يخدمش|لا يعمل)/i.test(t),
    plan: () => [
      { tool: "get_stats", args: {} },
      { tool: "get_security", args: {} },
      { tool: "get_settings", args: {} },
    ],
  },
];

export function shield(text) {
  const t = String(text ?? "");
  const matched = INTENTS.filter((i) => i.test(t));
  const plan = [];
  const intents = [];
  for (const i of matched) {
    try {
      const steps = i.plan(t) ?? [];
      if (steps.length) {
        intents.push(i.id);
        for (const s of steps) {
          if (!plan.some((p) => p.tool === s.tool && JSON.stringify(p.args) === JSON.stringify(s.args))) plan.push(s);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return { intents, plan: plan.slice(0, 8), confident: plan.length > 0 };
}

/** يستعملها البوت: «خربان شي؟» ⇒ تشخيص ذاتي */
export function selfDiagnose() {
  const issues = [];
  const stats = {
    users: q.get("SELECT COUNT(*) AS n FROM users WHERE is_bot = 0").n,
    blocked: q.get("SELECT COUNT(*) AS n FROM users WHERE blocked = 1").n,
    pending: q.get("SELECT COUNT(*) AS n FROM referral_events WHERE points_awarded = 0 AND suspicious = 0").n,
    flagged: q.get("SELECT COUNT(*) AS n FROM referral_events WHERE suspicious = 1").n,
    questions: q.get("SELECT COUNT(*) AS n FROM custom_questions WHERE active = 1").n,
  };
  const errors = q.get(
    "SELECT COUNT(*) AS n FROM events WHERE severity IN ('error','high') AND at > ?",
    Date.now() - 86400000
  ).n;
  if (errors > 0) issues.push(`${errors} حدث خطير في 24 ساعة (شوف سجل الحماية)`);
  if (stats.flagged > 0) issues.push(`${stats.flagged} إحالة مشبوهة تحتاج مراجعة`);
  if (stats.pending > 0) issues.push(`${stats.pending} إحالة معلّقة (تُدفع بعد أول نشاط)`);
  if (stats.users === 0) issues.push("ما كاين حتى مستخدم بعد — تأكد من رمز البوت والـ webhook");
  return { stats, issues, healthy: issues.length === 0 };
}
