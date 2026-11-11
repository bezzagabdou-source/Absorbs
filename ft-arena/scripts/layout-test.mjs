/**
 * يحدّد إن كان أي عنصر يفرض عرضًا أكبر من الشاشة (سبب الشاشة الفارغة).
 * يراعي: grid-template-columns:auto + محتوى nowrap  ← الانحدار الأصلي.
 */
import fs from "node:fs";
// يقرأ CSS المبنية فعليًا (بعد next build)
const dirs = fs.readdirSync(".next/static/chunks").filter((f) => f.endsWith(".css"));
if (!dirs.length) { console.error("شغّل npm run build أولًا"); process.exit(1); }
const css = dirs.map((f) => fs.readFileSync(`.next/static/chunks/${f}`, "utf8")).join("\n");
const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");

function block(sel) {
  const re = new RegExp("(?:^|\\})" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}", "g");
  let m, all = [];
  while ((m = re.exec(clean))) all.push(m[1]);
  return all.join(";");
}

const hero = block(".landing-hero");
const ticker = block(".ticker");

const problems = [];

// 1) hero: عمود auto + محتوى nowrap = تمديد
if (/display:grid/.test(hero) && /place-items:center/.test(hero) && !/grid-template-columns/.test(hero)) {
  problems.push("hero: grid بعمود auto + place-items:center → المحتوى يحدّد العرض");
}
// 2) عمود auto صريح
if (/grid-template-columns:auto/.test(hero)) problems.push("hero: عمود auto");

// 3) ticker nowrap بلا قيد
if (/white-space:nowrap/.test(ticker)) {
  const capped = /max-width:100%/.test(ticker) || /contain:paint/.test(ticker) || /overflow:hidden/.test(ticker);
  if (!capped) problems.push("ticker: nowrap بلا overflow/max-width");
}

// 4) شبكة أمان
if (!/\*\{min-width:0\}/.test(clean)) problems.push("مفقود: * { min-width:0 }");

console.log("hero  :", hero.slice(0, 140));
console.log("ticker:", ticker.slice(0, 140));
console.log();
if (problems.length) {
  console.log("❌ مشاكل تخطيط:");
  for (const p of problems) console.log("   •", p);
  process.exit(1);
}
console.log("✅ لا يوجد أي عنصر يفرض عرضًا أكبر من الشاشة");
