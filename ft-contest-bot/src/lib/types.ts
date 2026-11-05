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
  /** معرف القناة المطلوب الاشتراك فيها (@username أو -100...) */
  channelChat: string;
  channelUrl: string;
  /** يوزر الدعم (افتراضياً المالك) */
  supportUsername: string;
  /** يوزر المالك — يظهر في البوت واللوحة */
  ownerUsername: string;
  /** قناة/شات تُرسل إليه سجلات الفوز (اختياري) */
  logChatId: string;
  /** آي دي الأدمن اللي يستقبلون إشعارات الفوز */
  adminIds: string[];
  requireJoin: boolean;
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

/** رسالة الترحيب القصيرة — نص واحد فقط كما طلب المالك */
export const WELCOME_TEXT = "مرحبا بكم في بوت مسابقات FT";

export const OWNER_USERNAME = "F_Y_Y_T";

export const DEFAULT_SETTINGS: Settings = {
  botToken: "",
  botUsername: "",
  botId: null,
  channelChat: "",
  channelUrl: "",
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
  welcomeText: WELCOME_TEXT,
  rulesText: "📜 <b>الشروط</b>\n\n1️⃣ كل شخص جديد من رابطك = جهة\n2️⃣ ممنوع الحسابات الوهمية\n3️⃣ أول من يوصل الهدف يربح\n\nبالتوفيق 🍀",
  webhookSecret: "",
};
