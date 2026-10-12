/**
 * Nexus AI v20 — PROJECT BUNDLER + VERIFIER
 * =============================================================================
 * The Game Forge writes a multi-file ES-module project (```index.html, ```src/main.js …).
 * The sandboxed preview can only show ONE document, and relative imports 404 inside it —
 * that was the "black screen / broken game" failure. This module:
 *
 *   1. parseFenceFiles  — reads ```path fences, keeps ONLY the last version of each file.
 *   2. verifyProject    — structural check BEFORE the user sees anything:
 *                         every relative import resolves, every named import is really exported,
 *                         index.html starts the game, no truncated / placeholder files.
 *   3. bundleProject    — turns the file set into ONE self-contained HTML document.
 *                         ES modules keep working: every file becomes a blob: URL and an
 *                         import map rewires "./x.js" → blob (cycles included).
 *   4. latestProject    — picks the files of the CURRENT project out of a whole conversation.
 *   5. NEXUS_DB_SHIM    — window.NexusDB (save/load) that the preview bridges to /api/saves.
 *
 * Pure / isomorphic (no DOM, no node imports) so it can be unit-tested anywhere.
 */
import { assemblePlayableGame } from "@/lib/game-forge";

export interface ProjectFile {
  path: string;
  code: string;
  /** true when the closing fence never arrived (the file was cut off) */
  open?: boolean;
}

export type ProjectIssue = { level: "error" | "warn"; file?: string; message: string };

const PATH_RE = /^[a-z0-9_\-.\/]+\.[a-z0-9]+$/i;
const isJs = (p: string) => /\.m?js$/i.test(p);
const isHtml = (p: string) => /\.html?$/i.test(p);
const isCss = (p: string) => /\.css$/i.test(p);

function cleanPath(info: string): string | null {
  const p = (info || "").trim().replace(/^[a-z]+:/i, "").replace(/^\.?\//, "");
  return p && PATH_RE.test(p) ? p : null;
}

/** Parses ```path fences. The LAST version of each file wins; first-seen order is kept. */
export function parseFenceFiles(text: string, opts: { keepOpen?: boolean } = {}): ProjectFile[] {
  const order: string[] = [];
  const map = new Map<string, ProjectFile>();
  const put = (p: string, code: string, open: boolean) => {
    if (!map.has(p)) order.push(p);
    map.set(p, { path: p, code, open: open || undefined });
  };
  const re = /```([^\n`]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let end = 0;
  while ((m = re.exec(text))) {
    end = re.lastIndex;
    const p = cleanPath(m[1]);
    if (p) put(p, m[2] || "", false);
  }
  if (opts.keepOpen) {
    const tail = /```([^\n`]*)\n([\s\S]*)$/.exec(text.slice(end));
    const p = tail ? cleanPath(tail[1]) : null;
    if (tail && p) put(p, tail[2] || "", true);
  }
  return order.map((p) => map.get(p)!);
}

/** Serialises files back into ```path fences (used to store the de-duplicated answer). */
export function fencesFromFiles(files: ProjectFile[]): string {
  return files.map((f) => "```" + f.path + "\n" + f.code + "```").join("\n\n");
}

/**
 * The files of the project being built right now, taken from a whole conversation
 * (assistant texts, oldest first). A new project starts at the latest text that contains an index.html.
 */
export function latestProject(assistantTexts: string[], opts: { keepOpen?: boolean } = {}): ProjectFile[] {
  let from = 0;
  for (let i = assistantTexts.length - 1; i >= 0; i--) {
    if (parseFenceFiles(assistantTexts[i]).some((f) => isHtml(f.path))) {
      from = i;
      break;
    }
  }
  return parseFenceFiles(assistantTexts.slice(from).join("\n\n"), opts);
}

/* ------------------------------------------------------------------ imports */

function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

/** Resolves "./x.js" / "../y" against the importing file, trying .js and /index.js. */
function resolveRel(from: string, spec: string, byPath: Map<string, ProjectFile>): string | null {
  const parts = spec.startsWith("/") ? [] : dirOf(from).split("/").filter(Boolean);
  for (const seg of spec.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  const cand = parts.join("/");
  for (const c of [cand, `${cand}.js`, `${cand}.mjs`, `${cand}/index.js`]) if (byPath.has(c)) return c;
  return null;
}

const isRelative = (s: string) => s.startsWith("./") || s.startsWith("../") || s.startsWith("/");

// import x from "a" · import {x} from "a" · import "a" · export {x} from "a" · export * from "a"
const STATIC_IMPORT = /\b(import|export)(\s*(?:[\w$*{}\s,]*?\bfrom)?\s*)(["'])([^"'\n]+)\3/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(["'])([^"'\n]+)\1\s*\)/g;

/** Rewrites every relative specifier that points at a project file to the bare key `@nx/<path>`. */
function rewriteImports(code: string, from: string, byPath: Map<string, ProjectFile>): string {
  const swap = (spec: string) => {
    if (!isRelative(spec)) return null;
    const hit = resolveRel(from, spec, byPath);
    return hit ? `@nx/${hit}` : null;
  };
  let out = code.replace(STATIC_IMPORT, (all, kw: string, mid: string, q: string, spec: string) => {
    const to = swap(spec);
    return to ? `${kw}${mid}${q}${to}${q}` : all;
  });
  out = out.replace(DYNAMIC_IMPORT, (all, q: string, spec: string) => {
    const to = swap(spec);
    return to ? `import(${q}${to}${q})` : all;
  });
  return out;
}

function exportsOf(code: string): { names: Set<string>; star: boolean; hasDefault: boolean } {
  const names = new Set<string>();
  let hasDefault = false;
  for (const m of code.matchAll(/\bexport\s+(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of code.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/i).pop()?.trim();
      if (name) names.add(name);
    }
  }
  if (/\bexport\s+default\b/.test(code)) hasDefault = true;
  const star = /\bexport\s*\*\s*(?:as\s+\w+\s*)?from/.test(code);
  return { names, star, hasDefault };
}

function namedImports(code: string): { spec: string; names: string[]; wantsDefault: boolean }[] {
  const out: { spec: string; names: string[]; wantsDefault: boolean }[] = [];
  const re = /\bimport\s+([^"'`;]*?)\s+from\s*(["'])([^"'\n]+)\2/g;
  for (const m of code.matchAll(re)) {
    const clause = m[1].trim();
    const names: string[] = [];
    let wantsDefault = false;
    const brace = /\{([^}]*)\}/.exec(clause);
    if (brace) {
      for (const part of brace[1].split(",")) {
        const n = part.trim().split(/\s+as\s+/i)[0]?.trim();
        if (n === "default") wantsDefault = true;
        else if (n) names.push(n);
      }
    }
    const beforeBrace = clause.replace(/\{[^}]*\}/, "").replace(/\*\s*as\s+\w+/, "").replace(/,/g, " ").trim();
    if (beforeBrace && /^[A-Za-z_$][\w$]*$/.test(beforeBrace)) wantsDefault = true;
    out.push({ spec: m[3], names, wantsDefault });
  }
  return out;
}

const hasEsm = (code: string) => /^\s*(?:import\s|import\(|export\s)/m.test(code);

/* ------------------------------------------------------------------ verify */

const PLACEHOLDER = /(?:\/\/|\/\*)\s*(?:\.{3}|…)\s*(?:rest|existing|same|remaining|more)|\brest of (?:the )?(?:code|file)\b|\bTODO\b|implement (?:later|here)|same as above/i;

/** Structural check of a multi-file project. Errors mean "the game will not start". */
export function verifyProject(files: ProjectFile[]): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  const byPath = new Map(files.map((f) => [f.path, f]));
  const html = files.find((f) => /(^|\/)index\.html?$/i.test(f.path)) ?? files.find((f) => isHtml(f.path));
  const js = files.filter((f) => isJs(f.path));

  if (!html) issues.push({ level: "error", message: "index.html is missing — nothing can start the game." });
  for (const f of files) {
    if (f.open) issues.push({ level: "error", file: f.path, message: `${f.path} was cut off before its closing fence (truncated file).` });
    if (f.code.trim().length < 6) issues.push({ level: "error", file: f.path, message: `${f.path} is empty.` });
    else if (/\.(m?js|html?|css)$/i.test(f.path) && PLACEHOLDER.test(f.code)) {
      issues.push({ level: "warn", file: f.path, message: `${f.path} contains a placeholder (TODO / "rest of the code").` });
    }
  }

  const imported = new Set<string>();
  const exp = new Map(js.map((f) => [f.path, exportsOf(f.code)]));
  for (const f of js) {
    for (const ni of namedImports(f.code)) {
      if (!isRelative(ni.spec)) continue;
      const to = resolveRel(f.path, ni.spec, byPath);
      if (!to) continue; // reported below
      const e = exp.get(to);
      if (!e || e.star || !isJs(to)) continue;
      for (const n of ni.names) {
        if (!e.names.has(n)) issues.push({ level: "error", file: f.path, message: `${f.path} imports { ${n} } from "${ni.spec}" but ${to} does not export "${n}".` });
      }
      if (ni.wantsDefault && !e.hasDefault) issues.push({ level: "error", file: f.path, message: `${f.path} imports the default export of "${ni.spec}" but ${to} has no default export.` });
    }
    const specs = [...f.code.matchAll(STATIC_IMPORT)].map((m) => m[4]).concat([...f.code.matchAll(DYNAMIC_IMPORT)].map((m) => m[2]));
    for (const spec of specs) {
      if (!isRelative(spec)) continue;
      const to = resolveRel(f.path, spec, byPath);
      if (to) imported.add(to);
      else issues.push({ level: "error", file: f.path, message: `${f.path} imports "${spec}" but that file does not exist in the project.` });
    }
  }

  if (html) {
    const tags = [...html.code.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    let starts = false;
    for (const t of tags) {
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(t[1])?.[1];
      if (src && isRelative(src.startsWith("/") || src.startsWith(".") ? src : `./${src}`) && !/^https?:/i.test(src)) {
        const to = resolveRel(html.path, src.startsWith(".") || src.startsWith("/") ? src : `./${src}`, byPath);
        if (to) {
          imported.add(to);
          starts = true;
        } else issues.push({ level: "error", file: html.path, message: `index.html loads "${src}" but that file does not exist in the project.` });
      } else if (!src && /\S/.test(t[2]) && !/importmap|json/i.test(t[1])) {
        starts = true;
        for (const m of t[2].matchAll(STATIC_IMPORT)) {
          if (!isRelative(m[4])) continue;
          const to = resolveRel(html.path, m[4], byPath);
          if (to) imported.add(to);
          else issues.push({ level: "error", file: html.path, message: `index.html imports "${m[4]}" but that file does not exist in the project.` });
        }
      }
    }
    if (!starts && js.length) issues.push({ level: "error", file: html.path, message: "index.html has no <script> that loads the game code (add <script type=\"module\" src=\"src/main.js\">)." });
    for (const f of js) {
      if (!imported.has(f.path) && !/(^|\/)(main|index)\.m?js$/i.test(f.path) && hasEsm(f.code)) {
        issues.push({ level: "warn", file: f.path, message: `${f.path} is never imported by index.html or another module.` });
      }
    }
  }
  return issues;
}

export const hardIssues = (i: ProjectIssue[]): ProjectIssue[] => i.filter((x) => x.level === "error");

/** Every automatic repair request starts with this, so the client can tell it from a human message. */
export const REPAIR_PREFIX = "فحص تلقائي للمشروع";

/** Text for the automatic repair request sent back to the model. */
export function issuesToPrompt(issues: ProjectIssue[]): string {
  const files = [...new Set(hardIssues(issues).map((i) => i.file).filter(Boolean))] as string[];
  return (
    `${REPAIR_PREFIX} لقى مشاكل تمنع التشغيل:\n` +
    hardIssues(issues).slice(0, 12).map((i, n) => `${n + 1}. ${i.message}`).join("\n") +
    "\n\nأعد كتابة الملفات المتأثرة فقط" +
    (files.length ? ` (${files.join(", ")})` : "") +
    " كاملة، كل ملف في بلوك منفصل بهذا الشكل بالضبط: ```المسار/الملف.js ثم الكود ثم ```. لا تعد الملفات السليمة، ولا تكتب شرحاً."
  );
}

/* ------------------------------------------------------------------ bundle */

const LS = new RegExp(String.fromCharCode(0x2028), "g");
const PS = new RegExp(String.fromCharCode(0x2029), "g");
const safeJson = (v: unknown): string =>
  JSON.stringify(v).replace(/<\//g, "<\\/").replace(LS, "\\u2028").replace(PS, "\\u2029");
const safeInline = (code: string): string => code.replace(/<\/script/gi, "<\\/script");

/**
 * window.NexusDB — persistent saves for generated games.
 * Inside the preview the host answers over postMessage and stores in Postgres (/api/saves);
 * anywhere else (downloaded game, blocked bridge) it silently falls back to localStorage, then memory.
 * Injected into every previewed document, so games can rely on it being there.
 */
export const NEXUS_DB_SHIM = `<script data-nexus-db>(function(){
"use strict";
if(window.NexusDB)return;
var mem={},pend={},seq=0;
function game(){var t=(document.title||"game").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48);return t||"game";}
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return mem[k]||null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}mem[k]=v}
function ask(op,slot,data){return new Promise(function(res){
  var id=++seq,done=false;
  function fin(v){if(done)return;done=true;delete pend[id];res(v)}
  pend[id]=fin;
  setTimeout(function(){fin({ok:false,timeout:true})},2500);
  try{parent.postMessage({__nexus:1,type:"db",id:id,op:op,game:game(),slot:slot,data:data},"*")}catch(e){fin({ok:false})}
});}
window.addEventListener("message",function(e){var d=e.data;if(d&&d.__nexus===1&&d.type==="db-reply"&&pend[d.id])pend[d.id](d)});
window.NexusDB={
  game:game,
  save:function(slot,data){slot=String(slot||"auto");var key="nx:"+game()+":"+slot;lsSet(key,JSON.stringify(data));return ask("save",slot,data).then(function(r){return !!r.ok})},
  load:function(slot){slot=String(slot||"auto");var key="nx:"+game()+":"+slot;return ask("load",slot).then(function(r){if(r&&r.ok&&r.data!=null)return r.data;var raw=lsGet(key);if(raw){try{return JSON.parse(raw)}catch(e){}}return null})},
  list:function(){return ask("list").then(function(r){return (r&&r.ok&&r.data)||[]})}
};
})();</script>`;

function inlineLocalCss(doc: string, css: ProjectFile[]): string {
  let out = doc;
  for (const c of css) {
    const esc = c.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const base = esc.split("/").pop()!;
    out = out.replace(new RegExp(`<link[^>]+href=["'](?:\\.?\\/)?(?:[^"']*\\/)?${base}["'][^>]*>\\s*`, "gi"), "");
    void esc;
  }
  return out;
}

/**
 * Builds ONE self-contained HTML document from the project, or null when there is nothing playable.
 * ES-module projects keep real `import`/`export`; classic projects reuse assemblePlayableGame.
 */
export function bundleProject(files: ProjectFile[], title = "Nexus Game"): string | null {
  const html = files.find((f) => /(^|\/)index\.html?$/i.test(f.path)) ?? files.find((f) => isHtml(f.path));
  const js = files.filter((f) => isJs(f.path));
  const css = files.filter((f) => isCss(f.path));
  if (!html && js.length === 0) return null;

  const modular = js.some((f) => hasEsm(f.code)) || (!!html && /<script[^>]+type\s*=\s*["']module["']/i.test(html.code));
  if (!modular) {
    return assemblePlayableGame(files.filter((f) => !f.open).map((f) => ({ path: f.path, code: f.code })), title);
  }

  const byPath = new Map(files.map((f) => [f.path, f]));
  const mods: Record<string, string> = {};
  for (const f of js) mods[`@nx/${f.path}`] = rewriteImports(f.code, f.path, byPath);

  let doc = html?.code ?? "";
  const extra: Record<string, string> = {};

  if (!html) {
    const entry = js.find((f) => /(^|\/)main\.m?js$/i.test(f.path)) ?? js[js.length - 1];
    doc =
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>${title}</title></head>` +
      `<body><canvas id="game"></canvas><script type="module">import "@nx/${entry.path}";</script></body></html>`;
  } else {
    // 1. fold every import map of the page into ours
    doc = doc.replace(/<script\b[^>]*type\s*=\s*["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi, (_m, body: string) => {
      try {
        const j = JSON.parse(body) as { imports?: Record<string, string> };
        Object.assign(extra, j.imports ?? {});
      } catch {
        /* a broken import map is dropped; the error surfaces when the import fails */
      }
      return "";
    });
    // an import-map entry that points at a project file ("engine": "./src/engine.js") must follow the blob
    for (const k of Object.keys(extra)) {
      if (isRelative(extra[k])) {
        const to = resolveRel(html.path, extra[k], byPath);
        if (to) extra[k] = `@nx/${to}`;
      }
    }
    // 2. local <script src> → inline module import / inline classic code
    doc = doc.replace(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (all, a: string, src: string, b: string) => {
      if (/^(?:https?:)?\/\//i.test(src) || src.startsWith("data:") || src.startsWith("blob:")) return all;
      const to = resolveRel(html.path, src.startsWith(".") || src.startsWith("/") ? src : `./${src}`, byPath);
      if (!to) return all;
      return /type\s*=\s*["']module["']/i.test(a + b)
        ? `<script type="module">import "@nx/${to}";</script>`
        : `<script>${safeInline(byPath.get(to)!.code)}</script>`;
    });
    // 3. inline module scripts: rewrite their imports
    doc = doc.replace(/(<script\b[^>]*type\s*=\s*["']module["'][^>]*>)([\s\S]*?)(<\/script>)/gi, (_m, open: string, body: string, close: string) =>
      `${open}${rewriteImports(body, html.path, byPath)}${close}`
    );
    // 4. local stylesheets
    doc = inlineLocalCss(doc, css);
  }

  const styleBlock = css.map((c) => `<style data-src="${c.path}">\n${c.code}\n</style>`).join("\n");
  const loader =
    `<script data-nexus-loader>(function(){var M=${safeJson(mods)},X=${safeJson(extra)},map={imports:{}};` +
    `try{for(var k2 in M)map.imports[k2]=URL.createObjectURL(new Blob([M[k2]],{type:"text/javascript"}))}` +
    `catch(e){try{parent.postMessage({__nexus:1,type:"preview-error",kind:"error",message:"blob modules blocked: "+e,fatal:true},"*")}catch(_){}}` +
    `for(var k in X)map.imports[k]=(X[k].indexOf("@nx/")===0&&map.imports[X[k]])||X[k];` +
    `var s=document.createElement("script");s.type="importmap";s.textContent=JSON.stringify(map);(document.head||document.documentElement).appendChild(s);` +
    `window.addEventListener("unhandledrejection",function(e){try{parent.postMessage({__nexus:1,type:"preview-error",kind:"promise",message:String(e.reason&&e.reason.message||e.reason||"module error").slice(0,500),fatal:false},"*")}catch(_){}});` +
    `})();</script>`;
  const head = `<meta charset="utf-8">` + loader + styleBlock;
  if (/<head[^>]*>/i.test(doc)) doc = doc.replace(/<head([^>]*)>/i, `<head$1>${head}`);
  else if (/<html[^>]*>/i.test(doc)) doc = doc.replace(/<html([^>]*)>/i, `<html$1><head>${head}</head>`);
  else doc = `<!doctype html><html><head>${head}</head><body>${doc}</body></html>`;
  return doc;
}
