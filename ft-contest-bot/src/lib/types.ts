export type ContestStatus = "draft" | "active" | "ended";

/**
 * طريقة حساب الجهات:
 *  - referral: كل شخص يفتح رابط البوت = جهة
 *  - group:    كل شخص يدخل المجموعة من رابطك = جهة (مسابقة أسرع ضيف)
 */
export type ContestMode = "referral" | "group";

export type Contest = {
  id: string;
  title: string;
  description: string;
  /** عدد الجهات المطلوب للفوز */
  target: number;
  /** وصف الجائزة */
  prize: string;
  status: ContestStatus;
  /** كم فائز مسموح في المسابقة */
  winners: number;
  /** طريقة الحساب (افتراضياً رابط البوت) */
  mode?: ContestMode;
  /** صورة المسابقة: data:image/... أو رابط https */
  imageUrl?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
};

export type Settings = {
  botToken: string;
  botUsername: string;
  botId: number | null;
  /** معرف القناة المطلوب الاشتراك فيها (@username أو -100...) — قناة واحدة (قديمة) */
  channelChat: string;
  channelUrl: string;
  /** القنوات المطلوبة كلها (@username أو -100...) — الاشتراك فيها إجباري لاستعمال البوت */
  requiredChannels: string[];
  /** يوزر الدعم (افتراضياً المالك) */
  supportUsername: string;
  /** يوزر المالك — يظهر في البوت واللوحة */
  ownerUsername: string;
  /** قناة/شات تُرسل إليه سجلات الفوز (اختياري) */
  logChatId: string;
  /** آي دي الأدمن اللي يستقبلون إشعارات الفوز */
  adminIds: string[];
  requireJoin: boolean;
  /** إصدار بوابة الاشتراك — من ترقية 2 كيولي إجباري مرة واحدة (بعدها كيفما المالك يختار) */
  gateV?: number;
  /** 🚫 اختيار المالك الصريح بخصوص بوابة القنوات (الافتراضي: مطفية) */
  gateOn?: boolean;
  /** تسليم الحساب تلقائياً لحظة إكمال الهدف */
  autoGrant: boolean;
  /** مجموعة أسرع ضيف المربوطة بالبوت */
  groupChat: string;
  groupTitle: string;
  groupUrl: string;
  /** قبول طلبات الانضمام للمجموعة تلقائياً */
  autoApproveJoins: boolean;
  /** هدف مسابقة أسرع ضيف الافتراضي عند ربط مجموعة */
  groupTarget: number;
  /** المساعد الذكي في البوت */
  aiEnabled: boolean;
  /** موديل مخصص (اختياري) */
  aiModel: string;
  /** 🛠️ وضع الصيانة: البوت يعتذر بلطف بدل ما يخدم */
  maintenanceMode?: boolean;
  welcomeText: string;
  rulesText: string;
  webhookSecret: string;
};

export type BotUser = {
  id: string;
  firstName: string;
  username: string;
  joinedAt: number;
};

export type Claim = {
  contestId: string;
  contestTitle: string;
  userId: string;
  userName: string;
  email: string;
  password: string;
  at: number;
};

/** رسالة الترحيب — كيما النسخة القديمة (اسم + نقاط + شرح الإحالة) */
export const WELCOME_TEXT = [
  "👋 أهلاً {name}!",
  "",
  "شارك رابط الإحالة الخاص بك مع أصدقائك،",
  "كل إحالة = نقطة، ثم استبدل نقاطك بجوائز المسابقات 🎁",
  "",
  `💰 نقاطك: {points}`,
].join("\n");

export const OWNER_USERNAME = "F_Y_Y_T";

/** كل 100 جهة = نقطة واحدة، و3 نقاط = جائزة عشوائية من المالك */
/** كم جهة خاصة بيدّ نقطة واحدة (قابل للتغيير بـ POINTS_STEP في متغيّرات البيئة) */
export const POINTS_STEP = Math.max(1, Number(process.env.POINTS_STEP) || 100);
/** الحد الأقصى ديال نقاط الإحالة */
export const POINTS_MAX = Math.max(1, Number(process.env.POINTS_MAX) || 3);

export const DEFAULT_SETTINGS: Settings = {
  botToken: "",
  botUsername: "",
  botId: null,
  channelChat: "",
  channelUrl: "",
  requiredChannels: ["@F_5_5_T", "@Ft_efootbal", "@F_M_M_T"],
  supportUsername: OWNER_USERNAME,
  ownerUsername: OWNER_USERNAME,
  logChatId: "",
  adminIds: [],
  requireJoin: false,
  autoGrant: false,
  groupChat: "",
  groupTitle: "",
  groupUrl: "",
  autoApproveJoins: true,
  groupTarget: 20,
  aiEnabled: true,
  aiModel: "",
  welcomeText: WELCOME_TEXT,
  rulesText: "📜 <b>الشروط</b>\n\n1️⃣ كل شخص جديد من رابطك = جهة\n2️⃣ ممنوع الحسابات الوهمية\n3️⃣ أول من يوصل الهدف يربح\n\nبالتوفيق 🍀",
  webhookSecret: "",
};
