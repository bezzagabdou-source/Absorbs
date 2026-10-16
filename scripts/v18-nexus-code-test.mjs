/**
 * NEXUS CODE — smoke test (v18).
 *
 * Proves the constitution is not decoration:
 *   1. it is really attached to every model path (free, Pro, team, MAX, MEGA)
 *   2. `### FILE: path` becomes real files (ZIP + cards + studio)
 *   3. `[[CONTINUE: …]]` triggers a server-side continuation and never reaches the reader
 *   4. unsupported claims («تم النشر», «100 % تحقق») are rewritten, honest ones survive
 *   5. the checklist catches what the contract forbids, on real output
 *   6. the streaming guard works chunk-by-chunk, markers split across reads
 *
 * Run: npm run smoke:code
 */

import { readFileSync } from "node:fs";
import {
  NEXUS_CODE_SYSTEM,
  NEXUS_CODE_BUILD_ADDON,
  NEXUS_CODE_FILE_CONTRACT,
  parseFileBlocks,
  safeFilePath,
  findContinueMarker,
  stripContinueMarkers,
  sanitizeClaims,
  codeChecklist,
  withNexusProtocol,
  withContractRepair,
  isNexusDeliverable,
} from "../src/lib/nexus-code.ts";
import { codeBlocks, filesFromReply, fileHeaderOf } from "../src/lib/zip.ts";

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/* ─────────────────────────── 1. the constitution is wired ─────────────────────────── */
const chatRoute = readFileSync("src/app/api/ai/chat/route.ts", "utf8");
const megaLib = readFileSync("src/lib/mega.ts", "utf8");

check("constitution text is complete", /NEXUS CODE/.test(NEXUS_CODE_SYSTEM) && /\[\[CONTINUE/.test(NEXUS_CODE_SYSTEM) && /### FILE:/.test(NEXUS_CODE_SYSTEM), `${NEXUS_CODE_SYSTEM.length} chars`);
check(
  "every rule section present (§1..§9)",
  ["محوّل الطلبات", "سير العمل الإلزامي", "منع التوقف", "الصدق", "المراجعة الذاتية", "معايير الجودة", "سلوك الوكيل", "الأمان", "أسلوب الرد"].every((h) => NEXUS_CODE_SYSTEM.includes(h))
);
check("build addon mentions the marker", /CONTINUE/.test(NEXUS_CODE_BUILD_ADDON) && /### FILE:/.test(NEXUS_CODE_BUILD_ADDON));
check("file contract is short and strict", NEXUS_CODE_FILE_CONTRACT.length < 700 && /TODO/.test(NEXUS_CODE_FILE_CONTRACT));

const routeUses = (chatRoute.match(/NEXUS_CODE_SYSTEM/g) ?? []).length;
check("wired into every chat path (free + Pro + team + MAX + resume)", routeUses >= 5, `${routeUses} occurrences`);
check("free path also gets it (same rules, smaller budget)", /CHAT_SYSTEM_V6 \+ schoolBlock[^\n]*NEXUS_CODE_SYSTEM/.test(chatRoute));
check("MEGA file writer gets the file contract", /NEXUS_CODE_FILE_CONTRACT/.test(megaLib));
check(
  "the free continuation path is guarded too (stream + stored text)",
  /streamToResponse\(withNexusProtocol\(stream/.test(chatRoute) && /sanitizeClaims\(stripContinueMarkers\(full\.slice\(seed\.length\)\)/.test(chatRoute)
);
check(
  "stream guard + persistence + repair round are attached",
  /withNexusProtocol\(/.test(chatRoute) && /withContractRepair\(/.test(chatRoute) && /sanitizeClaims\(/.test(chatRoute)
);

/* ─────────────────────────── 2. `### FILE:` → real files ─────────────────────────── */
const multi = [
  "خطة سريعة: متجر.",
  "### FILE: index.html",
  "```html",
  "<!doctype html><html><body><h1>متجر</h1><script src=\"js/app.js\"></script></body></html>",
  "```",
  "### FILE: css/style.css",
  "```css",
  "body { font-family: system-ui; }",
  "```",
  "### FILE: js/app.js",
  "```js",
  "const cart = []; function add(x){ cart.push(x); return cart.length; }",
  "```",
].join("\n");

const blocks = parseFileBlocks(multi);
check("parses every declared file", blocks.length === 3, blocks.map((b) => b.path).join(", "));
check("paths are exact", blocks.map((b) => b.path).join("|") === "index.html|css/style.css|js/app.js");
check("languages detected", blocks[0].lang === "html" && blocks[1].lang === "css" && blocks[2].lang === "js");
check("origin reported as header", blocks.every((b) => b.from === "header"));
check("closed files flagged complete", blocks.every((b) => b.complete));

const alt =
  "**FILE:** src/main.js\n```js\nconst x = 1;\n```\n\n// FILE: lib/util.js\n```js\nexport const y = 2;\n```\n\n===== FILE: style.css =====\n```css\n* { box-sizing: border-box; }\n```";
const altBlocks = parseFileBlocks(alt);
check("accepts **FILE:**, // FILE: and ===== FILE: =====", altBlocks.map((b) => b.path).join("|") === "src/main.js|lib/util.js|style.css", altBlocks.map((b) => b.path).join("|"));

const fencePath = "```js/app.js\nfunction boot(){ return 1; }\n```";
check("fence-line path still works", parseFileBlocks(fencePath)[0]?.path === "js/app.js");

const truncated = "### FILE: app.js\n```js\nfunction a(){ if (1) { return;\n";
const tr = parseFileBlocks(truncated)[0];
check("truncated block is detected (not 'complete')", tr && tr.complete === false && tr.code.includes("function a"));

const escapes = ["../../etc/passwd", "..\\..\\win.ini", "/etc/passwd", "C:\\win\\a.js", "a/../../../b.js"];
const safe = escapes.map((e) => safeFilePath(e));
check(
  "traversal/absolute paths never escape",
  safe[0] === null && safe[1] === null && safe[3] === null && safe[4] === null && (safe[2] === null || !safe[2].startsWith("/")),
  JSON.stringify(safe),
);
check("nothing keeps a `..` segment", safe.filter(Boolean).every((x) => !x.includes("..")), JSON.stringify(safe.filter(Boolean)));
check("normal paths survive", safeFilePath("./js/app.js") === "js/app.js" && safeFilePath("src/a/b.ts") === "src/a/b.ts");

/* the ZIP / file-card path must see the same names */
const zipped = filesFromReply(multi);
const zipPaths = zipped.map((f) => f.path);
check("ZIP build uses the declared paths", zipPaths.includes("css/style.css") && zipPaths.includes("js/app.js"), zipPaths.join(", "));
check("fileHeaderOf reads a bare header", fileHeaderOf("### FILE: js/app.js") === "js/app.js" && fileHeaderOf("نص عادي") === null);
check("codeBlocks carries the header name", codeBlocks(multi).some((b) => b.file === "css/style.css"));

/* ─────────────────────────── 3. `[[CONTINUE: …]]` ─────────────────────────── */
const withMark = "### FILE: a.js\n```js\nconst a = 1;\n```\n[[CONTINUE: b.js, c.css]]";
const found = findContinueMarker(withMark);
check("marker recognised, remaining files named", found.found && found.files.join("|") === "b.js|c.css", found.files.join("|"));
check("marker removed from the visible text", !stripContinueMarkers(withMark).includes("[["), JSON.stringify(stripContinueMarkers(withMark).slice(-24)));
check("no marker → clean pass-through", findContinueMarker("كود عادي").found === false && stripContinueMarkers("كود عادي") === "كود عادي");
check("empty marker tolerated", findContinueMarker("[[CONTINUE]]").found && findContinueMarker("[[CONTINUE]]").files.length === 0);
check("localised spelling tolerated", findContinueMarker("[[ CONTINUE : باقي الملفات ]]").found);

/* ─────────────────────────── 4. الصدق ─────────────────────────── */
const lie = "تم النشر على Vercel بنجاح! هذا هو الرابط: app.vercel.app ومشروعك جاهز 100% تحقق من كل شيء.";
const fixedNoUrl = sanitizeClaims(lie, { hasLiveUrl: false });
check("unsupported publish claims rewritten", fixedNoUrl.hits.length >= 2 && !/تم النشر على Vercel/.test(fixedNoUrl.text), fixedNoUrl.hits.join(","));
check("fake 100% removed", !/100\s*%/.test(fixedNoUrl.text) && !/هذا هو الرابط/.test(fixedNoUrl.text));
const fixedWithUrl = sanitizeClaims(lie, { hasLiveUrl: true });
check("a real live URL keeps publish wording", /تم النشر على Vercel/.test(fixedWithUrl.text));
const honest = "الملفات جاهزة، شغّلها بفتح index.html. عدد الأسطر 1240 ملفًا واحدًا.";
check("honest answers are untouched", sanitizeClaims(honest, {}).text === honest);
check("tests claim replaced honestly", /لم تُشغَّل اختبارات/.test(sanitizeClaims("جميع الاختبارات نجحت", {}).text));

/* ─────────────────────────── 5. المراجعة الذاتية ─────────────────────────── */
const bad = "### FILE: app.js\n```js\nfunction save(){ /* TODO */ }\nconst tail = 1;\n```";
const badReport = codeChecklist(bad);
check("checklist catches TODOs/placeholders", badReport.findings.some((f) => f.id === "placeholder"), badReport.findings.map((f) => f.id).join(","));
check("checklist catches an unclosed file", codeChecklist("### FILE: a.js\n```js\nif (x) { y();\n").findings.some((f) => f.id === "cut"));
check("checklist catches duplicate ids", codeChecklist("### FILE: i.html\n```html\n<div id=\"a\"></div><div id=\"a\"></div>\n```").findings.some((f) => f.id === "dup-id"));
check("checklist catches an undefined handler", codeChecklist("### FILE: i.html\n```html\n<button onclick=\"doThing()\">x</button>\n```").findings.some((f) => f.id === "handler"));
check("clean code passes the checklist", codeChecklist(multi).ok === true, JSON.stringify(codeChecklist(multi).findings));

const crossFile =
  "### FILE: index.html\n```html\n<button onclick=\"openCart()\">سلة</button><button onclick=\"alert('مرحبا')\">تنبيه</button>\n```\n" +
  "### FILE: js/app.js\n```js\nfunction openCart(){ return 1; }\n```";
check("a handler defined in another file is fine", !codeChecklist(crossFile).findings.some((f) => f.id === "handler"), JSON.stringify(codeChecklist(crossFile).findings.map((f) => f.id)));
check("built-in handlers (alert) are fine", !codeChecklist("### FILE: i.html\n```html\n<button onclick=\"alert('x')\">x</button>\n```").findings.some((f) => f.id === "handler"));
check("checklist counts the real output", codeChecklist(multi).files === 3 && codeChecklist(multi).lines >= 3, `files=${codeChecklist(multi).files} lines=${codeChecklist(multi).lines}`);
check("deliverable detector works", isNexusDeliverable(multi) === true && isNexusDeliverable("مرحبا") === false);

/* ─────────────────────────── 6. البثّ والإصلاح ─────────────────────────── */
const streamOf = (chunks) =>
  new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });

async function collect(streamText, ms = 4000) {
  const reader = streamText.getReader();
  let out = "";
  const stall = new Promise((_, reject) => setTimeout(() => reject(new Error(`stream stalled after ${ms}ms (got ${JSON.stringify(out.slice(-40))})`)), ms));
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), stall]);
      if (done) break;
      out += value;
    }
  } catch (e) {
    console.log(`FAIL  ${e.message}`);
    fail++;
    throw e;
  }
  return out;
}

/* the marker is split across three reads: it must still never reach the reader */
const chunked = await collect(
  withNexusProtocol(streamOf(["سطر عادي\n", "### FILE: a.js\n", "```js\n", "const a = 1;\n", "```\n", "[[CONTI", "NUE: b.js]]", "\n", "بعد المتابعة\n"]), { hasLiveUrl: false })
);
check("marker split across reads never leaks", !chunked.includes("[["), JSON.stringify(chunked.slice(-30)));
check("content around the marker survives", chunked.includes("const a = 1;") && chunked.includes("بعد المتابعة"));

const guarded = await collect(withNexusProtocol(streamOf(["تم النشر على GitHub!\n"]), { hasLiveUrl: false }));
check("claims are cleaned on the stream too", !/تم النشر على GitHub/.test(guarded), JSON.stringify(guarded));
const kept = await collect(withNexusProtocol(streamOf(["تم النشر على GitHub!\n"]), { hasLiveUrl: true }));
check("live URL keeps the claim on the stream", /تم النشر على GitHub/.test(kept));

let repaired = 0;
const repairStream = withContractRepair(streamOf(["### FILE: a.js\n```js\nfunction save(){ /* TODO */ }\n```\n"]), {
  repair: async (req) => {
    repaired++;
    if (!req.files.includes("a.js")) return null;
    return streamOf(["### FILE: a.js\n```js\nfunction save(){ const rows = [1,2]; return rows.length; }\n```\n"]);
  },
});
const afterRepair = await collect(repairStream);
check("one repair round runs for a broken file", repaired === 1, `files=${"(a.js)"}`);
check("the repaired file appears in the answer", afterRepair.includes("rows.length") && /إصلاح آلي/.test(afterRepair));

let loops = 0;
const noLoop = await collect(
  withContractRepair(streamOf(["### FILE: a.js\n```js\nfunction save(){ /* TODO */ }\n```\n"]), {
    repair: async () => {
      loops++;
      return loops > 3 ? null : streamOf(["### FILE: a.js\n```js\nfunction save(){ /* TODO */ }\n```\n"]);
    },
  })
);
check("repair never loops (one round by default)", loops === 1, `${loops} calls`);
check("an expired deadline skips the repair", (await collect(withContractRepair(streamOf([bad]), { repair: async () => { loops++; return null; }, deadlineAt: Date.now() - 1 }))).length > 0);

/* ── fidelity: what the reader sees must be exactly what the model wrote ── */
const original = [
  "### FILE: js/app.js",
  "```js",
  "function load() {",
  "    const rows = [1, 2];",   /* 4 spaces of indentation */
  "    return rows.length;",
  "}",
  "```",
  "[[CONTINUE: css/style.css]]",
  "",
  "### FILE: css/style.css",
  "```css",
  ".card {",
  "    padding: 2rem;",
  "}",
  "```",
  "",
  "تمّت كتابة الملفين، الباقي ملف واحد.",
  "",
].join("\n");
const expected = original.replace("[[CONTINUE: css/style.css]]\n\n", "");

/* one chunk per line, exactly as a stream would deliver them (no extra final newline) */
const rawLines = original.split("\n");
const asChunks = rawLines.map((line, i) => (i < rawLines.length - 1 ? line + "\n" : line));
const streamed = await collect(withNexusProtocol(streamOf(asChunks), { hasLiveUrl: false }));
check("streamed answer keeps every newline (no collapse at chunk edges)", streamed === expected, streamed === expected ? "" : JSON.stringify(streamed.slice(0, 90)));
check("indentation survives streaming", streamed.includes("    const rows = [1, 2];") && streamed.includes("    padding: 2rem;"));
check("no marker and no blank gap left behind", !streamed.includes("[[") && !streamed.includes("\n\n\n"));

/* hundreds of tiny chunks, marker split inside a line: the O(n) path must hold up */
const tiny = original.split("").map((ch) => ch);
const streamedTiny = await collect(withNexusProtocol(streamOf(tiny), { hasLiveUrl: false }));
check("character-by-character streaming is identical", streamedTiny === expected, streamedTiny === expected ? "" : JSON.stringify(streamedTiny.slice(-40)));

check("stripContinueMarkers keeps the trailing newline", stripContinueMarkers("سطر\n[[CONTINUE: a.js]]\n") === "سطر\n", JSON.stringify(stripContinueMarkers("سطر\n[[CONTINUE: a.js]]\n")));
check("stripContinueMarkers keeps code indentation intact", stripContinueMarkers("    const x = 1;\n").includes("    const x"));

/* an honest answer with Arabic prose keeps its polish, but code is never reformatted */
const claimy = "تم النشر على Vercel بنجاح.\n\nهذا هو الرابط: app.vercel.app";
const striped = sanitizeClaims(claimy, { hasLiveUrl: false }).text;
check("prose cleanup still runs on text-only answers", !/\n{3,}/.test(striped) && !/  /.test(striped), JSON.stringify(striped));
const codey = "### FILE: a.py\n```py\ndef go():\n    return  2\n```";
check("code is never re-formatted by the honesty guard", sanitizeClaims(codey, { hasLiveUrl: false }).text === codey);

/* ─────────────────────────── summary ─────────────────────────── */
console.log(`\n${fail === 0 ? "ALL GOOD" : `${fail} FAILURES`} — ${pass} passed, ${fail} failed · constitution ${NEXUS_CODE_SYSTEM.length} chars`);
process.exit(fail === 0 ? 0 : 1);
