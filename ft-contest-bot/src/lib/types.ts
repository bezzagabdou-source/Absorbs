export type ContestStatus = "draft" | "active" | "ended";

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
  supportUsername: string;
  /** قناة/شات تُرسل إليه سجلات الفوز (اختياري) */
  logChatId: string;
  /** آي دي الأدمن اللي يستقبلون إشعارات الفوز */
  adminIds: string[];
  requireJoin: boolean;
  /** تسليم الحساب تلقائياً لحظة إكمال الهدف */
  autoGrant: boolean;
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

export const DEFAULT_SETTINGS: Settings = {
  botToken: "",
  botUsername: "",
  botId: null,
  channelChat: "",
  channelUrl: "",
  supportUsername: "",
  logChatId: "",
  adminIds: [],
  requireJoin: false,
  autoGrant: false,
  welcomeText:
    "🏆 <b>أهلاً {name}</b> في بوت مسابقات FT\n\nهنا تربح حسابات مجانية بجهدك فقط:\n🎯 كل مسابقة لها عدد <b>جهات</b> مطلوب\n🥇 أوّل من يكمّل العدد يربح الحساب فوراً\n\nاختر من الأزرار 👇",
  rulesText:
    "📜 <b>شروط المشاركة</b>\n\n1️⃣ كل شخص جديد يدخل من رابطك = جهة واحدة\n2️⃣ لا يُحسب الحساب الوهمي أو المكرر\n3️⃣ لا يُحسب من يدخل من رابطك ثم يخرج فوراً\n4️⃣ الجائزة تُسلَّم لأول من يكمل العدد المطلوب\n5️⃣ ممنوع استخدام أكثر من حساب للمشاركة\n6️⃣ الإدارة تحقّق من الجهات قبل التسليم عند الشك\n\nبالتوفيق 🍀",
  webhookSecret: "",
};
