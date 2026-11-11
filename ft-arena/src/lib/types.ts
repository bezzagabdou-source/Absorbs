/**
 * مسابقات MX — أنواع البيانات المركزية
 * كل شيء يُحفظ في وثيقة JSON واحدة (Redis أو Blob) لسرعة فائقة وبساطة تشغيل.
 */

export type Lang = "ar" | "fr" | "en";

export type PointsKind = "earn" | "spend" | "admin" | "daily" | "ref" | "wheel" | "task" | "prize";

export interface LedgerEntry {
  at: string;
  delta: number;
  kind: PointsKind;
  note: string;
}

export interface User {
  id: number;
  username?: string;
  firstName: string;
  lastName?: string;
  /** صورة الحساب (file_id من تيليجرام) — تُستخدم في إشعار الإحالة */
  photo?: string;
  lang: Lang;
  points: number;
  totalEarned: number;
  totalSpent: number;
  joinedAt: string;
  lastSeenAt: string;
  /** من دعاه */
  refBy?: number;
  refCode: string;
  /** عدد من دخلوا برابطه */
  refCount: number;
  /** من دخلوا وفعّلوا (حصلوا على الهدية) — إحالات مؤكدة */
  refActive: number;
  refBonusGiven: boolean;
  daily: { lastAt?: string; streak: number; count: number };
  wheel: { lastAt?: string; spins: number; extra: number };
  tasks: Record<string, string>;
  history: LedgerEntry[];
  banned: boolean;
  banReason?: string;
  vip: boolean;
  note?: string;
  /** member | left — بناءً على تحديثات تيليجرام */
  status: "member" | "left";
  messages: number;
  /** إشعار الأدمن عند الدخول */
  adminNotified?: boolean;
  source?: string;
  lastDailyAt?: string;
  /** آخر تنبيه «انضم للقناة» (مرة واحدة يوميًا) — يُرسل فقط عند تعذّر التحقق */
  lastJoinNudge?: string;
}

export interface Task {
  id: string;
  emoji: string;
  title: string;
  /** channel = اشتراك إجباري بقناة، link = زيارة رابط، custom = يدوي */
  type: "channel" | "link" | "custom";
  /** @username للقناة أو الرابط */
  target: string;
  points: number;
  active: boolean;
  /** مرة واحدة فقط أو يوميًا */
  repeat: "once" | "daily";
  order: number;
}

export interface Reward {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  cost: number;
  stock: number | null; // null = غير محدود
  image?: string;
  active: boolean;
  /** طريقة التسليم التي تظهر للمستخدم */
  delivery: string;
  order: number;
}

export interface Claim {
  id: string;
  code: string;
  userId: number;
  userName: string;
  rewardId: string;
  rewardTitle: string;
  cost: number;
  status: "pending" | "approved" | "rejected" | "delivered";
  createdAt: string;
  decidedAt?: string;
  adminNote?: string;
}

export interface Contest {
  id: string;
  title: string;
  desc: string;
  prize: string;
  winnersCount: number;
  endsAt: string;
  status: "active" | "ended";
  /** صورة/بانر المسابقة (رابط مباشر أو Blob) */
  image?: string;
  /** زر إضافي في بطاقة المسابقة داخل البوت */
  buttonLabel?: string;
  buttonUrl?: string;
  winners?: { userId: number; name: string; points: number }[];
}

export interface WheelSlice {
  label: string;
  points: number;
  weight: number;
}

export interface ForceJoin {
  enabled: boolean;
  username: string;
  title: string;
  url: string;
  /** إظهار تحقق حقيقي عبر getChatMember */
  verify: boolean;
}

export interface Settings {
  botVersion: string;
  botEnabled: boolean;
  maintenanceText: string;
  botName: string;
  brandEmoji: string;
  lang: Lang;
  forceJoin: ForceJoin;
  extraJoins: ForceJoin[];
  points: {
    dailyMin: number;
    dailyMax: number;
    streakEveryDays: number;
    streakBonus: number;
    maxStreakBonus: number;
    refJoin: number;
    refActive: number;
    wheelCooldownHours: number;
    wheelExtraPerRefs: number;
    shareBonus: number;
  };
  features: {
    daily: boolean;
    wheel: boolean;
    leaderboard: boolean;
    referrals: boolean;
    tasks: boolean;
    shop: boolean;
    contests: boolean;
  };
  texts: {
    startTitle: string;
    startBody: string;
    startButton: string;
    startMedia?: string;
    welcomeSticker?: string;
    rules: string;
    support: string;
    shareText: string;
  };
  admin: {
    notifyOnJoin: boolean;
    notifyOnRedeem: boolean;
    adminChatId?: string;
  };
  security: {
    minAccountAgeDays: number;
    antiSpam: boolean;
    blockSelfReferral: boolean;
    requireJoinForRewards: boolean;
  };
  ai: {
    enabled: boolean;
    provider: string;
    model: string;
    autoApply: boolean;
    /** مفتاح يُحفظ من اللوحة (يُستخدم مباشرة دون إعادة نشر) */
    apiKey?: string;
    /** رابط أساس مخصّص لأي مزوّد متوافق مع OpenAI */
    apiBase?: string;
  };
  maintenance: boolean;
}

export interface AnalyticsEvent {
  at: string;
  type: "start" | "visit" | "ref" | "daily" | "spin" | "task" | "redeem" | "msg" | "share";
  userId?: number;
  meta?: string;
}

export interface Broadcast {
  id: string;
  text: string;
  image?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  createdAt: string;
  status: "draft" | "sending" | "done";
  sent: number;
  failed: number;
  audience: "all" | "active" | "inactive" | "vip" | "withPoints";
}

export interface ActivityItem {
  at: string;
  actor: "admin" | "bot" | "ai" | "system" | "user";
  title: string;
  detail?: string;
  icon?: string;
}

export interface LogEntry {
  at: string;
  prompt: string;
  reply: string;
  provider: string;
  actions: { name: string; ok: boolean; detail?: string }[];
}

export interface DB {
  version: number;
  bootedAt: string;
  updatedAt: string;
  settings: Settings;
  users: Record<string, User>;
  tasks: Task[];
  rewards: Reward[];
  claims: Claim[];
  contests: Contest[];
  wheel: WheelSlice[];
  events: AnalyticsEvent[];
  activity: ActivityItem[];
  logs: LogEntry[];
  broadcasts: Broadcast[];
  admins: { passwordHash?: string; passwordSalt?: string; createdAt?: string }[];
  counters: {
    visits: number;
    visitsToday: number;
    visitsDay: string;
    botStarts: number;
    messages: number;
    pointsGiven: number;
    pointsSpent: number;
    referrals: number;
    dailyClaims: number;
    wheelSpins: number;
    rewardsDelivered: number;
  };
  meta: { webhookUrl?: string; webhookAt?: string; lastError?: string; setupAt?: string; botUsername?: string; botName?: string; botId?: number; joinUnverifiable?: boolean };
  files: { name: string; url: string; size: number; at: string; type: string }[];
}
