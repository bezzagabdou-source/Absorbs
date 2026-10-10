/**
 * REAL verification of a generated single-file HTML game / app — before the user ever sees it.
 *
 * It PARSES every script (node:vm compile) and then SMOKE-RUNS the game against a fake browser inside a
 * locked-down vm context (no network / fs / process, hard time limit; see game-smoke.ts).
 * Server-only (node:vm). Catches the failures that make "the game does not run":
 *   - JavaScript syntax errors (truncation, duplicate declarations, stray braces ...)
 *   - getElementById('x') used directly but no element / creation of id "x" exists  (null crash on boot)
 *   - inline handlers (onclick="fn()") that call a function that is never defined     (dead buttons)
 */
import { smokeRun } from "@/lib/game-smoke";
import vm from "node:vm";

export type Issue = {
  level: "error" | "warn";
  message: string;
  /** line inside the HTML document (1-based) when known */
  line?: number;
  /** numbered source lines around the problem, for the repair prompt */
  context?: string;
};

export type HtmlBlock = { start: number; end: number; code: string };

/** The single ```html block of an answer (null when there is none or when the answer is a multi-file project). */
export function findHtmlBlock(text: string): HtmlBlock | null {
  const re = /```html?[^\n]*\n/gi;
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  const close = text.indexOf("```", start);
  const end = close < 0 ? text.length : close;
  const code = text.slice(start, end);
  if (!/<html[\s>]|<!doctype/i.test(code)) return null;
  // exactly ONE html block and no js/css/json files = a single-file build; anything else is a multi-file project
  const langs = [...text.matchAll(/```([a-z]*)[^\n]*\n/gi)].map((x) => x[1].toLowerCase());
  const htmlN = langs.filter((l) => l === "html" || l === "htm").length;
  const other = langs.filter((l) => ["js", "javascript", "css", "json", "ts", "tsx", "jsx"].includes(l)).length;
  if (htmlN !== 1 || other > 0) return null;
  return { start, end, code };
}

function numbered(lines: string[], from: number, to: number): string {
  const out: string[] = [];
  for (let i = Math.max(0, from); i < Math.min(lines.length, to); i++) out.push(`${i + 1}| ${lines[i].slice(0, 220)}`);
  return out.join("\n");
}

const JS_TYPE = /^(?:|text\/javascript|application\/javascript|text\/ecmascript|application\/ecmascript)$/i;

export function verifyHtml(code: string): Issue[] {
  const issues: Issue[] = [];
  const all = code.split("\n");

  /* ---------- 1. JavaScript syntax of every classic inline script ---------- */
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let sm: RegExpExecArray | null;
  const jsBodies: string[] = [];
  const scriptsForRun: { body: string; startLine: number }[] = [];
  let syntaxBroken = false;
  while ((sm = scriptRe.exec(code))) {
    const attrs = sm[1] ?? "";
    const body = sm[2] ?? "";
    if (/\bsrc\s*=/i.test(attrs) || body.trim().length === 0) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] ?? "";
    if (!JS_TYPE.test(type)) continue; // module / json / importmap / template
    jsBodies.push(body);
    const startLine = code.slice(0, sm.index + sm[0].indexOf(">") + 1).split("\n").length; // line where the body starts
    scriptsForRun.push({ body, startLine });
    try {
      new vm.Script(body, { filename: "inline.js" });
    } catch (e) {
      syntaxBroken = true;
      const err = e as Error;
      const stack = String(err.stack ?? "");
      const lm = /inline\.js:(\d+)/.exec(stack);
      const rel = lm ? Number(lm[1]) : 0;
      const docLine = rel > 0 ? startLine + rel - 1 : undefined;
      issues.push({
        level: "error",
        message: `JavaScript syntax error: ${err.message}`,
        line: docLine,
        context: docLine ? numbered(all, docLine - 8, docLine + 6) : undefined,
      });
    }
  }
  const js = jsBodies.join("\n");

  /* ---------- 1b. SMOKE RUN: really execute the game against a fake browser (dead buttons, ReferenceError, TDZ ...) ---------- */
  if (!syntaxBroken) {
    try {
      for (const si of smokeRun(scriptsForRun)) {
        issues.push({
          level: si.level,
          message: si.message,
          line: si.line,
          context: si.line ? numbered(all, si.line - 6, si.line + 5) : undefined,
        });
      }
    } catch {
      /* the harness must never block a build */
    }
  }

  /* ---------- 2. ids that scripts need but the page never provides ---------- */
  const known = new Set<string>();
  for (const m of code.matchAll(/\bid\s*=\s*\\?["']([\w-]+)\\?["']/g)) known.add(m[1]);
  for (const m of code.matchAll(/\bid\s*:\s*["']([\w-]+)["']/g)) known.add(m[1]);
  for (const m of code.matchAll(/\.id\s*=\s*["']([\w-]+)["']/g)) known.add(m[1]);
  for (const m of code.matchAll(/setAttribute\(\s*["']id["']\s*,\s*["']([\w-]+)["']/g)) known.add(m[1]);
  const seen = new Set<string>();
  for (const m of js.matchAll(/getElementById\(\s*["']([\w-]+)["']\s*\)(\s*\.|\s*;|\s*\))?/g)) {
    const id = m[1];
    if (known.has(id) || seen.has(id)) continue;
    seen.add(id);
    const direct = !!m[2] && m[2].trim().startsWith(".");
    const lineNo = all.findIndex((l) => l.includes(`getElementById('${id}')`) || l.includes(`getElementById("${id}")`)) + 1;
    issues.push({
      level: direct ? "error" : "warn",
      message: `getElementById("${id}") but no element with id="${id}" exists${direct ? " and its result is used directly (null crash)" : ""}`,
      line: lineNo || undefined,
      context: lineNo ? numbered(all, lineNo - 4, lineNo + 3) : undefined,
    });
  }

  /* ---------- 3. inline handlers that call undefined functions ---------- */
  const defined = new Set<string>();
  for (const m of js.matchAll(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
  for (const m of js.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
  for (const m of js.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
  for (const m of js.matchAll(/(?:^|[;\s{}])([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/gm)) defined.add(m[1]);
  const GLOBALS = new Set(["alert", "confirm", "prompt", "setTimeout", "setInterval", "event", "this", "if", "return", "document", "window", "history", "location", "console", "parseInt", "parseFloat", "Math", "navigator", "open", "close", "print", "toggle"]);
  const hseen = new Set<string>();
  for (const m of code.matchAll(/\bon(?:click|input|change|submit|keydown|keyup|pointerdown|touchstart)\s*=\s*"([^"]*)"/gi)) {
    for (const c of m[1].matchAll(/(?:^|[;\s(!{])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const fn = c[1];
      if (GLOBALS.has(fn) || defined.has(fn) || hseen.has(fn)) continue;
      hseen.add(fn);
      const lineNo = all.findIndex((l) => l.includes(m[0].slice(0, 60))) + 1;
      issues.push({
        level: "error",
        message: `inline handler calls ${fn}() but no function named ${fn} is defined (a dead button)`,
        line: lineNo || undefined,
        context: lineNo ? numbered(all, lineNo - 2, lineNo + 2) : undefined,
      });
    }
  }
  /* ---------- 4. Three.js: wrong version / missing engine / APIs that do not exist in r128 ---------- */
  const usesThree = /\bTHREE\./.test(js);
  if (usesThree) {
    const threeTag = /<script[^>]+src=["']([^"']*three[^"']*)["'][^>]*>/i.exec(code)?.[1];
    if (!threeTag && !/NexusNet\.script\(/.test(js)) {
      issues.push({ level: "error", message: 'THREE is used but the engine is never loaded. Add <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script> in <head>.' });
    } else if (threeTag && !/three\.js\/r128\/three\.min\.js/.test(threeTag)) {
      issues.push({ level: "error", message: `Three.js is loaded from "${threeTag}" (module / other version). Only https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js as a plain <script> works here.` });
    }
    const bad: [RegExp, string][] = [
      [/THREE\.CapsuleGeometry/, "THREE.CapsuleGeometry does not exist in r128 (use CylinderGeometry + 2 SphereGeometry)"],
      [/new\s+THREE\.Geometry\s*\(/, "THREE.Geometry was removed (use BufferGeometry)"],
      [/outputColorSpace|\.colorSpace\s*=|THREE\.SRGBColorSpace|THREE\.ColorManagement/, "colorSpace API does not exist in r128 (use renderer.outputEncoding = THREE.sRGBEncoding)"],
      [/THREE\.(OrbitControls|GLTFLoader|PointerLockControls|FontLoader|TextGeometry|EffectComposer|FirstPersonControls|DRACOLoader)\b/, "this Three.js add-on is not loaded (write the controller / use primitives and HTML text instead)"],
    ];
    for (const [re, msg] of bad) {
      const m = re.exec(js);
      if (!m) continue;
      const lineNo = all.findIndex((l) => re.test(l)) + 1;
      issues.push({ level: "error", message: msg, line: lineNo || undefined, context: lineNo ? numbered(all, lineNo - 3, lineNo + 3) : undefined });
    }
    if (/^\s*import\s[^;]*from\s+["']three["']/m.test(code) || /<script[^>]+type=["']importmap["']/i.test(code)) {
      issues.push({ level: "error", message: 'ES module / importmap for three is not supported here. Use the plain r128 <script> tag and the global THREE.' });
    }
  }
  return issues;
}

export const hardErrors = (issues: Issue[]): Issue[] => issues.filter((i) => i.level === "error");
