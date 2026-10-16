#!/usr/bin/env node
/**
 * NEXUS FORGE v19 — اختبار الورشة خارج Next.js
 * ---------------------------------------------------------------------------
 * Compiles the PURE forge modules (types / contract / plan / assemble / qa /
 * live-pack) to CommonJS in a temp folder, rewrites the `@/` aliases, then runs
 * the checks that decide whether a build comes out huge and working:
 *
 *   · intent detection (kind / scale / language) from Darija, Arabic, French
 *   · architect JSON parsing (fences, prose, trailing commas, cut answers)
 *   · plan normalisation (index.html + css always present, waves ≤ 3,
 *     module count and line targets honoured per scale)
 *   · assembly of one self-contained index.html (tokens, RTL, every module in)
 *   · QA: catches lazy/truncated/syntactically broken modules, passes good ones
 *   · the portable live-link codec (deflate-raw ↔ base64url roundtrip)
 *
 * Usage:  node scripts/v19-forge-test.mjs [--json]
 * Non-zero exit code when a check fails.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "forge-v19-"));
const JSON_OUT = process.argv.includes("--json");
const SRC = path.join(ROOT, "src").replace(/\\/g, "/");

const FILES = [
  "src/lib/forge/types.ts",
  "src/lib/forge/contract.ts",
  "src/lib/forge/plan.ts",
  "src/lib/forge/assemble.ts",
  "src/lib/forge/qa.ts",
  "src/lib/live-pack.ts",
  "src/lib/code-check.ts",
  "src/lib/titan.ts",
  "src/lib/limits.ts",
].map((f) => path.join(ROOT, f).replace(/\\/g, "/"));

/* ---------- 1. compile ---------- */
fs.writeFileSync(
  path.join(OUT, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        target: "es2022",
        module: "commonjs",
        moduleResolution: "node",
        esModuleInterop: true,
        skipLibCheck: true,
        strict: false,
        types: ["node"],
        typeRoots: [path.join(ROOT, "node_modules/@types").replace(/\\/g, "/")],
        noEmit: false,
        baseUrl: ".",
        paths: { "@/*": [SRC + "/*"] },
        rootDir: SRC,
        outDir: ".",
      },
      files: FILES,
    },
    null,
    2
  )
);

execFileSync(process.execPath, [path.join(ROOT, "node_modules/typescript/bin/tsc"), "-p", path.join(OUT, "tsconfig.json")], {
  cwd: ROOT,
  stdio: "inherit",
});
fs.rmSync(path.join(OUT, "tsconfig.json"), { force: true });

/* ---------- 2. rewrite "@/..." aliases ---------- */
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
for (const file of walk(OUT).filter((f) => f.endsWith(".js"))) {
  const rel = path.relative(OUT, file);
  const prefix = "../".repeat(rel.split(path.sep).length - 1) || "./";
  const src = fs.readFileSync(file, "utf8").replace(/(["'])@\/([^"']+)\1/g, (_m, q, p) => `${q}${prefix}${p}${q}`);
  fs.writeFileSync(file, src);
}

/* ---------- 3. load ---------- */
const load = (p) => import(pathToFileURL(path.join(OUT, p)).href);
const types = await load("lib/forge/types.js");
const plan = await load("lib/forge/plan.js");
const asm = await load("lib/forge/assemble.js");
const qa = await load("lib/forge/qa.js");
const pack = await load("lib/live-pack.js");

/* ---------- 4. checks ---------- */
const results = [];
let failures = 0;
const check = (name, pass, detail = "") => {
  results.push({ name, pass: !!pass, detail });
  if (!pass) failures++;
};

/* --- intent detection --- */
check("kind: لعبة → game", plan.guessKind("صايب لي لعبة سيارة تجري في الصحراء") === "game");
check("kind: موقع → site", plan.guessKind("موقع لمطعم جزائري فيه قائمة الطلبات") === "site");
check("kind: نظام + قاعدة بيانات → system", plan.guessKind("نظام إدارة مخزون مع قاعدة بيانات وفواتير") === "system");
check("kind: أداة → tool", plan.guessKind("أداة تحويل التاريخ من الميلادي إلى الهجري") === "tool");
check("kind: landing", plan.guessKind("landing page for a saas product") === "landing");
check("scale: ضخم → titan", plan.guessScale("لعبة ضخمة جدا") === "titan");
check("scale: 10000 سطر → titan", plan.guessScale("ابي موقع فيه 10000 سطر") === "titan");
check("scale: simple → standard", plan.guessScale("un petit site simple") === "standard");
check("scale: default → big", plan.guessScale("موقع لمطعم") === "big");
check("language: ar", plan.guessLanguage("صايب لي موقع") === "ar");
check("language: fr", plan.guessLanguage("je veux un site pour mon restaurant") === "fr");
check("language: en", plan.guessLanguage("build me a racing game") === "en");

/* --- architect JSON parsing (dirty answers) --- */
const dirty = `Sure! Here is the plan you asked for:

\`\`\`json
{"title":"متجر الأندلس","kind":"site","language":"ar","summary":"متجر جزائري","design":{"palette":{"bg":"#100f14","accent":"#d97757"},"typography":"system","motion":"180ms","layout":"8px grid","notes":"RTL"},
"contract":"NX namespace, storage keys ndalus:*:v1",
"target":{"lines":6000,"modules":9,"kb":190},
"shell":"nav, hero, products, cart, contact",
"modules":[
 {"id":"shell","path":"index.html","kind":"html","title":"الهيكل","spec":"كل الأقسام مع ids واضحة","lines":520,"needs":[]},
 {"id":"styles","path":"css/styles.css","kind":"css","title":"التصميم","spec":"نظام التصميم الكامل","lines":600,"needs":[]},
 {"id":"core","path":"js/core.js","kind":"js","title":"النواة","spec":"الحالة والتخزين والأدوات","lines":480,"needs":[]},
 {"id":"data","path":"js/data.js","kind":"js","title":"المنتجات","spec":"60 منتج حقيقي بأسعار بالدينار","lines":700,"needs":["core"]},
 {"id":"shop","path":"js/shop.js","kind":"js","title":"السلة","spec":"سلة وشراء ومجاميع دقيقة","lines":650,"needs":["core","data"]},
]}
\`\`\`
That's all!`;
const parsed = plan.parseForgePlan(dirty, { prompt: "متجر", scale: "big" });
check("parse: JSON داخل prose + trailing comma", !!parsed);
check("parse: 5 وحدات مقروءة", !!parsed && parsed.modules.length >= 5, parsed ? String(parsed.modules.length) : "null");
check("parse: العنوان", !!parsed && parsed.title.includes("الأندلس"));
check("parse: اللغة ar", !!parsed && parsed.language === "ar");
check("normalize: index.html موجود", !!parsed && parsed.modules.some((m) => m.path === "index.html"));
check("normalize: css موجود", !!parsed && parsed.modules.some((m) => m.kind === "css"));
check("normalize: عدد الوحدات ≥ 8 (big)", !!parsed && parsed.modules.length >= 8, parsed ? String(parsed.modules.length) : "");
check("normalize: مجموع الأسطر ≥ 80% من الهدف", !!parsed && parsed.target.lines >= types.SCALE_META.big.total * 0.8, parsed ? String(parsed.target.lines) : "");
check("normalize: الموجات ≤ 3", !!parsed && Math.max(...parsed.modules.map((m) => m.wave)) <= 3);
check("normalize: العقد غير فارغ", !!parsed && parsed.contract.length > 40);
check("normalize: لا needs مكسورة", !!parsed && parsed.modules.every((m) => m.needs.every((n) => parsed.modules.some((x) => x.id === n))));

/* --- fallback plan --- */
for (const scale of ["standard", "big", "titan"]) {
  const p = plan.defaultPlan("لعبة مغامرات ضخمة في الصحراء الجزائرية", "game", scale, "ar");
  const meta = types.SCALE_META[scale];
  const total = p.modules.reduce((s, m) => s + m.lines, 0);
  check(`defaultPlan(${scale}): وحدات ≥ ${meta.modules[0]}`, p.modules.length >= meta.modules[0], String(p.modules.length));
  check(`defaultPlan(${scale}): أسطر ≥ 80% من ${meta.total}`, total >= meta.total * 0.8, String(total));
  check(`defaultPlan(${scale}): html + css + core`, ["index.html", "css/styles.css", "js/core.js"].every((x) => p.modules.some((m) => m.path === x)));
}

/* --- stripFence --- */
check("stripFence: كتلة js", asm.stripFence("```js\nconst a=1;\n```", "js") === "const a=1;");
check("stripFence: كتلة بلا إغلاق", asm.stripFence("```html\n<p>x</p>", "html").startsWith("<p>x</p>"));
check("stripFence: نص عادي يمر", asm.stripFence("body{margin:0}", "css") === "body{margin:0}");

/* --- assembly --- */
const demo = plan.defaultPlan("موقع مطعم", "site", "standard", "ar");
const mkFile = (m, code) => ({ path: m.path, kind: m.kind, title: m.title, wave: m.wave, code, lines: code.split("\n").length, bytes: code.length, model: "test-model", ms: 10, retries: 0, quality: 1 });
const files = demo.modules.map((m) => {
  if (m.kind === "html")
    return mkFile(m, `<!doctype html><html lang="ar" dir="rtl"><head><title>مطعم</title></head><body>\n<nav id="nav"></nav>\n<main id="app"><section id="hero"><h1>مطعم الأندلس</h1></section></main>\n<button id="cta">اطلب</button>\n</body></html>`);
  if (m.kind === "css") return mkFile(m, `:root{--bg:#100f14;--accent:#d97757}\nbody{margin:0;background:var(--bg)}\n.card{border-radius:16px}\n`);
  if (m.kind === "json") return mkFile(m, `{"menu":[{"id":1,"name":"كسكس","price":850}]}`);
  return mkFile(m, `(function(){\n  window.NX = window.NX || {};\n  NX[${JSON.stringify(m.id)}] = { init: function(){ var el = document.getElementById('app'); if (el) el.dataset.ready = '1'; } };\n})();\n`);
});
const single = asm.assembleSingleFile(demo, files);
check("assemble: doctype", /^<!doctype html>/i.test(single.html));
check("assemble: ينتهي بـ </html>", /<\/html>\s*$/.test(single.html));
check("assemble: dir=rtl", /dir="rtl"/.test(single.html));
check("assemble: رموز التصميم", /--accent:#d97757/.test(single.html));
check("assemble: كل السكربتات مدمجة", single.scripts >= files.filter((f) => f.kind === "js" || f.kind === "json").length);
check("assemble: التنسيق مدمج", single.styles >= files.filter((f) => f.kind === "css").length);
check("assemble: لا <head> مكرر", (single.html.match(/<head[\s>]/gi) ?? []).length === 1);
check("assemble: لا <body> مكرر", (single.html.match(/<body[\s>]/gi) ?? []).length === 1);
check("assemble: بيانات json مكيفة", /window\.NX_DATA_/.test(single.html) || !files.some((f) => f.kind === "json"));
check("assemble: حارس الأخطاء موجود", single.html.includes("forge-fatal"));
const tree = asm.assembleTree(demo, files, single);
check("tree: index.html + README", tree.some((t) => t.path === "index.html") && tree.some((t) => t.path === "README.md"));
check("tree: كل الوحدات", tree.length >= files.length + 1);

/* --- qaModule --- */
const goodMod = { id: "core", path: "js/core.js", kind: "js", title: "النواة", spec: "x".repeat(40), lines: 12, needs: [], wave: 0 };
const goodCode = Array.from({ length: 14 }, (_, i) => `var v${i} = ${i};`).join("\n");
check("qaModule: ملف سليم يمر", qa.qaModule(goodMod, goodCode).filter((i) => i.level === "error").length === 0, JSON.stringify(qa.qaModule(goodMod, goodCode)));
check("qaModule: TODO يُرفض", qa.qaModule(goodMod, goodCode + "\n// TODO: add the rest").some((i) => i.text.includes("نقص")));
check("qaModule: خطأ صياغة يُرفض", qa.qaModule(goodMod, "function f( { return 1").some((i) => i.text.includes("صياغة")));
check("qaModule: ملف قصير يُرفض", qa.qaModule({ ...goodMod, lines: 400 }, "var a=1;").some((i) => i.text.includes("قصير")));
check("qaModule: import مرفوض", qa.qaModule(goodMod, "import x from 'y';\n" + goodCode).some((i) => i.text.includes("import")));
check("qaModule: css غير متوازن", qa.qaModule({ ...goodMod, kind: "css", path: "css/a.css" }, ":root{--a:1").some((i) => i.text.includes("أقواس")));
check("qaModule: json غير صالح", qa.qaModule({ ...goodMod, kind: "json", path: "a.json" }, "{oops").some((i) => i.text.includes("JSON")));

/* --- qaProject --- */
const goodQa = qa.qaProject(single.html, demo, files);
check("qaProject: مشروع سليم ≥ 60", goodQa.score >= 60, String(goodQa.score));
check("qaProject: بلا أخطاء قاتلة", goodQa.issues.filter((i) => i.level === "error").length === 0, JSON.stringify(goodQa.issues.slice(0, 4)));
check("qaProject: فحوص مسجلة", goodQa.checks.length >= 8, String(goodQa.checks.length));

const broken = single.html
  .replace(/<button id="cta">اطلب<\/button>/, "")
  .replace("</body>", `<script>document.getElementById('cta').addEventListener('click', nope);</script></body>`);
const badQa = qa.qaProject(broken, demo, files);
check("qaProject: المشروع المكسور يُكتشف", badQa.issues.some((i) => i.level === "error"), JSON.stringify(badQa.issues.slice(0, 3)));
check("qaProject: نقطة المكسور أقل", badQa.score < goodQa.score, `${badQa.score} < ${goodQa.score}`);

const noRtl = single.html.replace('dir="rtl"', 'dir="ltr"');
check("qaProject: RTL مفقود → خطأ", qa.qaProject(noRtl, demo, files).issues.some((i) => i.text.includes("rtl")));

/* --- repair briefs --- */
const brief = qa.repairBrief(demo.modules[0], files[0].code, [{ level: "error", where: "index.html", text: "وسم غير مغلق" }], demo.contract);
check("repairBrief: يذكر المشكلة والملف والعقد", brief.includes("وسم غير مغلق") && brief.includes(demo.modules[0].path) && brief.includes("CONTRACT"));
const pbrief = qa.projectRepairBrief(broken, badQa);
check("projectRepairBrief: يذكر الأخطاء", pbrief.includes("[error]"));

/* --- digests (via assemble-side helper exported from build is server-only; qa has none) --- */
check("digest helper: موجود في build (server-only)", typeof qa.duplicatedBlocks === "function");
check("duplicatedBlocks: يكتشف الحشو", qa.duplicatedBlocks(Array.from({ length: 12 }, () => `<div class="card" style="padding:24px;border-radius:16px">نفس المحتوى تمامًا للتضخيم</div>`).join("\n\n")) > 6);

/* --- live-pack --- */
const bigHtml = `<!doctype html><html lang="ar" dir="rtl"><head><title>ضخم</title></head><body>${"<section class='row'><h2>قسم</h2><p>محتوى حقيقي يتكرر لبناء ملف كبير للاختبار</p></section>".repeat(1600)}</body></html>`;
const slug = pack.slugify("متجر الأندلس الكبير");
check("slugify: صالح", pack.isSlug(slug), slug);
check("slugify: عنوان لاتيني", pack.isSlug(pack.slugify("My Cool Game")), pack.slugify("My Cool Game"));
check("isSlug: يرفض السيئ", !pack.isSlug("../etc/passwd") && !pack.isSlug("A B"));
const packed = pack.packPortable(bigHtml);
const round = pack.unpackPortable(packed);
check("portable: roundtrip مطابق", round === bigHtml, `${bigHtml.length} → ${packed.length}`);
check("portable: الضغط فعال (<40%)", packed.length / Buffer.byteLength(bigHtml) < 0.4, (packed.length / Buffer.byteLength(bigHtml)).toFixed(3));
const href = pack.portableHref("https://nexus.example", bigHtml, "متجر");
check("portable: الرابط فيه #d=", href.url.startsWith("https://nexus.example/live/portable#d=") && href.url.includes("&t="));
check("fileSlug: اسم ملف آمن", pack.fileSlug("متجر/الأندلس؟") === "متجر_الأندلس");

/* ---------- 5. report ---------- */
const summary = {
  ok: failures === 0,
  checks: results.length,
  failures,
  failed: results.filter((r) => !r.pass).map((r) => `${r.name}${r.detail ? ` → ${r.detail}` : ""}`),
};

if (JSON_OUT) {
  console.log(JSON.stringify({ ...summary, results }, null, 2));
} else {
  for (const r of results) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${!r.pass && r.detail ? `  → ${r.detail}` : ""}`);
  console.log(`\n${summary.ok ? "✅ FORGE v19 — كل الفحوص ناجحة" : "❌ FORGE v19 — فيه فحوش فاشلة"} (${results.length - failures}/${results.length})`);
}

fs.rmSync(OUT, { recursive: true, force: true });
process.exit(summary.ok ? 0 : 1);
