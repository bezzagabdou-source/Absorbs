#!/usr/bin/env node
/**
 * NEXUS ATLAS v18 — اختبار قاعدة المعرفة خارج Next.js
 * ---------------------------------------------------------------------------
 * Compiles the pure KB modules (types / data / engine) to CommonJS in a temp
 * folder, rewrites the `@/` aliases to relative paths, then runs:
 *   · kbSelfCheck()            — internal consistency of the corpus
 *   · kbStats()                — size counters shown in /app/knowledge
 *   · a list of real queries   — Arabic, Darija, French, English, typos
 *
 * Usage:  node scripts/v18-kb-test.mjs [--json]
 * Exit code is non-zero when the self-check fails or a must-hit query misses.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-kb-"));
const JSON_OUT = process.argv.includes("--json");

/* ---------- 1. compile (with the repo's "@/*" path alias) ---------- */
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
        noEmit: false,
        baseUrl: ".",
        paths: { "@/*": [path.join(ROOT, "src").replace(/\\/g, "/") + "/*"] },
        rootDir: path.join(ROOT, "src").replace(/\\/g, "/"),
        outDir: ".",
      },
      files: [
        path.join(ROOT, "src/lib/kb/types.ts").replace(/\\/g, "/"),
        path.join(ROOT, "src/lib/kb/data.ts").replace(/\\/g, "/"),
        path.join(ROOT, "src/lib/kb/data-atlas.ts").replace(/\\/g, "/"),
        path.join(ROOT, "src/lib/kb/engine.ts").replace(/\\/g, "/"),
      ],
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
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

for (const file of walk(OUT).filter((f) => f.endsWith(".js"))) {
  const depth = path.relative(OUT, file).split(path.sep).length - 1;
  const prefix = "../".repeat(depth) || "./";
  const src = fs.readFileSync(file, "utf8").replace(/(["'])@\/(lib\/kb\/[^"']+)\1/g, (_m, q, p) => `${q}${prefix}${p}${q}`);
  fs.writeFileSync(file, src);
}

/* ---------- 3. run ---------- */
const { kbSearch, kbStats, kbNeeds, kbAnswer, buildIndex } = await import(pathToFileURL(path.join(OUT, "lib/kb/engine.js")).href);
const { KB_ENTRIES } = await import(pathToFileURL(path.join(OUT, "lib/kb/data.js")).href);

/* kbSelfCheck is declared in data.ts */
const data = await import(pathToFileURL(path.join(OUT, "lib/kb/data.js")).href);
const check = typeof data.kbSelfCheck === "function" ? data.kbSelfCheck() : { ok: true, problems: ["kbSelfCheck not exported"] };

const stats = kbStats(buildIndex(KB_ENTRIES));

/** queries that MUST hit their entry ( Darija / Arabic / French / typos ) */
const MUST = [
  { q: "شكون صنعك", id: /nexus|identity|maker/i },
  { q: "باك", id: /bac/i },
  { q: "g50", id: /dz-taxe|g50|tax/i },
  { q: "cnie", id: /cnie|carte/i },
  { q: "permis", id: /permis|driving/i },
  { q: "auto entrepreneur", id: /entrepreneur|auto/i },
  { q: "prompt", id: /prompt/i },
  { q: "البطاقة الذهبية", id: /dahabia|gold|carte|payment/i },
];

const report = {
  ok: check.ok,
  problems: check.problems,
  entries: KB_ENTRIES.length,
  stats,
  must: [],
  sample: [],
};

for (const { q, id } of MUST) {
  const hits = kbSearch(q, { limit: 5 });
  const first = hits[0];
  const pass = !!first && id.test(first.entry.id) || hits.some((h) => id.test(h.entry.id));
  report.must.push({
    q,
    pass: !!pass,
    hits: hits.length,
    top: first ? { id: first.entry.id, score: Number(first.score.toFixed(3)), title: first.entry.title.ar } : null,
  });
}

const SAMPLES = [
  "كيفاش ندير auto entrepreneur",
  "carte dahabia",
  "bac 2026 moyenne",
  "أفضل لغة برمجة للمبتدئين",
  "taux de change dinar",
  "منحة البطالة",
  "كيف نصمم logo",
  "what is prompt engineering",
  "رخصة السياقة النقاط",
  "الجامعات في الجزائر",
];
for (const q of SAMPLES) {
  const hits = kbSearch(q, { limit: 3 });
  report.sample.push({
    q,
    needs: kbNeeds(q),
    hits: hits.map((h) => ({ id: h.entry.id, score: Number(h.score.toFixed(3)), why: h.matched.slice(0, 3) })),
  });
}

const ctx = kbAnswer("كيفاش نسجل في auto entrepreneur", { limit: 3 });
report.contextChars = ctx.length;
report.contextHead = ctx.slice(0, 320);

/* ---------- 4. print ---------- */
if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n══ NEXUS ATLAS v18 — قاعدة المعرفة ══`);
  console.log(`self-check : ${check.ok ? "OK ✅" : "FAIL ❌"} (${check.problems.length} problems)`);
  check.problems.slice(0, 12).forEach((p) => console.log(`   · ${p}`));
  console.log(`entries    : ${stats.entries} · categories ${stats.categories} · tags ${stats.tags} · words ${stats.words.toLocaleString("en")} · ${(stats.bytes / 1024).toFixed(0)} KB`);
  console.log(`languages  : ar ${stats.languages.ar} · fr ${stats.languages.fr} · en ${stats.languages.en}`);
  console.log(`\n── اختبارات إلزامية ──`);
  for (const m of report.must) {
    console.log(`${m.pass ? "✅" : "❌"} "${m.q}" → ${m.top ? `${m.top.id} (${m.top.score}) «${m.top.title}»` : "لا نتيجة"} [${m.hits} hits]`);
  }
  console.log(`\n── عيّنات ──`);
  for (const s of report.sample) {
    console.log(`· "${s.q}" (needs=${s.needs}) → ${s.hits.map((h) => `${h.id}:${h.score}`).join(", ") || "—"}`);
  }
  console.log(`\n── سياق مُجمَّع للنموذج ── ${report.contextChars} حرف`);
  console.log(report.contextHead.replace(/\n/g, "\n   "));
}

fs.rmSync(OUT, { recursive: true, force: true });

const failed = report.must.filter((m) => !m.pass);
if (!check.ok || failed.length) {
  console.error(`\n❌ FAILED — ${failed.length} must-hit queries missed, self-check ok=${check.ok}`);
  process.exit(1);
}
console.log("\n✅ KB OK");
