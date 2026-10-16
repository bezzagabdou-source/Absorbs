#!/usr/bin/env node
/**
 * NEXUS DESIGN v19 — اختبار محرّك التصميم خارج Next.js
 * ---------------------------------------------------------------------------
 * Compiles the PURE design modules (design-kb / web-audit / design-contract) to
 * CommonJS in a temp folder, rewrites the `@/` aliases, then checks that:
 *
 *   · the knowledge base is complete and consistent (ids, cats, severities,
 *     unique detectors, an Arabic + English wording and a fix for every rule)
 *   · the auditor really catches the classic sins (viewport, alt, labels, h1,
 *     contrast, RTL, inline styles, duplicated markup…) on a weak document and
 *     stays quiet on a strong one
 *   · scoring, grades and per-category breakdowns behave
 *   · the improvement brief + system prompt carry the identity, the focused law
 *     and the strict output contract
 *   · the NDJSON stream parser survives split chunks and garbage
 *
 * Usage:  node scripts/v19-design-test.mjs [--json]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "design-v19-"));
const JSON_OUT = process.argv.includes("--json");
const SRC = path.join(ROOT, "src").replace(/\\/g, "/");

const FILES = [
  "src/lib/design-kb.ts",
  "src/lib/web-audit.ts",
  "src/lib/design-contract.ts",
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
const kb = await load("lib/design-kb.js");
const audit = await load("lib/web-audit.js");
const contract = await load("lib/design-contract.js");

/* ---------- 4. checks ---------- */
const results = [];
let failures = 0;
const check = (name, pass, detail = "") => {
  results.push({ name, pass: !!pass, detail });
  if (!pass) failures++;
};

/* --- knowledge base integrity --- */
const rules = kb.DESIGN_RULES;
check("قاعدة البيانات: 90+ قاعدة", rules.length >= 90, `${rules.length} قاعدة`);
check("قاعدة البيانات: 15+ محورًا", kb.CATS.length >= 15, `${kb.CATS.length} محور`);
const ids = new Set(rules.map((r) => r.id));
check("المعرّفات فريدة", ids.size === rules.length, `${ids.size}/${rules.length}`);
const badShape = rules.filter((r) => !r.id || !r.cat || !r.sev || !r.ar || !r.en || !r.fix || !kb.CATS.includes(r.cat) || !(r.sev in kb.SEV_WEIGHT));
check("كل قاعدة كاملة الشكل (id/cat/sev/ar/en/fix)", badShape.length === 0, badShape.slice(0, 3).map((r) => r.id).join(","));
const detectors = rules.filter((r) => r.detect).map((r) => r.detect);
check("الكاشفات فريدة", new Set(detectors).size === detectors.length, `${new Set(detectors).size}/${detectors.length}`);
check("أغلب القواعد لها كاشف آلي", detectors.length >= rules.length * 0.6, `${detectors.length} كاشف`);
check("RULE_BY_DETECT مبني", kb.RULE_BY_DETECT.size === detectors.length);
check("RULE_BY_ID مبني", kb.RULE_BY_ID.size === rules.length && !!kb.RULE_BY_ID.get(rules[0].id));
check("أوزان الخطورة متناقصة", kb.SEV_WEIGHT.critical > kb.SEV_WEIGHT.major && kb.SEV_WEIGHT.major > kb.SEV_WEIGHT.minor && kb.SEV_WEIGHT.minor > kb.SEV_WEIGHT.polish);
check("كل محور له اسم عربي", kb.CATS.every((c) => !!kb.CAT_AR[c]));
check("DESIGN_LAW: محاور + قواعد مرقّطة", /^## /m.test(kb.DESIGN_LAW(10)) && /^- \[(critical|major|minor|polish)\]/m.test(kb.DESIGN_LAW(10)) && kb.DESIGN_LAW(10).length > 300);
const law = kb.lawForFindings([rules[0].id, rules[5].id]);
check("lawForFindings: يذكر إصلاح القواعد المطلوبة", law.includes("FIX") && law.length > 60);
check("lawForFindings: يعود للقانون العام عند قائمة فارغة", kb.lawForFindings([]).length > 200);

/* --- contrast maths (real WCAG formula) --- */
check("contrast: أبيض/أسود = 21", Math.abs(audit.contrast("#ffffff", "#000000") - 21) < 0.05, String(audit.contrast("#ffffff", "#000000")));
check("contrast: نفس اللون = 1", Math.abs(audit.contrast("#888888", "#888") - 1) < 0.01);
check("contrast: رمادي على أبيض < 4.5", audit.contrast("#999999", "#ffffff") < 4.5, String(audit.contrast("#999999", "#ffffff")));
check("contrast: يتجاهل ما لا يفهمه", audit.contrast("red-ish", "#fff") === null);

/* --- weak document: the classic sins must be caught --- */
const WEAK = `<!doctype html>
<html>
<head><title>متجري</title></head>
<body bgcolor="#ffffff">
<div style="width:100%">
  <div style="font-size:40px;color:#cccccc">متجر الصحراء</div>
  <div>مرحبا بكم في متجرنا نحن نبيع كل شيء عندنا عروض كثيرة جدا</div>
  <div style="display:flex">
    <div style="border:1px solid black;padding:2px">منتج 1</div>
    <div style="border:1px solid black;padding:2px">منتج 2</div>
    <div style="border:1px solid black;padding:2px">منتج 3</div>
  </div>
  <form>
    <input type="text" placeholder="الاسم">
    <input type="email" placeholder="البريد">
    <button onclick="alert('ok')">ارسال</button>
  </form>
  <img src="logo.png">
  <div style="color:#dddddd">جميع الحقوق محفوظة</div>
</div>
</body>
</html>`;

const weak = audit.auditHtml(WEAK, { lang: "ar" });
const has = (rep, d) => rep.ruleIds.includes(d);
check("فحص الضعيف: النقطة منخفضة", weak.score < 72, `${weak.score}/100 (${weak.grade})`);
check("فحص الضعيف: يكتشف غياب viewport", has(weak, "lay-viewport"), weak.ruleIds.join(","));
check("فحص الضعيف: يكتشف غياب lang/dir مع نص عربي", has(weak, "a11y-lang") && has(weak, "ar-dir"));
check("فحص الضعيف: يكتشف صورة بلا alt", has(weak, "a11y-alt"));
check("فحص الضعيف: يكتشف حقولًا بلا label", has(weak, "fm-label"));
check("فحص الضعيف: يكتشف غياب h1", has(weak, "seo-h1"));
check("فحص الضعيف: يكتشف inline styles", has(weak, "cd-inline"));
check("فحص الضعيف: يكتشف تباينًا ضعيفًا", has(weak, "col-contrast"));
check("فحص الضعيف: يكتشف onclick/alert داخل السمة", has(weak, "cd-alert"));
check("فحص الضعيف: يكتشف bgcolor/وسوم قديمة", has(weak, "cd-legacy"));
check("فحص الضعيف: يكتشف غياب الوسوم الدلالية", has(weak, "a11y-landmark"));
check("فحص الضعيف: 8 ملاحظات على الأقل", weak.findings.length >= 8, `${weak.findings.length} ملاحظة`);
check("كل ملاحظة مرتبطة بقاعدة موجودة", weak.findings.every((f) => !!kb.RULE_BY_ID.get(f.ruleId)));
check("كل ملاحظة فيها دليل وإصلاح", weak.findings.every((f) => f.ar && f.fix && typeof f.evidence === "string"));
check("الملاحظات مرتّبة بالوزن", weak.findings.every((f, i) => i === 0 || weak.findings[i - 1].weight >= f.weight));
check("byCat: الأضعف أولًا", weak.byCat.every((c, i) => i === 0 || weak.byCat[i - 1].score <= c.score));
check("byCat: يغطّي كل المحاور", weak.byCat.length === kb.CATS.length);
check("الدرجة تطابق النقطة", weak.grade === (weak.score >= 90 ? "A" : weak.score >= 80 ? "B" : weak.score >= 70 ? "C" : weak.score >= 55 ? "D" : "F"), weak.grade);
check("stats: أسطر وحجم وعناصر", weak.stats.lines > 5 && weak.stats.bytes > 200 && weak.stats.nodes > 5 && weak.stats.images === 1 && weak.stats.inputs === 2);
check("stats: عربية = نعم، RTL = لا", weak.stats.arabic === true && weak.stats.rtl === false);
{
  const block = '<div class="card card--product card--wide"><h3>منتج تجريبي</h3><p>وصف طويل بما يكفي ليتجاوز حدّ الثمانين حرفًا في الكاشف</p><button>شراء</button></div>';
  check("dupRatio: يكتشف الحشو المكرر", audit.dupRatio(block.repeat(8)) > 0.5, String(audit.dupRatio(block.repeat(8))));
  const varied = [
    '<section class="hero"><h1>عنوان مختلف تمامًا</h1><p>فقرة أولى قصيرة.</p></section>',
    '<article class="post"><h2>خبر اليوم</h2><p>نص ثانٍ لا يشبه الأول في شيء.</p></article>',
    '<div class="stats"><b>120</b><span>طلبًا هذا الأسبوع</span><i>↑ 12%</i></div>',
    '<footer class="site"><a href="/privacy">الخصوصية</a><a href="/terms">الشروط</a></footer>',
    '<aside class="tips"><ul><li>نصيحة أولى</li><li>نصيحة ثانية مختلفة</li></ul></aside>',
  ].join("\n");
  check("dupRatio: مستند متنوع ≈ 0", audit.dupRatio(varied) === 0, String(audit.dupRatio(varied)));
}

/* --- strong document: must score far higher --- */
const STRONG = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="متجر الصحراء — منتجات جزائرية أصلية مع توصيل لكل الولايات.">
<title>متجر الصحراء — منتجات جزائرية</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<style>
:root { --bg:#0f1115; --surface:#171a21; --text:#f4f6fb; --muted:#a9b1c3; --brand:#f0b429; --brand-2:#d97757;
  --s1:4px; --s2:8px; --s3:16px; --s4:24px; --s5:32px; --s6:48px; --s7:64px; --r:16px; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text); font-family:"IBM Plex Sans Arabic",system-ui,sans-serif; line-height:1.7; }
.wrap { max-width:1200px; margin-inline:auto; padding-inline:var(--s4); }
header,main,footer { display:block; }
h1 { font-size:clamp(28px,5vw,48px); line-height:1.15; margin:0 0 var(--s3); letter-spacing:-.02em; }
h2 { font-size:clamp(20px,3vw,28px); margin:0 0 var(--s3); }
p { max-width:64ch; color:var(--muted); }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:var(--s4); }
.card { background:var(--surface); border:1px solid rgba(255,255,255,.08); border-radius:var(--r); padding:var(--s4);
  box-shadow:0 18px 40px -28px #000; transition:transform .18s cubic-bezier(.22,1,.36,1); }
.card:hover { transform:translateY(-3px); }
.btn { display:inline-flex; align-items:center; gap:8px; min-height:44px; padding:12px 22px; border-radius:999px; border:0;
  background:linear-gradient(120deg,var(--brand),var(--brand-2)); color:#1a1206; font-weight:800; cursor:pointer; }
.btn:focus-visible { outline:3px solid #fff8; outline-offset:2px; }
label { display:block; margin-bottom:6px; font-weight:700; }
input,select { width:100%; min-height:44px; padding:10px 14px; border-radius:12px; border:1px solid #ffffff22; background:#0b0d12; color:var(--text); }
img { max-width:100%; height:auto; display:block; }
.skip { position:absolute; inset-inline-start:-9999px; }
.skip:focus { inset-inline-start:8px; top:8px; z-index:9; }
@media (prefers-reduced-motion:reduce) { * { animation:none !important; transition:none !important; } }
@media (max-width:640px) { .grid { grid-template-columns:1fr; } h1 { font-size:28px; } }
</style>
</head>
<body>
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>
<header class="wrap"><nav aria-label="الرئيسية"><a href="#main">الرئيسية</a> · <a href="#products">المنتجات</a> · <a href="#contact">اتصل بنا</a></nav></header>
<main id="main" class="wrap">
  <section aria-labelledby="t1" style="padding:64px 0">
    <h1 id="t1">منتجات جزائرية أصلية تصلك إلى البيت</h1>
    <p>أكثر من 60 منتجا من الصحراء ومنطقة القبائل، بأسعار واضحة بالدينار وتوصيل لكل 58 ولاية.</p>
    <button class="btn" type="button">ابدأ التسوّق</button>
  </section>
  <section id="products" aria-labelledby="t2" style="padding:64px 0">
    <h2 id="t2">المنتجات</h2>
    <div class="grid">
      <article class="card"><img src="dates.webp" width="480" height="320" loading="lazy" alt="علبة تمر دقلة نور"><h3>دقلة نور</h3><p>1200 دج</p></article>
      <article class="card"><img src="oil.webp" width="480" height="320" loading="lazy" alt="زيت زيتون قبائلي"><h3>زيت زيتون</h3><p>1800 دج</p></article>
      <article class="card"><img src="rug.webp" width="480" height="320" loading="lazy" alt="زربية أمازيغية يدوية"><h3>زربية يدوية</h3><p>9500 دج</p></article>
    </div>
  </section>
  <section id="contact" aria-labelledby="t3" style="padding:64px 0">
    <h2 id="t3">اتصل بنا</h2>
    <form action="/contact" method="post" novalidate>
      <label for="name">الاسم</label><input id="name" name="name" type="text" autocomplete="name" required>
      <label for="mail">البريد</label><input id="mail" name="mail" type="email" autocomplete="email" required>
      <button class="btn" type="submit">أرسل</button>
    </form>
  </section>
</main>
<footer class="wrap" style="padding:32px 0"><p>© 2026 متجر الصحراء — الجزائر</p></footer>
<script>document.querySelector("form").addEventListener("submit",function(e){e.preventDefault();},{passive:false});</script>
</body>
</html>`;

const strong = audit.auditHtml(STRONG, { lang: "ar" });
check("فحص القوي: النقطة أعلى بكثير", strong.score > weak.score + 15, `${weak.score} → ${strong.score}`);
check("فحص القوي: ≥ 78", strong.score >= 78, `${strong.score}/100 (${strong.grade})`);
check("فحص القوي: لا يشكو من viewport", !has(strong, "lay-viewport"));
check("فحص القوي: لا يشكو من alt", !has(strong, "a11y-alt"));
check("فحص القوي: لا يشكو من labels", !has(strong, "fm-label"));
check("فحص القوي: لا يشكو من RTL ولا من brand-drift", !has(strong, "ar-dir") && !has(strong, "tr-brand"));
check("stats القوي: RTL + وسائط + أقسام", strong.stats.rtl === true && strong.stats.mediaQueries >= 2 && strong.stats.sections >= 3 && strong.stats.images === 3);
check("auditSummary: نص عربي فيه النقطة", /النقطة/.test(audit.auditSummary(strong)) && audit.auditSummary(weak).length > 20);

/* --- every rule is wired to a detector, and every detector has a rule --- */
{
  const auditor = fs.readFileSync(path.join(ROOT, "src/lib/web-audit.ts"), "utf8");
  const usedDetects = new Set([...auditor.matchAll(/(?:when|add)\(\s*(?:[\s\S]*?,\s*)?"([a-z][a-z0-9-]{2,})"\s*,\s*(?:`|")/g)].map((m) => m[1]));
  const orphanDetects = [...usedDetects].filter((d) => !kb.RULE_BY_DETECT.has(d));
  check("كل كاشف في الفاحص له قاعدة", orphanDetects.length === 0, orphanDetects.join(","));
  const rules = kb.DESIGN_RULES;
  check("كل قاعدة لها كاشف آلي", rules.every((r) => !!r.detect), rules.filter((r) => !r.detect).map((r) => r.id).join(","));
  check("rulesFor: يرجع قواعد المحور", kb.rulesFor("a11y").length >= 6 && kb.rulesFor("a11y").every((r) => r.cat === "a11y"));
}

/* --- a mid-quality page must land in the middle of the scale --- */
{
  const MID = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="مطعم الأندلس — أطباق جزائرية أصيلة في قلب العاصمة.">
<title>مطعم الأندلس — الجزائر</title>
<style>
:root { --bg:#12100e; --surface:#1b1815; --text:#f6f1e8; --muted:#b9ae9d; --brand:#e0a458; --s:16px; --r:14px; }
body { margin:0; background:var(--bg); color:var(--text); font-family:"Cairo",system-ui,sans-serif; line-height:1.8; font-size:16px; }
.wrap { max-width:1100px; margin-inline:auto; padding-inline:20px; }
h1 { font-size:38px; line-height:1.2; margin:0 0 12px; }
h2 { font-size:24px; margin:0 0 12px; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:20px; }
.card { background:var(--surface); border:1px solid rgba(255,255,255,.09); border-radius:var(--r); padding:20px; }
.btn { min-height:44px; padding:12px 20px; border-radius:999px; border:0; background:var(--brand); color:#231603; font-weight:700; }
.btn:hover { filter:brightness(1.08); }
.btn:focus-visible { outline:2px solid #fff; outline-offset:2px; }
header { position:sticky; top:0; }
@media (max-width:640px) { h1 { font-size:28px; } }
</style></head>
<body>
<header class="wrap"><nav aria-label="الرئيسية"><a href="#menu">القائمة</a> · <a href="#about">عن المطعم</a> · <a href="#contact">اتصل</a></nav></header>
<main id="main" class="wrap">
  <section aria-labelledby="t1"><h1 id="t1">أطباق جزائرية أصيلة في قلب العاصمة</h1>
    <p>كسكسي كل جمعة، شخشوخة، ورشتة — محضّرة بزيت الزيتون القبائلي.</p>
    <button class="btn" type="button">احجز طاولة</button></section>
  <section id="menu" aria-labelledby="t2"><h2 id="t2">القائمة</h2>
    <div class="grid">
      <article class="card"><img src="couscous.webp" width="400" height="300" loading="lazy" alt="طبق كسكسي بالخضار"><h3>كسكسي</h3><p>900 دج</p></article>
      <article class="card"><img src="chakh.webp" width="400" height="300" loading="lazy" alt="شخشوخة بسكرية"><h3>شخشوخة</h3><p>1100 دج</p></article>
    </div></section>
  <section id="about" aria-labelledby="t3"><h2 id="t3">عن المطعم</h2><p>منذ 1998 في شارع ديدوش مراد، الجزائر العاصمة.</p></section>
  <section id="contact" aria-labelledby="t4"><h2 id="t4">اتصل بنا</h2>
    <form action="/book" method="post"><label for="n">الاسم</label><input id="n" name="n" type="text" required>
      <label for="p">الهاتف</label><input id="p" name="p" type="tel" required>
      <button class="btn" type="submit">أرسل</button></form>
    <p>الهاتف: <a href="tel:+213000000000" dir="ltr">+213 00 00 00 00</a> · البريد: <a href="mailto:hello@andalous.dz" dir="ltr">hello@andalous.dz</a></p></section>
</main>
<footer class="wrap"><p>© 2026 مطعم الأندلس · <a href="/privacy">سياسة الخصوصية</a> · <a href="/terms">الشروط</a></p></footer>
</body></html>`;
  const mid = audit.auditHtml(MID, { lang: "ar" });
  check("متوسط الجودة: بين 45 و 92", mid.score > 45 && mid.score < 92, `${mid.score}/100 (${mid.grade})`);
  check("متوسط الجودة: أعلى من الضعيف وأدنى من القوي", mid.score > weak.score && mid.score <= strong.score, `${weak.score} < ${mid.score} ≤ ${strong.score}`);
  check("متوسط الجودة: لا يشتكي من viewport/alt/labels/RTL", !has(mid, "lay-viewport") && !has(mid, "a11y-alt") && !has(mid, "fm-label") && !has(mid, "ar-dir"));
  check("متوسط الجودة: يشتكي من نقص الحركة/reduced-motion", has(mid, "mot-reduced") || has(mid, "mot-reveal") || mid.findings.length >= 3, mid.ruleIds.join(","));
}

/* --- improvement brief + system prompt --- */
const brief = audit.improveBrief(weak, { lang: "ar", keep: "لا تغيّر النصوص" });
check("improveBrief: يذكر النقطة والإحصاءات", /score \d+\/100/.test(brief) && /STATS:/.test(brief));
check("improveBrief: فيه EVIDENCE و FIX", brief.includes("EVIDENCE") && brief.includes("FIX"));
check("improveBrief: يحفظ طلب المستخدم", brief.includes("لا تغيّر النصوص"));
check("improveBrief: يطلب ملفًا كاملًا", /COMPLETE improved file/.test(brief) && /<!doctype html>/.test(brief));

const sys = contract.designSystem({ depth: "rebuild", lang: "ar", ruleIds: weak.ruleIds.slice(0, 6), keep: "أبقِ الأسعار" });
check("designSystem: الهوية (abdelrezakbezzag + الجزائر)", sys.includes("abdelrezakbezzag") && sys.includes("Algeria"));
check("designSystem: لا يذكر شركة/نموذجًا آخر", !/openai|anthropic|claude|kimi|google gemini|chatgpt/i.test(sys));
check("designSystem: القانون المركّز على الملاحظات", sys.includes("FOCUSED DESIGN LAW") && sys.includes("FIX:"));
check("designSystem: عقد الإخراج الصارم", sys.includes("OUTPUT CONTRACT") && sys.includes("```html") && /COMPLETE, self-contained/i.test(sys));
check("designSystem: عمق إعادة البناء يذكر حدّ الأسطر", /900/.test(sys));
check("designSystem: العربية ⇒ RTL", /dir="rtl"/.test(sys));
check("designSystem: يحفظ ملاحظة المستخدم", sys.includes("أبقِ الأسعار"));
check("DEPTH_META: ثلاثة أعماق بميزانيات تصاعدية", contract.DEPTH_META.light.maxTokens < contract.DEPTH_META.deep.maxTokens && contract.DEPTH_META.deep.maxTokens < contract.DEPTH_META.rebuild.maxTokens);
check("depthSystem: light يطلب نفس البنية", /Keep the DOM structure/i.test(contract.designSystem({ depth: "light", lang: "en" })));

/* --- NDJSON stream parser --- */
const got = [];
const feed = audit.makeImproveParser((e) => got.push(e));
feed('{"t":"start","model":"Nexus","before":41,"findings":12,"lines":22}\n{"t":"sta');
feed('ge","label":"يعمل"}\n{"t":"delta","d":"<div>"}\ngarbage-not-json\n');
feed('{"t":"done","before":41,"after":88,"model":"Nexus","ms":1200}\n');
check("parser: يفهم الأحداث الكاملة", got.some((e) => e.t === "start" && e.before === 41));
check("parser: يجمع السطر المقطوع", got.some((e) => e.t === "stage" && e.label === "يعمل"));
check("parser: يقفز على السطور التالفة", got.some((e) => e.t === "delta") && got.some((e) => e.t === "done" && e.after === 88));
check("parser: لا يرمي استثناء", got.length === 4, `${got.length} أحداث`);

/* ---------- 5. report ---------- */
if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ total: results.length, failures, results }, null, 2) + "\n");
} else {
  for (const r of results) process.stdout.write(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}\n`);
  process.stdout.write(`\n${failures === 0 ? "✅" : "❌"} DESIGN v19 — ${results.length - failures}/${results.length}\n`);
}
fs.rmSync(OUT, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
