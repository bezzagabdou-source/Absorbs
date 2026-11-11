import type { DB, Lang, Reward, Settings, Task, WheelSlice } from "./types";

export const APP = {
  name: "مسابقات MX",
  tagline: "اربح نقاطًا… وحوّلها إلى جوائز حقيقية",
  channel: {
    username: "mxabdou",
    title: "MX — مسابقات",
    url: "https://t.me/mxabdou",
  },
  version: "1.0.0",
};

export const SUPPORTED_LANGS: Lang[] = ["ar", "fr", "en"];

export function defaultSettings(): Settings {
  return {
    botVersion: APP.version,
    botEnabled: true,
    maintenance: false,
    maintenanceText:
      "🛠️ البوت في وضع الصيانة الآن.\nسنعود قريبًا جدًا — تابع قناتنا لتصلك الجوائز أولًا:\n" +
      APP.channel.url,
    botName: "مسابقات MX",
    brandEmoji: "🏆",
    lang: "ar",
    forceJoin: {
      enabled: true,
      username: APP.channel.username,
      title: APP.channel.title,
      url: APP.channel.url,
      verify: true,
    },
    extraJoins: [],
    points: {
      dailyMin: 1,
      dailyMax: 3,
      streakEveryDays: 3,
      streakBonus: 1,
      maxStreakBonus: 3,
      refJoin: 3,
      refActive: 2,
      wheelCooldownHours: 12,
      wheelExtraPerRefs: 3,
      shareBonus: 1,
    },
    features: {
      daily: true,
      wheel: true,
      leaderboard: true,
      referrals: true,
      tasks: true,
      shop: true,
      contests: true,
    },
    texts: {
      startTitle: "مرحبًا بك في مسابقات MX",
      startBody:
        "هنا تجمع النقاط من الإحالات والهدية اليومية والعجلة… ثم تستبدلها بجوائز حقيقية (Netflix، Google Play، Coinbase، وحتى بوت + موقع خاص بك).",
      startButton: "🚀 افتح القائمة",
      startMedia: "",
      rules:
        "1) لا حسابات وهمية — الإحالة الوهمية تُلغى ويُحظر صاحبها.\n2) كل جائزة تُسلّم بعد مراجعة الأدمن.\n3) النقاط تُحفظ في حسابك ولا تنتهي.\n4) احترام الأعضاء إلزامي.",
      support: "للتواصل والاستفسار: راسل الأدمن من داخل البوت ثم زر «الدعم».",
      shareText: "🔥 انضم إلى مسابقات MX واجمع النقاط وحوّلها إلى جوائز حقيقية!",
    },
    admin: { notifyOnJoin: true, notifyOnRedeem: true, adminChatId: "" },
    security: {
      minAccountAgeDays: 0,
      antiSpam: true,
      blockSelfReferral: true,
      requireJoinForRewards: true,
    },
    ai: { enabled: true, provider: "auto", model: "", autoApply: true, apiKey: "", apiBase: "" },
  };
}

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

export function defaultRewards(): Reward[] {
  const r = (
    emoji: string,
    title: string,
    cost: number,
    desc: string,
    delivery: string,
    order: number,
    stock: number | null = null
  ): Reward => ({
    id: rid("rw"),
    emoji,
    title,
    desc,
    cost,
    stock,
    active: true,
    delivery,
    order,
  });
  return [
    r("🎬", "نتفليكس", 20, "حساب Netflix لمدة شهر", "يُرسل الحساب في الخاص بعد الموافقة.", 1),
    r("💳", "Google Play 1", 35, "بطاقة Google Play", "كود البطاقة يُرسل في الخاص.", 2),
    r("💳", "Google Play 2", 35, "بطاقة Google Play (باقة ثانية)", "كود البطاقة يُرسل في الخاص.", 3),
    r("₿", "Coinbase 1", 75, "حساب Coinbase موثّق", "بيانات الحساب في الخاص بعد الموافقة.", 4),
    r("₿", "Coinbase 2", 65, "حساب Coinbase ثانٍ", "بيانات الحساب في الخاص بعد الموافقة.", 5),
    r("🤖", "بوت + موقع خاص بك", 100, "بوت تيليجرام + لوحة تحكم + استضافة", "يتم التنسيق معك لإنشاء مشروعك كاملًا.", 6),
  ];
}

export function defaultTasks(): Task[] {
  return [
    {
      id: rid("tk"),
      emoji: "📣",
      title: `اشترك في قناة ${APP.channel.title}`,
      type: "channel",
      target: `@${APP.channel.username}`,
      points: 2,
      active: true,
      repeat: "once",
      order: 1,
    },
    {
      id: rid("tk"),
      emoji: "🔗",
      title: "شارك رابط الإحالة الخاص بك",
      type: "custom",
      target: "",
      points: 1,
      active: true,
      repeat: "daily",
      order: 2,
    },
  ];
}

export function defaultWheel(): WheelSlice[] {
  return [
    { label: "1 نقطة", points: 1, weight: 30 },
    { label: "2 نقاط", points: 2, weight: 25 },
    { label: "3 نقاط", points: 3, weight: 18 },
    { label: "5 نقاط", points: 5, weight: 12 },
    { label: "7 نقاط", points: 7, weight: 8 },
    { label: "10 نقاط", points: 10, weight: 4 },
    { label: "حظ أوفر", points: 0, weight: 2 },
    { label: "5 نقاط", points: 5, weight: 1 },
  ];
}

export function freshDB(now = new Date().toISOString()): DB {
  return {
    version: 1,
    bootedAt: now,
    updatedAt: now,
    settings: defaultSettings(),
    users: {},
    tasks: defaultTasks(),
    rewards: defaultRewards(),
    claims: [],
    contests: [
      {
        id: rid("ct"),
        title: "🏆 مسابقة MX الكبرى",
        desc: "اجمع أكبر عدد من النقاط خلال الأسبوع. أفضل 3 متصدرين يحصلون على جوائز إضافية!",
        prize: "🎁 جائزة إضافية لأول 3 مراكز",
        winnersCount: 3,
        endsAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        status: "active",
      },
    ],
    wheel: defaultWheel(),
    events: [],
    activity: [],
    logs: [],
    broadcasts: [],
    admins: [],
    counters: {
      visits: 0,
      visitsToday: 0,
      visitsDay: now.slice(0, 10),
      botStarts: 0,
      messages: 0,
      pointsGiven: 0,
      pointsSpent: 0,
      referrals: 0,
      dailyClaims: 0,
      wheelSpins: 0,
      rewardsDelivered: 0,
    },
    meta: {},
    files: [],
  };
}

/** يضمن أن الوثيقة القديمة تحتوي كل الحقول الجديدة بعد أي تحديث للنسخة */
export function migrate(db: Partial<DB> | null | undefined): DB {
  const base = freshDB();
  if (!db || typeof db !== "object") return base;
  const out: DB = {
    ...base,
    ...db,
    settings: { ...base.settings, ...(db.settings ?? {}) },
    counters: { ...base.counters, ...(db.counters ?? {}) },
    meta: { ...base.meta, ...(db.meta ?? {}) },
  } as DB;
  out.settings.points = { ...base.settings.points, ...(db.settings?.points ?? {}) };
  out.settings.features = { ...base.settings.features, ...(db.settings?.features ?? {}) };
  out.settings.texts = { ...base.settings.texts, ...(db.settings?.texts ?? {}) };
  out.settings.security = { ...base.settings.security, ...(db.settings?.security ?? {}) };
  out.settings.admin = { ...base.settings.admin, ...(db.settings?.admin ?? {}) };
  out.settings.ai = { ...base.settings.ai, ...(db.settings?.ai ?? {}) };
  out.settings.forceJoin = { ...base.settings.forceJoin, ...(db.settings?.forceJoin ?? {}) };
  // ⚠️ users كائن (Record) وليس مصفوفة — كان الشرط السابق يمحو كل الأعضاء
  // عند كل قراءة من التخزين (وهو سبب ضياع النقاط). الآن نتحقق أنه كائن فعلًا.
  if (!out.users || typeof out.users !== "object" || Array.isArray(out.users)) {
    out.users = {};
  } else {
    // تنظيف أي قيم تالفة دون المساس بالأعضاء الصحيحين
    for (const [k, v] of Object.entries(out.users)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) delete out.users[k];
    }
  }
  out.tasks = Array.isArray(out.tasks) ? out.tasks : base.tasks;
  out.rewards = Array.isArray(out.rewards) && out.rewards.length ? out.rewards : base.rewards;
  out.wheel = Array.isArray(out.wheel) && out.wheel.length ? out.wheel : base.wheel;
  out.claims = Array.isArray(out.claims) ? out.claims : [];
  out.contests = Array.isArray(out.contests) ? out.contests : base.contests;
  out.events = Array.isArray(out.events) ? out.events : [];
  out.activity = Array.isArray(out.activity) ? out.activity : [];
  out.logs = Array.isArray(out.logs) ? out.logs : [];
  out.broadcasts = Array.isArray(out.broadcasts) ? out.broadcasts : [];
  out.admins = Array.isArray(out.admins) ? out.admins : [];
  out.files = Array.isArray(out.files) ? out.files : [];
  return out;
}
