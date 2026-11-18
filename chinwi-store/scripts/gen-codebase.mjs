/**
 * gen-codebase.mjs — يبني «ذاكرة المهندس AI»: يلتقط كل ملفات الكود النصية للبوت
 * (src + السكريبتات + ملفات الإعداد) في وحدة src/lib/codebase.generated.ts
 * حتى تقدر صفحة المهندس AI داخل اللوحة تقرأ كود البوت كاملاً وتبرمجه.
 *
 * يُشغَّل تلقائياً قبل البناء/التطوير (prebuild/predev) — لا تُعدّل الملف الناتج يدوياً.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const INCLUDE_DIRS = ["src", "scripts", "public"];
const INCLUDE_FILES = [
  "package.json",
  "next.config.ts",
  "tsconfig.json",
  "vercel.json",
  "postcss.config.mjs",
  "drizzle.config.ts",
  ".env.example",
  ".gitignore",
];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".vercel", "dist", "build", "coverage", "Unselected files"]);
const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".mp4", ".webm", ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".zip", ".tar", ".gz", ".apk", ".pndbak", ".map"]);
const SKIP_NAMES = new Set(["codebase.generated.ts", "package-lock.json", "tsconfig.tsbuildinfo", "next-env.d.ts"]);
const MAX_FILE = 150 * 1024;

const TEXT_RE = new RegExp("^[^\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]*$");

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example" && entry.name !== ".gitignore") continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (SKIP_NAMES.has(entry.name)) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (SKIP_EXT.has(ext)) continue;
    let st;
    try { st = statSync(full); } catch { continue; }
    if (!st.isFile() || st.size > MAX_FILE) continue;
    let content;
    try { content = readFileSync(full, "utf8"); } catch { continue; }
    if (content.includes("\u0000")) continue;
    // نصوص فقط (يرفض الثنائيات المتسللة)
    if (content.length > 200 && !TEXT_RE.test(content.slice(0, 2000))) continue;
    out.push({ path: rel, content });
  }
}

const files = [];
for (const d of INCLUDE_DIRS) {
  try { walk(path.join(root, d), files); } catch { /* غير موجود محلياً */ }
}
for (const f of INCLUDE_FILES) {
  try {
    const full = path.join(root, f);
    const content = readFileSync(full, "utf8");
    files.push({ path: f, content });
  } catch { /* اختياري */ }
}

files.sort((a, b) => a.path.localeCompare(b.path));

const manifest = files.map((f) => ({
  path: f.path,
  lines: f.content.split("\n").length,
  bytes: Buffer.byteLength(f.content, "utf8"),
}));

const out =
  "// ملف مولّد تلقائياً بواسطة scripts/gen-codebase.mjs — لا تعدّله يدوياً\n" +
  "export type CodebaseFile = { path: string; content: string };\n" +
  "export const CODEBASE_MANIFEST = " + JSON.stringify(manifest) + " as const;\n" +
  "export const CODEBASE_FILES: Record<string, string> = " +
  JSON.stringify(Object.fromEntries(files.map((f) => [f.path, f.content]))) +
  ";\n";

const dest = path.join(root, "src/lib/codebase.generated.ts");
mkdirSync(path.dirname(dest), { recursive: true });
writeFileSync(dest, out);
const kb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(0);
console.log(`[gen-codebase] ${files.length} ملف (${kb} KB) → src/lib/codebase.generated.ts`);
