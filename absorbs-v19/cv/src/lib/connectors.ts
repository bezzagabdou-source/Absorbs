/**
 * Nexus AI v15 — CONNECTORS
 * =============================================================================
 * "زيد زر كونيكتور ربط بتطبيقات اهم تطبيقات"
 *
 * A registry of the apps Nexus can link to, the scopes each needs, and the
 * capability each unlocks inside the chat. The UI reads this; the OAuth round
 * trip lives in /api/connectors/[id] and only runs when the deployment ships
 * the matching client id + secret, so a keyless build degrades to "غير مُهيّأ"
 * instead of a broken button.
 *
 * Isomorphic — no node imports.
 */

export type ConnectorId =
  | "google-drive"
  | "gmail"
  | "google-calendar"
  | "github"
  | "notion"
  | "slack"
  | "dropbox"
  | "whatsapp"
  | "telegram"
  | "x"
  | "instagram"
  | "linkedin";

export type ConnectorCategory = "ملفات" | "تواصل" | "عمل" | "تواصل اجتماعي";

export interface Connector {
  id: ConnectorId;
  name: string;
  /** Arabic one-liner shown under the name. */
  blurb: string;
  category: ConnectorCategory;
  /** Brand colour for the tile. */
  tone: string;
  /** Single-letter / short mark used when no logo is available offline. */
  mark: string;
  /** What the assistant gains once this is linked. */
  capabilities: string[];
  /** Env var that must exist server-side for the connector to be live. */
  envKey: string;
  /** OAuth scopes requested. */
  scopes: string[];
}

export const CONNECTORS: Connector[] = [
  {
    id: "google-drive",
    name: "Google Drive",
    blurb: "اقرأ ملفاتك وحمّلها مباشرة فالمحادثة",
    category: "ملفات",
    tone: "#1a73e8",
    mark: "D",
    capabilities: ["قراءة مستند", "تلخيص PDF", "رفع ملف منشأ", "بحث فالملفات"],
    envKey: "GOOGLE_CLIENT_ID",
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  },
  {
    id: "gmail",
    name: "Gmail",
    blurb: "لخّص بريدك واكتب ردود جاهزة",
    category: "تواصل",
    tone: "#ea4335",
    mark: "M",
    capabilities: ["تلخيص الوارد", "صياغة رد", "بحث فالبريد"],
    envKey: "GOOGLE_CLIENT_ID",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    blurb: "شوف مواعيدك وزيد اجتماعات",
    category: "عمل",
    tone: "#34a853",
    mark: "C",
    capabilities: ["قراءة الأجندة", "إنشاء موعد", "اقتراح وقت فاضي"],
    envKey: "GOOGLE_CLIENT_ID",
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  },
  {
    id: "github",
    name: "GitHub",
    blurb: "اقرأ الريبو، راجع الكود، وافتح PR",
    category: "عمل",
    tone: "#f0f6fc",
    mark: "G",
    capabilities: ["قراءة ريبو", "مراجعة كود", "فتح issue", "دفع ملفات اللعبة"],
    envKey: "GITHUB_CLIENT_ID",
    scopes: ["repo", "read:user"],
  },
  {
    id: "notion",
    name: "Notion",
    blurb: "اكتب ونظّم ملاحظاتك",
    category: "عمل",
    tone: "#ffffff",
    mark: "N",
    capabilities: ["إنشاء صفحة", "قراءة قاعدة بيانات", "تحديث ملاحظة"],
    envKey: "NOTION_CLIENT_ID",
    scopes: ["read_content", "update_content", "insert_content"],
  },
  {
    id: "slack",
    name: "Slack",
    blurb: "لخّص القنوات وابعث رسائل",
    category: "تواصل",
    tone: "#4a154b",
    mark: "S",
    capabilities: ["تلخيص قناة", "إرسال رسالة", "تذكير الفريق"],
    envKey: "SLACK_CLIENT_ID",
    scopes: ["channels:history", "chat:write"],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    blurb: "خزّن ملفاتك المنشأة تلقائيًا",
    category: "ملفات",
    tone: "#0061ff",
    mark: "B",
    capabilities: ["رفع ملف", "قراءة مجلّد", "مشاركة رابط"],
    envKey: "DROPBOX_CLIENT_ID",
    scopes: ["files.content.write", "files.content.read"],
  },
  {
    id: "telegram",
    name: "Telegram",
    blurb: "وصّل بوت وابعث نتائجك",
    category: "تواصل",
    tone: "#2aabee",
    mark: "T",
    capabilities: ["إرسال إشعار", "استقبال أمر", "مشاركة ملف"],
    envKey: "TELEGRAM_BOT_TOKEN",
    scopes: [],
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    blurb: "ردود آلية على زبائنك",
    category: "تواصل",
    tone: "#25d366",
    mark: "W",
    capabilities: ["رد آلي", "إرسال قالب", "سجلّ المحادثات"],
    envKey: "WHATSAPP_TOKEN",
    scopes: [],
  },
  {
    id: "x",
    name: "X (Twitter)",
    blurb: "اكتب وانشر خيوط",
    category: "تواصل اجتماعي",
    tone: "#1d1d1f",
    mark: "X",
    capabilities: ["صياغة منشور", "نشر خيط", "تحليل تفاعل"],
    envKey: "X_CLIENT_ID",
    scopes: ["tweet.read", "tweet.write", "users.read"],
  },
  {
    id: "instagram",
    name: "Instagram",
    blurb: "جدوِل منشوراتك وصورك",
    category: "تواصل اجتماعي",
    tone: "#e1306c",
    mark: "I",
    capabilities: ["جدولة منشور", "كتابة كابشن", "رفع صورة منشأة"],
    envKey: "INSTAGRAM_CLIENT_ID",
    scopes: ["instagram_basic", "instagram_content_publish"],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    blurb: "منشورات مهنية وسيرة ذاتية",
    category: "تواصل اجتماعي",
    tone: "#0a66c2",
    mark: "L",
    capabilities: ["كتابة منشور", "تحسين البروفايل", "رسالة توظيف"],
    envKey: "LINKEDIN_CLIENT_ID",
    scopes: ["w_member_social", "r_liteprofile"],
  },
];

export const CONNECTOR_CATEGORIES: ConnectorCategory[] = ["ملفات", "تواصل", "عمل", "تواصل اجتماعي"];

export function connectorById(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

/** Client-side link state. The token itself never touches localStorage. */
const KEY = "nexus_connectors_v1";

export interface ConnectorState {
  id: ConnectorId;
  linkedAt: number;
  account?: string;
}

export function loadConnectorStates(): Record<string, ConnectorState> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, ConnectorState>) : {};
  } catch {
    return {};
  }
}

export function setConnectorState(id: ConnectorId, state: ConnectorState | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    const all = loadConnectorStates();
    if (state) all[id] = state;
    else delete all[id];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore quota */
  }
}
