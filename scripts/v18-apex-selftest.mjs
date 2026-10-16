/**
 * NEXUS APEX v18 smoke test.
 *
 * Builds a real project for several requests (Arabic, Darija and French), then
 * prints exactly what a user gets — blueprint, pages, lines, files, modules, data
 * rows, verification score — and runs three structural checks the engine promises:
 *
 *   1. every emitted JS module compiles (parse-only, via new Function)
 *   2. every widget host on every page resolves to a module that mounts it
 *   3. the single-file HTML has balanced script tags and no external dependency
 *
 *   node --experimental-strip-types --import ./scripts/apex-smoke/register.mjs scripts/v18-apex-selftest.mjs
 */
import { planFromText, buildApexProject } from "../src/lib/apex/index.ts";

const PROMPTS = [
  "بغيت متجر إلكتروني كامل يبيع هواتف وملابس مع سلة ودفع وتوصيل لكل الولايات",
  "site web pour ma pharmacie avec gestion des patients et rendez-vous",
  "لعبة RPG أسطورية ضخمة بالعربية فيها مستويات وتطوير شخصية",
  "لوحة تحكم كاملة لإدارة العملاء والمبيعات والمالية مع تقارير ورسم بياني",
  "منصة تعليمية للدروس والاختبارات مع شهادات وتقدم التلاميذ",
  "مطعم تقليدي جزائري مع قائمة أطباق وحجز طاولات وطلبات",
  "منصة سياحة لاكتشاف الجزائر مع خريطة وميزانية وحجز",
  "موقع عقارات بيع وإيجار مع فلاتر ومقارنة وحاسبة قرض",
  "مدونة مقالات تقنية مع بحث ووسوم ونشرة بريدية",
  "بورتفوليو مصمم جرافيك مع معرض أعمال ونموذج تواصل",
];

let fails = 0;
let best = null;
const rows = [];

for (const prompt of PROMPTS) {
  const planned = planFromText(prompt);
  const project = buildApexProject({ plan: planned.plan, text: prompt });
  const report = project.report;
  if (!report.ok) fails++;
  if (!best || project.stats.lines > best.stats.lines) best = project;

  /* 1 — every JS module parses */
  const jsFiles = project.files.filter((f) => f.lang === "js");
  let broken = 0;
  for (const f of jsFiles) {
    try {
      // eslint-disable-next-line no-new-func
      new Function(f.code);
    } catch (e) {
      broken++;
      if (broken <= 2) console.log(`      parse error in ${f.path}: ${e.message}`);
    }
  }

  /* 2 — every widget resolves to a mounted module */
  const hosts = [...new Set(project.stats.widgets)];
  let unmounted = 0;
  for (const id of hosts) {
    const mounted = project.files.some((f) => f.path.includes("/mods/") && new RegExp(`id:\\s*"${id}"`).test(f.code));
    if (!mounted) {
      unmounted++;
      console.log(`      widget "${id}" has no mounting module`);
    }
  }

  /* 3 — script tags balanced, nothing loaded from the network */
  const opens = (project.html.match(/<script\b/g) || []).length;
  const closes = (project.html.match(/<\/script>/g) || []).length;
  const external = [...project.html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !u.startsWith("https://schema.org"));
  const structural = opens === closes && external.length === 0 && jsFiles.length > 3 && unmounted === 0;
  if (!structural) fails++;

  rows.push({ prompt, project, hosts, broken, unmounted, structural });
  console.log(
    `${report.ok && structural ? "PASS" : "FAIL"}  ${project.blueprint.padEnd(14)} ` +
      `${String(project.stats.lines).padStart(7)} lines · ${(project.stats.bytes / 1024).toFixed(0).padStart(5)} KB · ` +
      `${String(project.stats.modules).padStart(2)} modules · ${String(project.stats.pages).padStart(2)} pages · ` +
      `${String(project.stats.files).padStart(2)} files · ${String(project.stats.dataRows).padStart(5)} rows · ` +
      `${project.report.score}% · ${project.palette} · ${project.buildMs}ms`
  );
  if (!report.ok) {
    console.log(`      issues: ${report.notes.join(" | ")}`);
  }
}

/* deep check on the biggest build */
if (best) {
  const scripts = best.files.filter((f) => f.lang === "js");
  let bad = 0;
  for (const f of scripts) {
    try {
      // eslint-disable-next-line no-new-func
      new Function(f.code);
    } catch {
      bad++;
    }
  }
  const hasShell = /<header class="ax-header"/.test(best.html) && /<main id="main"/.test(best.html) && /data-apex="/.test(best.html);
  const wired =
    best.html.includes("window.APEX_PLAN") &&
    best.html.includes("window.APEX_DATA") &&
    best.html.includes("window.APEX_BUILD") &&
    /mountAll\(\)/.test(best.html);
  console.log(
    bad === 0 && hasShell && wired
      ? `PASS  deep: ${scripts.length} scripts compiled, shell + wiring present (${best.slug})`
      : `FAIL  deep: ${bad} broken scripts, shell=${hasShell}, wired=${wired}`
  );
  if (bad || !hasShell || !wired) fails++;
}

const totalLines = rows.reduce((s, r) => s + r.project.stats.lines, 0);
const totalFiles = rows.reduce((s, r) => s + r.project.stats.files, 0);
const avgLines = Math.round(totalLines / rows.length);
console.log(
  `\n${fails === 0 ? "ALL GOOD" : fails + " FAILURES"} — ${rows.length} projects · ` +
    `${totalLines.toLocaleString("en-US")} lines total · ${avgLines.toLocaleString("en-US")} avg · ${totalFiles} files`
);
process.exit(fails === 0 ? 0 : 1);
