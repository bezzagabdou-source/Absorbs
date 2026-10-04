/**
 * MEGA PROJECTS — big sites / games delivered as a ZIP of many files.
 *
 *   limits: up to 100 files, up to 5 MB of source in total.
 *   how:    1) the architect plans the file tree + a shared "contract"
 *           2) every file is generated in its OWN request (fresh time + token budget)
 *           3) the browser drives the loop (retries, resume, never stops) and zips the result
 *
 * This module is shared by the browser and the API route: no server-only imports here.
 */

export const MEGA_MAX_FILES = 100;
export const MEGA_MAX_TOTAL = 5 * 1024 * 1024; // 5 MB of source
export const MEGA_MAX_FILE = 400_000; // characters in a single file

export type MegaPlanFile = { path: string; desc: string; needs: string[]; kb: number };
export type MegaPlan = { title: string; kind: string; contract: string; files: MegaPlanFile[] };

const ALLOWED_EXT = new Set(["html", "css", "js", "json", "svg", "md", "txt", "xml", "webmanifest"]);

/** A safe relative path inside the zip, or null. */
export function safePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const p = raw.trim().replace(/\\/g, "/").replace(/^(\.\/|\/)+/, "");
  if (!p || p.length > 120) return null;
  if (!/^[\w.\-/]+$/.test(p)) return null;
  if (p.split("/").some((seg) => seg === ".." || seg === "." || seg === "")) return null;
  const dot = p.lastIndexOf(".");
  const ext = dot >= 0 ? p.slice(dot + 1).toLowerCase() : "";
  return ALLOWED_EXT.has(ext) ? p : null;
}

/** Reads the architect's JSON (tolerates fences / stray text around it). */
export function parsePlan(text: string): MegaPlan | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { title?: unknown; kind?: unknown; contract?: unknown; files?: unknown };
  if (!Array.isArray(r.files)) return null;

  const seen = new Set<string>();
  const files: MegaPlanFile[] = [];
  for (const f of r.files) {
    if (!f || typeof f !== "object") continue;
    const x = f as { path?: unknown; desc?: unknown; needs?: unknown; kb?: unknown };
    const path = safePath(x.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const kb = typeof x.kb === "number" && x.kb > 0 ? Math.min(Math.round(x.kb), 250) : 12;
    files.push({
      path,
      desc: typeof x.desc === "string" ? x.desc.slice(0, 400) : "",
      needs: Array.isArray(x.needs) ? x.needs.map(safePath).filter((n): n is string => !!n).slice(0, 4) : [],
      kb,
    });
    if (files.length >= MEGA_MAX_FILES) break;
  }
  if (files.length === 0) return null;
  // the entry point must exist, and it comes last so it can wire everything that was built before it
  const idx = files.findIndex((f) => f.path === "index.html");
  if (idx >= 0) {
    const [entry] = files.splice(idx, 1);
    files.push(entry);
  } else if (files.length < MEGA_MAX_FILES) {
    files.push({
      path: "index.html",
      desc: "Entry page: loads every stylesheet and script in dependency order",
      needs: files.filter((f) => /\.(css|js)$/.test(f.path)).slice(0, 4).map((f) => f.path),
      kb: 8,
    });
  }
  const valid = new Set(files.map((f) => f.path));
  for (const f of files) f.needs = f.needs.filter((n) => valid.has(n) && n !== f.path);

  return {
    title: typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 80) : "Barq project",
    kind: typeof r.kind === "string" ? r.kind.slice(0, 20) : "site",
    contract: typeof r.contract === "string" ? r.contract.slice(0, 8000) : "",
    files,
  };
}

/** Takes the file out of the model's answer (fenced block or raw text). */
export function extractFile(answer: string): string {
  const t = answer.replace(/^\uFEFF/, "");
  const m = /^\s*(`{3,})[^\n]*\n([\s\S]*?)\n?\1[ \t]*\s*$/.exec(t);
  if (m) return m[2];
  const open = /^\s*`{3,}[^\n]*\n([\s\S]*)$/.exec(t); // fence never closed
  return (open ? open[1] : t).replace(/\n?`{3,}\s*$/, "");
}

/** Cheap structural check so a broken / cut file is regenerated instead of shipped. */
export function fileLooksComplete(path: string, text: string): boolean {
  const s = text.trim();
  if (s.length < 8) return false;
  if (path.endsWith(".json") || path.endsWith(".webmanifest")) {
    try {
      JSON.parse(s);
    } catch {
      return false;
    }
  }
  if (path.endsWith(".html") && /<html[\s>]/i.test(s) && !/<\/html>\s*$/i.test(s)) return false;
  if (path.endsWith(".js")) {
    let depth = 0;
    for (const ch of s.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")) {
      if (ch === "{" || ch === "(" || ch === "[") depth++;
      else if (ch === "}" || ch === ")" || ch === "]") depth--;
    }
    if (depth > 0) return false;
  }
  return true;
}

/** What the other files already expose (names only) — keeps every request small and consistent. */
export function digestOf(path: string, text: string): string {
  const kb = (text.length / 1024).toFixed(0);
  const names = new Set<string>();
  if (path.endsWith(".js")) {
    for (const m of text.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    for (const m of text.matchAll(/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    for (const m of text.matchAll(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)) names.add(m[1]);
    for (const m of text.matchAll(/\b(?:window|APP)\.([A-Za-z_$][\w$.]*)\s*=/g)) names.add(`APP.${m[1].replace(/^APP\./, "")}`);
  } else if (path.endsWith(".html")) {
    for (const m of text.matchAll(/\bid="([^"]{1,40})"/g)) names.add(`#${m[1]}`);
  } else if (path.endsWith(".css")) {
    for (const m of text.matchAll(/--([\w-]{1,30})\s*:/g)) names.add(`--${m[1]}`);
    for (const m of text.matchAll(/^\.([\w-]{1,40})[\s,{:.]/gm)) names.add(`.${m[1]}`);
  }
  const list = [...names].slice(0, 60).join(", ");
  return `- ${path} (${kb} KB)${list ? `: ${list}` : ""}`;
}

/* ------------------------------------------------------------------ */
/* Prompts                                                              */
/* ------------------------------------------------------------------ */

export const PLAN_SYSTEM = `You are the chief architect of Barq Pro. You plan a COMPLETE static web project (a site, web app or game) that is delivered as a ZIP and opens by double-clicking index.html or on any static host.

Return ONLY one JSON object — no prose, no code fence:
{"title": string, "kind": "game" | "site" | "app", "contract": string, "files": [{"path": string, "desc": string, "needs": [string], "kb": number}]}

HARD RULES
- At most ${MEGA_MAX_FILES} files and about ${(MEGA_MAX_TOTAL / 1024 / 1024).toFixed(0)} MB of source in total (the sum of "kb" must stay below 4800). One file stays under 150 KB.
- Use as many files as the project really needs: small idea 8-15, medium 20-45, very big 60-${MEGA_MAX_FILES}. If the user states a number of files or a size, follow it (within the limits above). Never pad with filler: every file has a real job.
- Allowed file types: html css js json svg md txt. No npm, no build step, no CDN, no remote fonts or images, no network calls.
- It must work from file://. So: classic <script src="..."> tags (NOT ES modules, NO import/export, NO fetch of local files). Data (levels, items, translations, content) lives in .js files that assign into ONE global namespace (window.APP = window.APP || {}; APP.levels = [...]).
- List files in BUILD ORDER (config/data → core/engine → systems → UI → styles → pages); every file may rely only on files before it. "needs" = the (max 4) earlier files whose exact code this file depends on. index.html is last and loads every css/js in dependency order.
- Games: split by system (engine loop, input, physics/collision, audio, entities, enemies, levels in several files, UI/menus, save/load, achievements…). Sites/apps: pages, components, data, styles, utilities.
- "contract" (up to 6000 characters, plain text): the global namespace, script load order, CSS design tokens and the shared class names, DOM ids, function signatures, data schemas, localStorage keys, language/RTL rules. Every file will be written separately by different workers who only see this contract — make it precise enough that the pieces fit together on the first try.
- "desc": 1-2 sentences saying exactly what the file contains.
- Write title / desc in the user's language.`;

export function planUserPrompt(prompt: string): string {
  return `Project request:\n${prompt.slice(0, 12_000)}`;
}

export const FILE_SYSTEM = `You are a senior engineer on the Barq Pro team. You write ONE file of a larger static project; other engineers write the other files at the same time.

OUTPUT: only the complete file inside a single fenced code block with the correct language tag (use a four-backtick fence for .md files). No words before or after the block.

RULES
- Follow the CONTRACT exactly: namespace, ids, class names, signatures, data schemas, storage keys.
- Use only the names that other files really expose (see the file digest). Never invent functions from other files; if you need something small, implement it inside your own file.
- Write the file in FULL, production quality: never abbreviate, never leave placeholders, TODOs or "rest of the code here". Reach the target size with real content and logic, not filler or blank lines.
- Classic scripts only (no import/export), no network, no remote assets. Phone first, touch + keyboard, RTL when the UI language is Arabic.
- Close every tag, bracket and function. Mentally run the code before answering.`;

export type MegaFileRequest = {
  prompt: string;
  title: string;
  contract: string;
  plan: { path: string; desc: string; kb: number }[];
  path: string;
  desc: string;
  kb: number;
  digest: string;
  needTexts: { path: string; text: string }[];
};

export function fileUserPrompt(r: MegaFileRequest): string {
  const tree = r.plan.map((f) => `- ${f.path} (~${f.kb} KB): ${f.desc}`).join("\n");
  const needs = r.needTexts.map((n) => `\n----- ${n.path} (full code) -----\n${n.text}`).join("\n");
  return [
    `PROJECT: ${r.title}`,
    `USER REQUEST:\n${r.prompt}`,
    `CONTRACT:\n${r.contract || "(none — keep names simple and consistent)"}`,
    `FILE TREE:\n${tree}`,
    r.digest ? `ALREADY WRITTEN (names they expose):\n${r.digest}` : "",
    needs ? `FILES YOU DEPEND ON:${needs}` : "",
    `YOUR FILE: ${r.path}\nWHAT IT CONTAINS: ${r.desc}\nTARGET SIZE: about ${r.kb} KB (at least 70% of it, all real content).\nWrite ${r.path} now.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
