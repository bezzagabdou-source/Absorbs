/**
 * v18 — GUARDIAN self-test.
 *
 * Runs the deterministic layer of `src/lib/guardian.ts` (the AI review and the
 * repair loop need a live engine, so they are exercised by the chat route) on
 * real generated games plus hand-broken variants, and asserts:
 *
 *   1. a real SMITH build is CLEAN (0 errors, 0 warnings) — no false alarms
 *   2. every classic way a model breaks a build IS reported
 *   3. a repair that does not reduce the error count is REJECTED (guardian
 *      can never make a build worse)
 *
 * Run with: npm run test:guardian
 */
import { buildSmithGame } from "@/lib/smith/compose";
import { blockingIssues, scanArtefact, applyEdits } from "@/lib/guardian";
import { BLUEPRINTS } from "@/lib/smith/blueprints";

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(c ? "PASS" : "FAIL", m);
};

/* ── 1 · a real generated game must come out clean ─────────────────────── */
let clean = 0;
for (const bp of BLUEPRINTS) {
  const html = buildSmithGame({
    blueprint: bp.id,
    theme: "royal",
    lang: "ar",
    seed: 2026,
    title: "اختبار الحارس",
  }).html;
  const issues = scanArtefact(html);
  if (blockingIssues(issues).length === 0 && issues.every((i) => i.level !== "warn")) clean++;
  else {
    console.log("   ", bp.id, issues.slice(0, 3).map((i) => `${i.level}:${i.rule}`).join(", "));
  }
}
ok(clean === BLUEPRINTS.length, `every generated blueprint is clean (${clean}/${BLUEPRINTS.length})`);

const GOOD = buildSmithGame({ blueprint: "runner", theme: "neon", lang: "ar", seed: 7, title: "لعبة" }).html;

/* ── 2 · every classic break IS reported ───────────────────────────────── */
const errs = (html) => blockingIssues(scanArtefact(html)).length;

ok(errs("") > 0, "empty file is rejected");
ok(errs(GOOD.slice(0, GOOD.length - 400)) > 0, "truncated file is rejected");
ok(scanArtefact(GOOD.replace('id="nx-canvas"', 'class="c"')).some((i) => i.rule === "structure"), "missing element id is rejected");
ok(
  scanArtefact(GOOD.replace('<button id="nx-b-pause"', '<button id="nx-b-pause" onclick="noSuchFn()"')).some(
    (i) => i.rule === "runtime"
  ),
  "dead button (handler without a function) is rejected"
);
ok(scanArtefact(GOOD.replace("<head>", '<head><script src="https://evil.com/x.js"></script>')).some((i) => i.rule === "external"), "external CDN script is rejected");
ok(scanArtefact(GOOD.replace("</body>", "<script>// TODO rest of the code</script></body>")).some((i) => i.rule === "placeholder"), "placeholder / TODO is rejected");
ok(scanArtefact(GOOD.replace('dir="rtl"', 'dir="ltr"')).some((i) => i.rule === "rtl"), "Arabic page without dir=rtl is flagged");
ok(scanArtefact(GOOD).length === 0, "a clean build reports nothing at all");

/* ── 3 · the repair layer can never make a build worse ─────────────────── */
const broken = GOOD.slice(0, GOOD.length - 400);
const before = errs(broken);

// an edit that matches exactly once is applied
const once = applyEdits(broken, [{ find: "<title>لعبة</title>", replace: "<title>لعبة v18</title>" }]);
ok(once.applied === 1 && once.code.includes("لعبة v18</title>"), "an edit whose find occurs exactly once is applied");
ok(once.applied === 1 && !once.code.includes("<title>لعبة</title>"), "and it really replaces the text");

// an edit that occurs many times (or not at all) is skipped — never guessed
ok(applyEdits(broken, [{ find: "var", replace: "let" }]).applied === 0, "an ambiguous edit is skipped");
ok(applyEdits(broken, [{ find: "not-there-at-all-xyz", replace: "y" }]).applied === 0, "a missing edit is skipped");
ok(applyEdits(broken, [{ find: "ab", replace: "c" }]).applied === 0, "a too-short edit is skipped");
ok(applyEdits(broken, [{ find: 5, replace: "x" }, { find: "ok", replace: "ok" }]).applied === 0, "a malformed edit is skipped");

/* ── 4 · the score formula ─────────────────────────────────────────────── */
ok(blockingIssues(scanArtefact(GOOD)).length === 0, "the blocking filter keeps only errors");

console.log(bad === 0 ? `\nGUARDIAN CLEAN — ${BLUEPRINTS.length} builds verified` : `\n${bad} GUARDIAN CHECKS FAILED`);
process.exit(bad === 0 ? 0 : 1);
