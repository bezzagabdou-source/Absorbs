/**
 * run-local.mjs — يشغّل بيئة تطوير كاملة محلياً بدون أي خدمة خارجية:
 *   1) قاعدة Postgres داخل العملية (PGlite) على 5432
 *   2) سيرفر تيليجرام وهمي على 4001
 *   3) Next.js على 3100
 *
 * التشغيل: npm run dev:all
 * (مرّة واحدة: cd scripts/dev && npm install)
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

// التقط ذاكرة «المهندس AI» قبل الإقلاع
try {
  const { spawnSync } = await import("node:child_process");
  spawnSync(process.execPath, ["scripts/gen-codebase.mjs"], { cwd: root, stdio: "inherit" });
} catch (err) {
  console.warn("[gen-codebase] تعذّر توليده:", err);
}

const preflight = path.join(root, "scripts/dev/node_modules/@electric-sql/pglite");

if (!existsSync(preflight)) {
  console.error("⚠️  ثبّت أدوات الاختبار أولاً:  cd scripts/dev && npm install");
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres@127.0.0.1:5432/postgres?sslmode=disable",
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "424242:TESTTOKEN",
  TELEGRAM_API_BASE: "http://127.0.0.1:4001",
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || "testsecret",
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3100",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "TestPass123",
  OWNER_CHAT_ID: process.env.OWNER_CHAT_ID || "777",
  OWNER_USERNAME: process.env.OWNER_USERNAME || "F_Q_Q_T",
  ADMIN_SECRET: process.env.ADMIN_SECRET || "test-admin-secret",
  DB_POOL_MAX: "2",
  DB_IDLE_TIMEOUT: "0",
};

const children = [];
function run(name, command, args, cwd = root, wait = 0) {
  const child = spawn(command, args, { cwd, env, stdio: "inherit" });
  child.on("exit", (code) => console.log(`[${name}] خرج بالرمز ${code}`));
  children.push(child);
  if (wait) return new Promise((r) => setTimeout(r, wait));
  return Promise.resolve();
}

console.log("▶️  تشغيل قاعدة البيانات المحلية…");
await run("db", process.execPath, ["scripts/dev/mock-db.mjs"], root, 4000);
console.log("▶️  تشغيل تيليجرام الوهمي…");
await run("telegram", process.execPath, ["scripts/mock-telegram.mjs"], root, 800);
console.log("▶️  تشغيل Next.js على http://127.0.0.1:3100 …");
await run("next", "npx", ["next", "dev", "-p", "3100"]);

console.log(`
┌────────────────────────────────────────────┐
│  المتجر:      http://127.0.0.1:3100        │
│  لوحة التحكم: http://127.0.0.1:3100/admin  │
│  كلمة السر:  ${env.ADMIN_PASSWORD.padEnd(20)}│
│  اختبار E2E:  npm run test:e2e             │
└────────────────────────────────────────────┘`);

const shutdown = () => {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
