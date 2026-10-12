/**
 * ═══════════════════════════════════════════════════════════════════════
 *  LIVE CODE EXECUTION SANDBOX  ·  In-Browser Execution Engine
 * ═══════════════════════════════════════════════════════════════════════
 *  Runs generated code 100% inside a sandboxed <iframe> — zero external
 *  servers, zero API keys:
 *
 *    1. REAL BUNDLER (preferred): esbuild-wasm is hot-loaded from CDN on
 *       first use, then multi-file TS / TSX / JSX / JS projects are bundled
 *       in the page (with an in-memory virtual FS plugin) into one IIFE.
 *
 *    2. SHIM FALLBACK (always available): a tiny CommonJS-style module
 *       registry + an import/export rewriter executes files in dependency
 *       order — generated multi-file vanilla JS projects run even offline.
 *
 *    3. Instrumentation: console.* capture, window.onerror + unhandled
 *       rejection capture, inline error overlay, ready signal, and a
 *       postMessage protocol (__nexus_sandbox) the host UI listens to.
 *
 *  Everything here is browser-only code guarded for SSR: importing this
 *  file from any client component never touches the window at module time.
 */

export interface SandboxProjectFile {
  path: string;
  code: string;
}

export interface SandboxConsoleEntry {
  kind: "console" | "error" | "ready" | "reload";
  level?: "log" | "info" | "warn" | "error" | "debug";
  text: string;
  source?: string;
  line?: number;
  at: number;
}

export interface BuildSandboxOptions {
  /** allow CDN imports (react, three…) from esm.sh — off = fully offline */
  allowCdn?: boolean;
  /** extra CSS appended last */
  extraCss?: string;
  /** base document title */
  title?: string;
}

export interface BuiltSandbox {
  /** final srcdoc for the iframe */
  doc: string;
  /** how the JS was prepared */
  engine: "esbuild" | "shim" | "static";
  /** per-file notes (skipped TS without bundle, etc.) */
  notes: string[];
}

/* ─────────────────────── project analysis ─────────────────────── */

const EXT_RE = /\.(html?|css|tsx?|jsx?|mjs)$/i;

export function kindOfPath(p: string): "html" | "css" | "ts" | "tsx" | "js" | "other" {
  const f = p.toLowerCase();
  if (/\.html?$/.test(f)) return "html";
  if (/\.css$/.test(f)) return "css";
  if (/\.tsx$/.test(f)) return "tsx";
  if (/\.ts$/.test(f) || /\.mts$/.test(f)) return "ts";
  if (/\.jsx$/.test(f)) return "tsx"; // jsx handled by the tsx loader transform
  if (/\.m?js$/.test(f)) return "js";
  return "other";
}

export interface ProjectAnalysis {
  html?: SandboxProjectFile;
  css: SandboxProjectFile[];
  scripts: SandboxProjectFile[];
  needsTranspile: boolean;
  usesReact: boolean;
}

export function analyzeProject(files: SandboxProjectFile[]): ProjectAnalysis {
  const html = files.find((f) => kindOfPath(f.path) === "html");
  const css = files.filter((f) => kindOfPath(f.path) === "css");
  const scripts = files
    .filter((f) => ["ts", "tsx", "js"].includes(kindOfPath(f.path)))
    .filter((f) => EXT_RE.test(f.path))
    .sort(scriptOrder);
  const needsTranspile = scripts.some((f) => ["ts", "tsx"].includes(kindOfPath(f.path)));
  const usesReact = scripts.some((f) => /from\s+["']react|require\(["']react|<[A-Z][\w]*[\s>/]/.test(f.code));
  return { html, css, scripts, needsTranspile, usesReact };
}

/** dependency-friendly order: utils → stores → components → main/app last */
function scriptOrder(a: SandboxProjectFile, b: SandboxProjectFile): number {
  const rank = (p: string) =>
    /(^|\/)(main|app|index|entry|game)\.[jt]sx?$/i.test(p) ? 10 : /(^|\/)(utils?|lib|core|config|store|state)\//i.test(p) ? 0 : 5;
  return rank(a.path) - rank(b.path) || a.path.localeCompare(b.path);
}

/* ─────────────────────── esbuild-wasm runtime ─────────────────────── */

type EsbuildBrowser = {
  initialize(o: { wasmURL: string; worker?: boolean }): Promise<void>;
  build(o: Record<string, unknown>): Promise<{ outputFiles?: { path: string; text: string }[]; errors: unknown[] }>;
  transform(code: string, o: Record<string, unknown>): Promise<{ code: string }>;
};

const ESBUILD_VERSION = "0.25.12";
let esbuildReady: Promise<EsbuildBrowser | null> | null = null;

/**
 * Hot-loads esbuild-wasm from a pinned CDN exactly once per page.
 * Resolves null (never throws) when offline / CSP-blocked — the shim
 * fallback then takes over.
 */
export function ensureEsbuild(): Promise<EsbuildBrowser | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!esbuildReady) {
    esbuildReady = new Promise<EsbuildBrowser | null>((resolve) => {
      const w = window as unknown as { esbuild?: EsbuildBrowser };
      const boot = () => {
        const api = w.esbuild;
        if (!api) {
          resolve(null);
          return;
        }
        api
          .initialize({
            wasmURL: `https://cdn.jsdelivr.net/npm/esbuild-wasm@${ESBUILD_VERSION}/esbuild.wasm`,
          })
          .then(() => resolve(api))
          .catch(() => resolve(null));
      };
      if (w.esbuild) {
        boot();
        return;
      }
      const s = document.createElement("script");
      s.src = `https://cdn.jsdelivr.net/npm/esbuild-wasm@${ESBUILD_VERSION}/lib/browser.min.js`;
      s.async = true;
      s.onload = boot;
      s.onerror = () => resolve(null);
      const killer = setTimeout(() => resolve(null), 20_000);
      s.onload = () => {
        clearTimeout(killer);
        boot();
      };
      document.head.appendChild(s);
    });
  }
  return esbuildReady;
}

/* ─────────────────────── in-page instrumentation ─────────────────────── */

/** Bridge + error overlay injected as the very first script of the sandbox page. */
export const SANDBOX_BRIDGE = `<script data-nexus-sandbox>(function(){
"use strict";
function post(m){try{parent.postMessage(Object.assign({__nexus_sandbox:1,at:Date.now()},m),"*")}catch(e){}}
function stringify(a){if(typeof a==="string")return a;if(a instanceof Error)return a.name+": "+a.message;try{return JSON.stringify(a,function(k,v){return typeof v==="function"?"[Function]":v&&v instanceof Error?v.message:v;}).slice(0,600)}catch(e){return String(a)}}
["log","info","warn","error","debug"].forEach(function(lv){
  var orig=console[lv]?console[lv].bind(console):function(){};
  console[lv]=function(){try{post({kind:"console",level:lv,text:Array.prototype.map.call(arguments,stringify).join(" ")})}catch(e){}orig.apply(null,arguments)};
});
window.addEventListener("error",function(e){post({kind:"error",text:String(e.message||"script error"),source:String(e.filename||""),line:e.lineno||0})});
window.addEventListener("unhandledrejection",function(e){post({kind:"error",text:"Unhandled promise rejection: "+stringify(e.reason)})});
window.addEventListener("DOMContentLoaded",function(){post({kind:"ready",text:"sandbox ready"})});
window.__nexusOverlay=function(msg){
  var el=document.getElementById("__nexus_err");
  if(!el){el=document.createElement("div");el.id="__nexus_err";
    el.style.cssText="position:fixed;inset:auto 8px 8px 8px;max-height:42%;overflow:auto;background:#2a0e12;color:#ffb4be;border:1px solid #8f2b3c;border-radius:10px;padding:10px 12px;font:12px/1.5 ui-monospace,monospace;z-index:2147483647;white-space:pre-wrap;box-shadow:0 8px 30px rgba(0,0,0,.45)";
    (document.body||document.documentElement).appendChild(el)}
  el.textContent=msg;el.style.display="block";
};
window.addEventListener("error",function(e){window.__nexusOverlay("⚠ "+String(e.message||"error")+(e.lineno?" — line "+e.lineno:""))});
})();</script>`;

/* ─────────────────────── shim module system (fallback) ─────────────────────── */

const SHIM_RUNTIME = `<script data-nexus-sandbox>(function(){
"use strict";
var REG={},CACHE={};
function norm(base,rel){
  if(rel.charAt(0)!==".")return rel;
  var parts=(base.split("/").slice(0,-1)).concat(rel.split("/")),out=[];
  for(var i=0;i<parts.length;i++){var p=parts[i];if(!p||p===".")continue;if(p==="..")out.pop();else out.push(p);}
  return out.join("/");
}
function define(path,fn){REG[path]={fn:fn,exports:{}}}
function req(base,rel){
  var p=norm(base,rel);
  if(!/\\.[jt]sx?$/i.test(p)){
    if(REG[p+".js"])p+=".js";else if(REG[p+".ts"])p+=".ts";else if(REG[p+".jsx"])p+=".jsx";else if(REG[p+".tsx"])p+=".tsx";else if(REG[p+"/index.js"])p+="/index.js";
  }
  if(CACHE[p])return CACHE[p].exports;
  var m=REG[p];
  if(!m){console.warn("[sandbox] module not found:",rel,"(from",base+")");return{}}
  CACHE[p]=m;
  m.fn(function(r){return req(p,r)},m,m.exports);
  return m.exports;
}
window.__nexusDefine=define;window.__nexusRequire=req;window.__nexusRun=function(entry){try{req(entry,entry)}catch(e){(window.__nexusOverlay||console.error)("⚠ "+(e&&e.message||e))}};
})();</script>`;

/**
 * Rewrites the import/export surface of a module for the shim runtime.
 * Covers the shapes AI codegen actually emits; anything exotic is left
 * untouched (the in-page overlay will show a precise error instead of a
 * silent failure).
 */
export function rewriteModule(code: string, path: string): string {
  let body = code
    // `import "./polyfill.js"` (side-effect only)
    .replace(/^\s*import\s+["']([^"']+)["']\s*;?\s*$/gm, 'require("$1");')
    // `import def, { a, b as c } from "src"`
    .replace(
      /^\s*import\s+([\w$]+)\s*,\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']\s*;?\s*$/gm,
      (_m, d: string, named: string, src: string) =>
        `const ${d} = (()=>{const m=require("${src}");return m.default??m})();const {${named}} = require("${src}");`
    )
    // `import def from "src"`
    .replace(
      /^\s*import\s+([\w$]+)\s*from\s*["']([^"']+)["']\s*;?\s*$/gm,
      (_m, d: string, src: string) => `const ${d} = (()=>{const m=require("${src}");return m.default??m})();`
    )
    // `import * as ns from "src"`
    .replace(/^\s*import\s+\*\s*as\s+([\w$]+)\s*from\s*["']([^"']+)["']\s*;?\s*$/gm, 'const $1 = require("$2");')
    // `import { a, b as c } from "src"`
    .replace(/^\s*import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']\s*;?\s*$/gm, 'const {$1} = require("$2");')
    // `export { a, b as c }`
    .replace(
      /^\s*export\s*\{([^}]*)\}\s*;?\s*$/gm,
      (_m, list: string) =>
        list
          .split(",")
          .map((p) => {
            const [from, to] = p.split(/\s+as\s+/).map((s) => s.trim());
            return from ? `module.exports[${JSON.stringify(to || from)}] = ${from};` : "";
          })
          .join("\n")
    )
    // `export default <expr>`
    .replace(/^\s*export\s+default\s+/gm, "module.exports.default = ")
    // `export const/let/var x =`
    .replace(/^\s*export\s+(const|let|var)\s+/gm, "$1 ")
    // `export function/class/async function`
    .replace(/^\s*export\s+(async\s+function\s*[\w$]*|function\s*[\w$]*|class\s*[\w$]*)/gm, "$1");

  // hoist `export const x` declarations into module.exports after declarations
  const namedExports: string[] = [];
  body = body.replace(/^\s*(?:const|let|var)\s+([\w$]+)\s*=/gm, (m, id: string) => {
    if (new RegExp(`^\\s*export\\s+(?:const|let|var)\\s+${id}\\s*=`, "m").test(code)) namedExports.push(id);
    return m;
  });
  const fnExports = [...code.matchAll(/^\s*export\s+(?:async\s+)?function\s+([\w$]+)/gm)].map((m) => m[1]);
  const classExports = [...code.matchAll(/^\s*export\s+class\s+([\w$]+)/gm)].map((m) => m[1]);
  const epilogue = [...new Set([...namedExports, ...fnExports, ...classExports])]
    .map((id) => `try{module.exports[${JSON.stringify(id)}]=${id}}catch(e){}`)
    .join("\n");

  return `__nexusDefine(${JSON.stringify(path)}, function(require, module, exports){\n"use strict";\n${body}\n${epilogue}\n});`;
}

/* ─────────────────────── esbuild bundling (preferred) ─────────────────────── */

async function bundleWithEsbuild(
  api: EsbuildBrowser,
  files: SandboxProjectFile[],
  entry: string,
  notes: string[]
): Promise<string | null> {
  const fileMap = new Map(files.map((f) => ["/" + f.path.replace(/^\/+/, ""), f.code]));
  const virtualFs = {
    name: "nexus-virtual-fs",
    setup(b: {
      onResolve(o: { filter: RegExp }, cb: (a: { path: string; importer: string }) => { path: string; namespace: string } | undefined): void;
      onLoad(o: { filter: RegExp }, cb: (a: { path: string }) => { contents: string; loader: string } | undefined): void;
    }) {
      b.onResolve({ filter: /.*/ }, (args) => {
        const p = args.path;
        if (/^https?:\/\//.test(p)) return { path: p, namespace: "external-skip" };
        if (/^[\w@][\w@./-]*$/.test(p) && !p.startsWith(".") && !p.startsWith("/")) {
          // bare specifier (react etc.) — resolved by the import map in the document
          return { path: p, namespace: "external-skip" };
        }
        const base = args.importer ? args.importer.split("/").slice(0, -1).join("/") : "";
        const joined = (base + "/" + p).split("/").reduce<string[]>((acc, seg) => {
          if (seg === "..") acc.pop();
          else if (seg && seg !== ".") acc.push(seg);
          return acc;
        }, []);
        const candidates = ["/" + joined.join("/")];
        const exts = ["", ".js", ".ts", ".jsx", ".tsx", ".mjs"];
        for (const c of candidates) {
          for (const e of exts) {
            if (fileMap.has(c + e)) return { path: c + e, namespace: "vfs" };
          }
          for (const e of exts) {
            if (fileMap.has(c + "/index" + e)) return { path: c + "/index" + e, namespace: "vfs" };
          }
        }
        notes.push(`unresolved import: ${p}`);
        return { path: p, namespace: "external-skip" };
      });
      b.onLoad({ filter: /.*/, }, (args) => {
        if (args.path.startsWith("http") || !fileMap.has(args.path)) {
          return { contents: `export default ${JSON.stringify(args.path)};`, loader: "js" };
        }
        const k = kindOfPath(args.path);
        return { contents: fileMap.get(args.path) ?? "", loader: k === "tsx" ? "tsx" : k === "ts" ? "ts" : k === "css" ? "css" : "js" };
      });
    },
  };
  try {
    const out = await api.build({
      entryPoints: ["/" + entry.replace(/^\/+/, "")],
      bundle: true,
      write: false,
      format: "iife",
      target: "es2020",
      jsx: "automatic",
      plugins: [virtualFs],
      logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"' },
    });
    const text = out.outputFiles?.find((f) => f.path.endsWith(".js"))?.text;
    return text ?? null;
  } catch (e) {
    notes.push(`esbuild: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
    return null;
  }
}

/* ─────────────────────── document assembly ─────────────────────── */

function inlineCssLinks(html: string, css: SandboxProjectFile[]): string {
  let out = html;
  for (const c of css) {
    const linkRe = new RegExp(`<link[^>]+href=["'](?:\\.?\\/)?${c.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>\\s*`, "gi");
    out = out.replace(linkRe, "");
  }
  const styleBlock = css.map((c) => `<style data-src="${c.path}">\n${c.code}\n</style>`).join("\n");
  if (!styleBlock) return out;
  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, `${styleBlock}\n</head>`);
  return styleBlock + out;
}

function stripRemoteScripts(html: string): string {
  return html.replace(/<script[^>]+src=["'][^"']+["'][^>]*>\s*<\/script>/gi, (m) =>
    /three|cdn\.jsdelivr|unpkg|esm\.sh|cdnjs/i.test(m) ? m : ""
  );
}

/**
 * Builds the fully-instrumented runnable document for generated code.
 * Call `ensureEsbuild()` first (non-blocking ok) for TS/JSX projects.
 */
export async function buildSandboxDocument(
  files: SandboxProjectFile[],
  opts: BuildSandboxOptions = {}
): Promise<BuiltSandbox> {
  const notes: string[] = [];
  const a = analyzeProject(files);

  /* static site / single-page HTML — no bundling needed */
  if (!a.scripts.length) {
    const body = a.html ? inlineCssLinks(a.html.code, a.css) : "";
    return {
      doc:
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>${opts.title ?? "Nexus Sandbox"}</title>${SANDBOX_BRIDGE}</head><body>${body || cssOnlyFallback(a, opts)}${opts.extraCss ? `<style>${opts.extraCss}</style>` : ""}</body></html>`,
      engine: "static",
      notes,
    };
  }

  const entry = a.scripts[a.scripts.length - 1].path;
  let bundle: string | null = null;
  let engine: BuiltSandbox["engine"] = "shim";

  /* 1 · real bundling with esbuild-wasm (handles TS/TSX/JSX + imports) */
  if (typeof window !== "undefined") {
    const api = await ensureEsbuild();
    if (api) {
      bundle = await bundleWithEsbuild(api, a.scripts, entry, notes);
      if (bundle) {
        engine = "esbuild";
      } else if (a.needsTranspile) {
        // last-chance per-file transform so TS/TSX still runs through the shim
        for (const f of a.scripts) {
          const k = kindOfPath(f.path);
          if (k === "ts" || k === "tsx") {
            try {
              const t = await api.transform(f.code, { loader: k, format: "esm", target: "es2020" });
              f.code = t.code;
            } catch {
              notes.push(`skip transpile ${f.path}`);
            }
          }
        }
      }
    } else if (a.needsTranspile) {
      notes.push("TS/JSX needs the bundler (offline now) — only plain JS runs");
    }
  }

  /* 2 · shim fallback: tiny module registry + rewritten imports */
  let scriptsSection: string;
  if (bundle) {
    scriptsSection = `<script data-nexus-exec>\ntry{${bundle}\n}catch(e){(window.__nexusOverlay||console.error)("⚠ "+(e&&e.message||e))}\n</script>`;
  } else {
    const modules = a.scripts
      .filter((f) => kindOfPath(f.path) === "js" || kindOfPath(f.path) === "ts" || kindOfPath(f.path) === "tsx")
      .map((f) => rewriteModule(f.code, f.path))
      .join("\n");
    scriptsSection =
      SHIM_RUNTIME +
      `<script data-nexus-modules>\n${modules}\n</script>` +
      `<script data-nexus-exec>__nexusRun(${JSON.stringify(entry)});</script>`;
  }

  const importMap =
    opts.allowCdn && a.usesReact
      ? `<script type="importmap">{"imports":{"react":"https://esm.sh/react@19","react-dom":"https://esm.sh/react-dom@19","react-dom/client":"https://esm.sh/react-dom@19/client"}}</script>`
      : "";

  const baseBody = a.html ? stripRemoteScripts(inlineCssLinks(a.html.code, a.css)) : `<div id="root"></div>`;

  return {
    doc:
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${opts.title ?? "Nexus Sandbox"}</title>${SANDBOX_BRIDGE}${importMap}</head>` +
      `<body>${baseBody}${scriptsSection}${opts.extraCss ? `<style>${opts.extraCss}</style>` : ""}</body></html>`,
    engine,
    notes,
  };
}

function cssOnlyFallback(a: ProjectAnalysis, opts: BuildSandboxOptions): string {
  return `<style>${a.css.map((c) => c.code).join("\n")}</style><div style="font:14px system-ui;padding:2rem;color:#888">${
    a.css.length ? "CSS-only project — styles applied." : "Empty project."
  }${opts.title ? "" : ""}</div>`;
}

/* ─────────────────────── live-run controller ─────────────────────── */

/**
 * Drives an <iframe> as a live execution target: feed it files, it debounce-
 * rebuilds and hot-swaps the document inside the SAME frame (smooth HMR feel
 * for the preview) while console entries stream to your callback.
 */
export class LiveRunController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listener: ((e: MessageEvent) => void) | null = null;
  lastBuild: BuiltSandbox | null = null;

  constructor(
    private readonly iframe: HTMLIFrameElement,
    private readonly onConsole?: (entry: SandboxConsoleEntry) => void,
    private readonly debounceMs = 900
  ) {
    if (typeof window !== "undefined") {
      this.listener = (e: MessageEvent) => {
        if (e.source !== this.iframe.contentWindow) return;
        const entry = parseSandboxMessage(e.data);
        if (entry) this.onConsole?.(entry);
      };
      window.addEventListener("message", this.listener);
    }
  }

  /** Queue a rebuild+run of the project (debounced). */
  run(files: SandboxProjectFile[], opts: BuildSandboxOptions = {}): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void buildSandboxDocument(files, opts).then((built) => {
        this.lastBuild = built;
        this.iframe.srcdoc = built.doc;
      });
    }, this.debounceMs);
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.listener && typeof window !== "undefined") window.removeEventListener("message", this.listener);
  }
}

/** Parses one postMessage payload into a console entry (null when not ours). */
export function parseSandboxMessage(data: unknown): SandboxConsoleEntry | null {
  const d = data as { __nexus_sandbox?: number; kind?: string; level?: SandboxConsoleEntry["level"]; text?: string; source?: string; line?: number; at?: number } | null;
  if (!d || d.__nexus_sandbox !== 1 || !d.kind) return null;
  return {
    kind: (d.kind as SandboxConsoleEntry["kind"]) ?? "console",
    level: d.level,
    text: String(d.text ?? ""),
    source: d.source,
    line: d.line,
    at: typeof d.at === "number" ? d.at : Date.now(),
  };
}
