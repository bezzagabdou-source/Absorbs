import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

/** تحميل بسيط لملف .env بدون أي اعتماديات خارجية */
function loadEnvFile(file) {
  try {
    if (!fs.existsSync(file)) return;
    const text = fs.readFileSync(file, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* ignore */
  }
}

loadEnvFile(path.join(ROOT, ".env"));

const str = (k, d = "") => (process.env[k] ?? d).toString().trim();
const int = (k, d) => {
  const n = Number.parseInt(str(k), 10);
  return Number.isFinite(n) ? n : d;
};
const bool = (k, d = false) => {
  const v = str(k).toLowerCase();
  if (!v) return d;
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

export const config = {
  root: ROOT,
  env: process.env.NODE_ENV || "development",
  demo: bool("DEMO", false),
  port: int("PORT", 8080),
  host: str("HOST", "0.0.0.0"),

  botToken: str("BOT_TOKEN"),
  botUsername: str("BOT_USERNAME").replace(/^@/, ""),
  webhookSecret: str("WEBHOOK_SECRET"),
  publicUrl: str("PUBLIC_URL").replace(/\/+$/, ""),

  adminIds: str("ADMIN_IDS")
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0),

  dashboardPassword: str("DASHBOARD_PASSWORD"),
  sessionSecret: str("SESSION_SECRET"),

  dbPath: str("DB_PATH") || path.join(ROOT, "data", "barq.db"),
  avatarDir: path.join(ROOT, "data", "avatars"),

  protectionLevel: (str("PROTECTION_LEVEL", "max") || "max").toLowerCase(),

  ai: {
    openrouterKeys: str("OPENROUTER_API_KEY"),
    xaiKeys: str("XAI_API_KEY") || str("GROK_API_KEY"),
    model: str("AI_MODEL", "x-ai/grok-4"),
    modelGrok: str("AI_MODEL_GROK", "grok-4"),
    enabled: true,
  },

  telegram: {
    apiBase: "https://api.telegram.org",
    msgPerSec: int("TG_MSG_PER_SEC", 22),
    perChatMs: int("TG_PER_CHAT_MS", 1200),
    concurrency: int("TG_CONCURRENCY", 8),
    maxRetries: int("TG_MAX_RETRIES", 4),
    broadcastPerSec: int("BROADCAST_PER_SEC", 18),
  },
};

export function assertProduction() {
  const problems = [];
  if (!config.demo) {
    if (!config.botToken) problems.push("BOT_TOKEN غير مضبوط");
    if (!config.webhookSecret || config.webhookSecret.length < 16)
      problems.push("WEBHOOK_SECRET لازم 16 حرف على الأقل");
    if (!config.publicUrl || !/^https:\/\//.test(config.publicUrl))
      problems.push("PUBLIC_URL لازم يبدأ بـ https://");
  }
  if (!config.dashboardPassword) problems.push("DASHBOARD_PASSWORD غير مضبوط");
  if (!config.sessionSecret) problems.push("SESSION_SECRET غير مضبوط");
  return problems;
}

export const isAdmin = (tgId) => config.adminIds.includes(Number(tgId));
