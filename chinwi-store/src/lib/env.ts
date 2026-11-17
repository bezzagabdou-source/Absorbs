/**
 * env.ts — كل متغيرات البيئة في مكان واحد.
 * لا تُستخدم القيم الحساسة في الواجهة الأمامية إطلاقاً (server only).
 */

const clean = (v: string | undefined): string =>
  String(v ?? "")
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/\s+#.*$/, "");

/** رابط قاعدة البيانات (Neon / Supabase / أي Postgres) مع تنظيف معاملات غير مدعومة */
export function databaseUrl(): string {
  let url = clean(process.env.DATABASE_URL) || clean(process.env.POSTGRES_URL);
  if (!url) return "";
  // pg لا يفهم channel_binding بشكل موثوق → نزيله
  url = url.replace(/([?&])channel_binding=[^&]*/g, "$1").replace(/[?&]$/, "");
  if (!/[?&]sslmode=/.test(url)) url += (url.includes("?") ? "&" : "?") + "sslmode=require";
  return url;
}

export const env = {
  get botToken() {
    return clean(process.env.TELEGRAM_BOT_TOKEN) || clean(process.env.BOT_TOKEN);
  },
  get webhookSecret() {
    return clean(process.env.TELEGRAM_WEBHOOK_SECRET) || "chinwi-hook-2026";
  },
  get adminSecret() {
    return clean(process.env.ADMIN_SECRET) || "chinwi-panel-secret-2026";
  },
  get adminPassword() {
    return clean(process.env.ADMIN_PASSWORD) || "ChinwiStore@2026";
  },
  get ownerUsername() {
    return (clean(process.env.OWNER_USERNAME) || "F_Q_Q_T").replace(/^@/, "");
  },
  get ownerChatId() {
    const n = Number(clean(process.env.OWNER_CHAT_ID));
    return Number.isFinite(n) && n > 0 ? n : 0;
  },
  get siteUrl() {
    return (
      clean(process.env.NEXT_PUBLIC_SITE_URL) ||
      clean(process.env.SITE_URL) ||
      (clean(process.env.VERCEL_PROJECT_PRODUCTION_URL)
        ? `https://${clean(process.env.VERCEL_PROJECT_PRODUCTION_URL)}`
        : "") ||
      (clean(process.env.VERCEL_URL) ? `https://${clean(process.env.VERCEL_URL)}` : "") ||
      "http://localhost:3000"
    ).replace(/\/$/, "");
  },
  get geminiKey() {
    return clean(process.env.GEMINI_API_KEY) || clean(process.env.GOOGLE_API_KEY);
  },
  get groqKey() {
    return clean(process.env.GROQ_API_KEY);
  },
  get grokKey() {
    return clean(process.env.XAI_API_KEY) || clean(process.env.GROK_API_KEY);
  },
  get openrouterKey() {
    return clean(process.env.OPENROUTER_API_KEY);
  },
  get aiModel() {
    return clean(process.env.AI_MODEL);
  },
  isVercel() {
    return Boolean(process.env.VERCEL);
  },
};
