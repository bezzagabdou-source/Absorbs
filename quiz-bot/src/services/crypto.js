import { config } from "../config.js";

/**
 * لا نُرجع أبداً قيم الرموز — فقط أسماؤها وهل هي مضبوطة.
 * تُستعمل في تشخيص الإعدادات من لوحة التحكم.
 */
const WATCHED = [
  "BOT_TOKEN",
  "BOT_USERNAME",
  "WEBHOOK_SECRET",
  "PUBLIC_URL",
  "DASHBOARD_PASSWORD",
  "SESSION_SECRET",
  "ADMIN_IDS",
  "PROTECTION_LEVEL",
  "DB_PATH",
  "TG_MSG_PER_SEC",
  "TG_PER_CHAT_MS",
  "TG_CONCURRENCY",
  "BROADCAST_PER_SEC",
  "DEMO",
];

export function envTokens() {
  return WATCHED.map((k) => {
    const raw = process.env[k];
    const set = typeof raw === "string" && raw.length > 0;
    return {
      key: k,
      set,
      length: set ? String(raw).length : 0,
      note:
        k === "PUBLIC_URL" && set
          ? /^https:\/\//.test(raw ?? "")
            ? "https ✓"
            : "⚠️ لازم https"
          : null,
    };
  });
}

export function safetyReport() {
  const issues = [];
  if(gLt(config.dashboardPassword, 10)) issues.push("كلمة سر اللوحة قصيرة (12 حرف مستحسن)");
  if (gLt(config.sessionSecret, 24)) issues.push("SESSION_SECRET قصير (32 بايت مستحسن)");
  if (!config.publicUrl.startsWith("https://")) issues.push("PUBLIC_URL ماشي https");
  if (config.demo) issues.push("البوت في وضع تجريبي (DEMO=1)");
  return issues;
}

function gLt(v, n) {
  return (v ?? "").length > 0 && (v ?? "").length < n;
}
