/**
 * Regenerates src/lib/apex/modules.ts from the real widget sources in
 * scripts/apex-src/*.js.
 *
 *   node scripts/build-apex-runtime.mjs
 *
 * Each source starts with a JSON meta header:
 *   /*@meta {"id":"cart","title":"المتجر","domain":"commerce","tags":[...],"order":30}*​/
 *
 * The header is stripped and the file becomes one entry of APEX_MODULES, which is
 * what the composer inlines into a generated project. The script refuses to write
 * output when a source has a `</script` sequence or a syntax error — the whole
 * point of APEX is that a generated site always runs.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "scripts", "apex-src");
const out = join(root, "src", "lib", "apex", "modules.ts");

if (!existsSync(srcDir)) throw new Error("missing scripts/apex-src");

const files = readdirSync(srcDir).filter((f) => f.endsWith(".js")).sort();
if (!files.length) throw new Error("no apex sources found");

const META = /^\/\*@meta\s+(\{[\s\S]*?\})\*\//;

const entries = [];
for (const f of files) {
  const raw = readFileSync(join(srcDir, f), "utf8");
  const m = META.exec(raw.trimStart());
  if (!m) throw new Error(`scripts/apex-src/${f}: missing /*@meta {...}*/ header`);
  let meta;
  try {
    meta = JSON.parse(m[1]);
  } catch (e) {
    throw new Error(`scripts/apex-src/${f}: bad meta json — ${e.message}`);
  }
  const code = raw.trimStart().slice(m[0].length).trim();

  /* hard safety rule: the module is stored as a JSON string literal, so only a
     literal end-of-script sequence would break the page it is inlined into. */
  if (/<\/script/i.test(code)) throw new Error(`scripts/apex-src/${f}: contains </script — write "<\\/script" instead`);

  /* syntax check each module on its own */
  const probe = join(tmpdir(), `apex-${meta.id}-${process.pid}.js`);
  writeFileSync(probe, code, "utf8");
  try {
    execFileSync(process.execPath, ["--check", probe], { stdio: "pipe" });
  } catch (e) {
    throw new Error(`scripts/apex-src/${f}: syntax error\n${e.stderr?.toString() ?? e.message}`);
  }
  try {
    writeFileSync(probe, "", "utf8");
  } catch {
    /* ignore */
  }

  if (/<\/script/i.test(code)) {
    console.warn(`  ! ${f}: literal "</script" found — escaping so it can live inside <script>`);
    code = code.replace(/<\/script/gi, "<\\/script");
  }

  entries.push({
    id: meta.id,
    title: meta.title ?? meta.id,
    domain: meta.domain ?? "core",
    tags: meta.tags ?? [],
    needs: meta.needs ?? [],
    order: typeof meta.order === "number" ? meta.order : 999,
    lines: code.split("\n").length,
    bytes: Buffer.byteLength(code, "utf8"),
    file: f,
    code,
  });
}

entries.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

const ids = new Set();
for (const e of entries) {
  if (ids.has(e.id)) throw new Error(`duplicate module id: ${e.id}`);
  ids.add(e.id);
}

const body = entries
  .map(
    (e) =>
      `  {\n` +
      `    id: ${JSON.stringify(e.id)},\n` +
      `    title: ${JSON.stringify(e.title)},\n` +
      `    domain: ${JSON.stringify(e.domain)},\n` +
      `    tags: ${JSON.stringify(e.tags)},\n` +
      `    needs: ${JSON.stringify(e.needs)},\n` +
      `    order: ${e.order},\n` +
      `    source: ${JSON.stringify(e.file)},\n` +
      `    lines: ${e.lines},\n` +
      `    bytes: ${e.bytes},\n` +
      `    code: ${JSON.stringify(e.code)},\n` +
      `  },`
  )
  .join("\n");

const header = `/**
 * NEXUS APEX — the widget library, verbatim.
 *
 * AUTO-GENERATED from scripts/apex-src/*.js; DO NOT EDIT BY HAND.
 * Regenerate with: node scripts/build-apex-runtime.mjs
 *
 * ${entries.length} modules, ${entries.reduce((s, e) => s + e.lines, 0)} lines,
 * ${(entries.reduce((s, e) => s + e.bytes, 0) / 1024).toFixed(0)} KB of plain browser JavaScript with no
 * dependencies and no network access. The composer inlines only the modules a
 * blueprint asks for, so a generated project carries nothing it does not use.
 */

export interface ApexModuleDef {
  id: string;
  title: string;
  domain: string;
  tags: string[];
  needs: string[];
  order: number;
  source: string;
  lines: number;
  bytes: number;
  code: string;
}

export const APEX_MODULES: ApexModuleDef[] = [
${body}
];

export const APEX_MODULE_IDS: string[] = APEX_MODULES.map((m) => m.id);

export function apexModule(id: string): ApexModuleDef | undefined {
  return APEX_MODULES.find((m) => m.id === id);
}

export const APEX_MODULE_STATS = {
  count: ${entries.length},
  lines: ${entries.reduce((s, e) => s + e.lines, 0)},
  bytes: ${entries.reduce((s, e) => s + e.bytes, 0)},
};
`;

writeFileSync(out, header, "utf8");
console.log(
  `✓ wrote src/lib/apex/modules.ts — ${entries.length} modules, ${entries.reduce((s, e) => s + e.lines, 0)} lines, ` +
    `${(entries.reduce((s, e) => s + e.bytes, 0) / 1024).toFixed(0)} KB, every file syntax-checked`
);
