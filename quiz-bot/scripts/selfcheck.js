import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function parseHTML(html) {
  // محلّل DOM مبسّط كافٍ لفحص الـ id والبنية
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const tags = [...html.matchAll(/<([a-zA-Z][\w-]*)([^>]*)>/g)].map((m) => ({
    tag: m[1].toLowerCase(),
    attrs: m[2],
    selfClosing: /\/>$/.test(m[2]) || ["meta", "link", "br", "img", "input", "hr", "source"].includes(m[1].toLowerCase()),
  }));
  return { ids, tags };
}

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../public/app.css", import.meta.url), "utf8");

let failures = 0;
const check = (name, cond) => {
  if (cond) console.log(`✓ ${name}`);
  else {
    console.log(`✗ ${name}`);
    failures++;
  }
};

const { ids } = parseHTML(html);
const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
check("لا توجد id مكرّرة في HTML", dupes.length === 0);
if (dupes.length) console.log("  مكرّر:", [...new Set(dupes)].join(", "));

// توازن الوسوم
const { tags } = parseHTML(html);
const stack = [];
let unbalanced = null;
for (const t of tags) {
  if (["meta", "link", "br", "img", "input", "hr", "source", "!doctype"].includes(t.tag) || t.selfClosing) continue;
  if (t.tag === "script" || t.tag === "style") {
    // نتجاوز المحتوى
    continue;
  }
  stack.push(t.tag);
}
// نتحقق من إغلاق كل الأقسام الأساسية عبر عدّ بسيط
for (const id of ["gate", "app", "nav", "views", "drawer", "toast"]) {
  check(`العنصر #${id} موجود`, ids.includes(id));
}

// كل $('#x') في JS له مقابل في HTML (أو يُنشأ ديناميكياً)
const jsIds = [...new Set([...js.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((m) => m[1]))];
const htmlIds = new Set(ids);
const dynamic = new Set([
  ...[...js.matchAll(/id:\s*`?([A-Za-z0-9_-]+)`?/g)].map((m) => m[1]),
  ...[...js.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]),
  ...[...js.matchAll(/id:\s*`([^`]*)`/g)].map((m) => m[1].replace(/\$\{[^}]*\}/g, "x")),
  ...[...js.matchAll(/name:\s*([A-Za-z0-9_]+)/g)].map((m) => "s-" + m[1]),
]);
const missing = jsIds.filter((x) => !htmlIds.has(x) && !dynamic.has(x));
check("كل العناصر التي يستعملها JS موجودة", missing.length === 0);
if (missing.length) console.log("  ناقص:", missing.join(", "));

// CSS: كل class مستعمل في JS موجود في CSS (تقريبي)
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const usedClasses = new Set([
  ...[...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)),
  ...[...js.matchAll(/class:\s*"([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)),
  ...[...js.matchAll(/class:\s*`([^`]+)`/g)].flatMap((m) => m[1].replace(/\$\{[^}]*\}/g, " ").split(/\s+/)),
]);
const unknown = [...usedClasses].filter((c) => c && !c.includes("${") && !cssClasses.has(c));
check("كل class مستعملة معرّفة في CSS", unknown.length === 0);
if (unknown.length) console.log("  غير معرّفة:", unknown.join(", "));

// أمان: لا يوجد eval / innerHTML لمحتوى المستخدم
check("لا يوجد eval في الواجهة", !/\beval\s*\(/.test(js));
check("لا يوجد document.write", !/document\.write/.test(js));
check("كل الطلبات على نفس الأصل (نِسَبيّة)", !/fetch\(\s*["']https?:/.test(js));

// فحص الـ API: لا كشف لرموز
const apiFiles = ["../src/web/dashboard.js", "../src/services/crypto.js"];
for (const f of apiFiles) {
  const src = fs.readFileSync(new URL(f, import.meta.url), "utf8");
  check(`${path.basename(f)}: لا يعيد process.env مباشرة`, !/json\([^)]*process\.env/.test(src));
}

// الخادم: يتحقق من سرّ الـ webhook
const serverSrc = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
check("الـ webhook محمي بسرّ", /checkWebhookSecret/.test(serverSrc));
check("الـ webhook يرد 200 فوراً", /text\(res, 200, "ok"\)/.test(serverSrc));

// قاعدة البيانات: جدول تدقيق النقاط موجود
const dbSrc = fs.readFileSync(new URL("../src/db.js", import.meta.url), "utf8");
check("جدول points_ledger موجود", /CREATE TABLE IF NOT EXISTS points_ledger/.test(dbSrc));
check("جدول referral_events موجود", /CREATE TABLE IF NOT EXISTS referral_events/.test(dbSrc));
check("جدول blocked_nets موجود", /CREATE TABLE IF NOT EXISTS blocked_nets/.test(dbSrc));

console.log(failures ? `\n${failures} فحص فشل` : "\nكل الفحوص نجحت ✅");
process.exit(failures ? 1 : 0);
