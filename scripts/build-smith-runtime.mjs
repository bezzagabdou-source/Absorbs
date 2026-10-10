/**
 * Regenerates src/lib/smith/runtime.ts from the engine sources in
 * scripts/smith-src/*.js (concatenated in BUILD_ORDER).
 *
 *   node scripts/build-smith-runtime.mjs
 *
 * It fails loudly if the assembled engine does not parse, or if it contains a
 * backtick / `${` (which would break the template literal it is embedded in).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "scripts", "smith-src");
const out = join(root, "src", "lib", "smith", "runtime.ts");

const ORDER = [
  "core.js",
  "state.js",
  "art.js",
  "bp-runner.js",
  "bp-breaker.js",
  "bp-snake.js",
  "bp-shooter.js",
  "bp-climber.js",
  "bp-maze.js",
  "bp-merge.js",
  "bp-memory.js",
  "boot.js",
];

for (const f of ORDER) {
  if (!existsSync(join(src, f))) throw new Error(`missing engine source: scripts/smith-src/${f}`);
}

const js = ORDER.map((f) => readFileSync(join(src, f), "utf8")).join("\n");

if (js.includes("`")) throw new Error("engine contains a backtick — not embeddable");
if (js.includes("${")) throw new Error("engine contains ${ — not embeddable");
if (/<\/script/i.test(js)) throw new Error("engine contains </script");

const probe = join(tmpdir(), `smith-runtime-${process.pid}.js`);
writeFileSync(probe, js, "utf8");
try {
  execFileSync(process.execPath, ["--check", probe], { stdio: "inherit" });
} finally {
  try { writeFileSync(probe, "", "utf8"); } catch { /* ignore */ }
}

const header = `/**
 * NEXUS SMITH — the game runtime, verbatim.
 *
 * AUTO-GENERATED from scripts/smith-src/*.js; DO NOT EDIT BY HAND.
 * Regenerate with: node scripts/build-smith-runtime.mjs
 *
 * The whole engine (core loop, input, procedural audio, particles, HUD, screens
 * and the 8 blueprints) is one plain-JS IIFE with no imports and no network. It
 * is embedded as a string so a generated game is a single downloadable file and
 * the serverless bundle never needs \`fs\` at runtime.
 *
 * Safety rules for anyone editing the engine sources:
 *   - no backticks and no \${ inside the JS (it lives in a template literal)
 *   - no "</script" sequence (compose.ts also escapes it defensively)
 *   - every frame is wrapped in try/catch by the loop, and every DOM / storage /
 *     audio call is guarded, so one bad frame never kills the game
 */

export const SMITH_RUNTIME = String.raw\``;

writeFileSync(out, header + js + "`;\n", "utf8");
const kb = (Buffer.byteLength(js, "utf8") / 1024).toFixed(1);
console.log(`✓ wrote src/lib/smith/runtime.ts (${kb} KB of engine, ${ORDER.length} sources, syntax checked)`);
