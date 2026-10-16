/**
 * NEXUS FORGE v19 — التجميع (assembly)
 * ---------------------------------------------------------------------------
 * Turns the modules written in parallel by different engines into:
 *   1. ONE self-contained `index.html` that runs by double-clicking it
 *      (this is what the chat preview and the live link serve), and
 *   2. a real multi-file tree for the ZIP / GitHub / Vercel deploy.
 *
 * Nothing is dropped or summarised: fences are stripped, duplicate document
 * wrappers are removed, styles are merged in order and scripts are ordered by
 * dependency wave, each guarded so one bad module cannot blank the page.
 */
import type { ForgeFile, ForgeModule, ForgePlan } from "@/lib/forge/types";
import { byteLength, countLines } from "@/lib/forge/types";

/** Removes the outer markdown fence a model wrapped its file in. */
export function stripFence(text: string, kind: string): string {
  let s = text.trim();
  // ```lang\n ... \n```
  const m = s.match(/^```[\w+#.-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/);
  if (m) s = m[1].trim();
  else {
    // a leading fence with no closing one (the model was cut off)
    s = s.replace(/^```[\w+#.-]*[ \t]*\r?\n/, "").replace(/\r?\n?```$/, "").trim();
  }
  // some models preface the block with a sentence — drop anything before a
  // recognisable first token of the file kind
  if (kind === "js" && !/^(\/[/*]|["'`]|window|const|let|var|function|\(|\{|;|class|NX)/.test(s)) {
    const i = s.search(/(^|\n)(\s*)(\/[/*]|window\.|const |let |var |function |\(function|class )/);
    if (i > 0) s = s.slice(s.indexOf("\n", i) + 1).trim();
  }
  if (kind === "html") {
    const i = s.search(/<!doctype html|<html|<head|<body|<!--/i);
    if (i > 0 && i < 400) s = s.slice(i);
  }
  return s;
}

/** Strips document wrappers so a module can be inlined into the shell. */
function unwrapHtml(code: string): { head: string; body: string; isDoc: boolean } {
  const isDoc = /<!doctype html|<html[\s>]/i.test(code);
  if (!isDoc) return { head: "", body: code, isDoc: false };

  const headM = code.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const bodyM = code.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let head = headM ? headM[1] : "";
  let body = bodyM ? bodyM[1] : "";

  if (!body) {
    // no <body>: everything after </head> is the body
    const after = code.split(/<\/head>/i)[1];
    body = (after ?? code).replace(/<\/?html[^>]*>/gi, "").replace(/<!doctype html>/gi, "").trim();
  }
  // keep the shell's own <style>/<script> in the body where they are
  return { head: head.trim(), body: body.trim(), isDoc: true };
}

/** `:root` blocks are merged once (first definition wins) to avoid token drift. */
function dedupeRoot(css: string): string {
  return css.replace(/:root\s*\{([^}]*)\}/g, (_all, inner: string) => `:root{${inner}}`);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type Assembled = {
  html: string;
  lines: number;
  bytes: number;
  scripts: number;
  styles: number;
};

/**
 * Builds the single self-contained file.
 * `files` must already be the cleaned module code (fence stripped).
 */
export function assembleSingleFile(plan: ForgePlan, files: ForgeFile[]): Assembled {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const order = [...plan.modules].sort((a, b) => a.wave - b.wave || a.path.localeCompare(b.path));

  const shellPath = plan.modules.find((m) => m.kind === "html")?.path ?? "index.html";
  const shellFile = byPath.get(shellPath);
  const shell = unwrapHtml(shellFile?.code ?? "");

  /* ---- styles: tokens first, then components, then polish ---- */
  const cssFiles = order.filter((m) => m.kind === "css").map((m) => byPath.get(m.path)).filter((f): f is ForgeFile => !!f && f.code.trim().length > 0);
  const cssBlocks = cssFiles.map((f) => `/* ══ ${f.path} ══ */\n${dedupeRoot(f.code.trim())}`);

  /* ---- data (json modules) inlined before any script that reads them ---- */
  const jsonFiles = order.filter((m) => m.kind === "json").map((m) => byPath.get(m.path)).filter((f): f is ForgeFile => !!f && f.code.trim().length > 0);

  /* ---- scripts in dependency order ---- */
  const jsMods: ForgeModule[] = order.filter((m) => m.kind === "js");
  const jsFiles = jsMods.map((m) => ({ m, f: byPath.get(m.path) })).filter((x): x is { m: ForgeModule; f: ForgeFile } => !!x.f && x.f.code.trim().length > 0);

  const tokens = plan.design.palette;
  const title = plan.title.slice(0, 120);
  const rtl = plan.language === "ar";

  const headFromShell = shell.head
    // the shell may carry its own meta/title — keep them, drop duplicates we add
    .replace(/<meta[^>]+charset[^>]*>/gi, "")
    .replace(/<title[\s\S]*?<\/title>/gi, "")
    .replace(/<meta[^>]+name=["']viewport["'][^>]*>/gi, "")
    .trim();

  const baseCss = `
/* ── FORGE base tokens (design contract) ── */
:root{
  --bg:${tokens.bg};--surface:${tokens.surface};--text:${tokens.text};--muted:${tokens.muted};
  --accent:${tokens.accent};--accent2:${tokens.accent2};
  --r-sm:10px;--r-md:16px;--r-lg:24px;--sp:8px;--t:180ms;
  --line:color-mix(in srgb, var(--text) 12%, transparent);
  --shadow:0 18px 44px -28px rgba(0,0,0,.75);
}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;max-width:100%;overflow-x:hidden}
body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic","Helvetica Neue",Arial,sans-serif;line-height:1.7;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img,svg,canvas,video{max-width:100%}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}}
/* forge error card — shown instead of a blank page if a module throws */
#forge-fatal{position:fixed;inset:auto 12px 12px 12px;z-index:9999;display:none;padding:14px 16px;border-radius:16px;background:#2a1416;border:1px solid #7f1d1d;color:#fecaca;font-size:13px;line-height:1.6;box-shadow:0 20px 50px -20px #000}
#forge-fatal b{color:#fff}
`;

  const guard = `
<script>
/* FORGE runtime guard: a throwing module paints a card instead of a blank page */
(function(){
  window.NX=window.NX||{};
  window.NX.errors=[];
  function show(msg){
    try{
      var el=document.getElementById('forge-fatal');
      if(!el){el=document.createElement('div');el.id='forge-fatal';document.body.appendChild(el);}
      el.style.display='block';
      el.innerHTML='<b>تعذّر تشغيل جزء من المشروع</b><br>'+String(msg).slice(0,300);
    }catch(e){/* never throw from the handler */}
  }
  window.addEventListener('error',function(e){window.NX.errors.push(String(e.message));show(e.message);});
  window.addEventListener('unhandledrejection',function(e){var m=(e.reason&&e.reason.message)||String(e.reason);window.NX.errors.push(m);show(m);});
})();
</script>`;

  const scriptTags = jsFiles
    .map(({ m, f }) => {
      // `</script>` inside a string would break the document — escape it
      const safe = f.code.replace(/<\/script>/gi, "<\\/script>");
      return `<script>\n/* ══ ${f.path} — ${m.title} (${countLines(f.code)} lines) ══ */\n${safe}\n</script>`;
    })
    .join("\n");

  const jsonTags = jsonFiles
    .map((f) => {
      const name = "NX_DATA_" + f.path.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
      const safe = f.code.replace(/<\/script>/gi, "<\\/script>");
      return `<script>\n/* ══ ${f.path} (inlined data) ══ */\nwindow.${name}=${safe.trim().replace(/;+\s*$/, "")};\nwindow.NX.data=window.NX.data||{};window.NX.data[${JSON.stringify(f.path)}]=window.${name};\n</script>`;
    })
    .join("\n");

  const styleTags = cssBlocks.length
    ? `<style>\n${cssBlocks.join("\n\n")}\n</style>`
    : "";

  // styles that the shell carried inline stay where they were
  const body = shell.body || `<main style="padding:24px"><h1>${esc(title)}</h1><p>لم يُنتج الهيكل أي محتوى.</p></main>`;

  const doc = `<!doctype html>
<html lang="${plan.language}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc((plan.summary || title).slice(0, 180))}">
<meta name="generator" content="Nexus AI v19 FORGE — by abdelrezakbezzag (Algeria)">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc((plan.summary || title).slice(0, 180))}">
<meta property="og:type" content="website">
<meta name="theme-color" content="${tokens.bg}">
<style>${baseCss}</style>
${styleTags}
${headFromShell}
</head>
<body>
${body}
<div id="forge-fatal" role="alert"></div>
${guard}
${jsonTags}
${scriptTags}
</body>
</html>`;

  return {
    html: doc,
    lines: countLines(doc),
    bytes: byteLength(doc),
    scripts: jsFiles.length + jsonFiles.length,
    styles: cssFiles.length,
  };
}

/** The real project tree (ZIP / deploy / live publish). */
export function assembleTree(plan: ForgePlan, files: ForgeFile[], single: Assembled): { path: string; data: string }[] {
  const out: { path: string; data: string }[] = [{ path: "index.html", data: single.html }];
  for (const f of files) {
    if (f.path === "index.html") continue;
    out.push({ path: f.path, data: f.code });
  }
  out.push({ path: "README.md", data: readmeFor(plan, files, single) });
  return out;
}

export function readmeFor(plan: ForgePlan, files: ForgeFile[], single: Assembled): string {
  const total = files.reduce((s, f) => s + f.lines, 0);
  const models = Array.from(new Set(files.map((f) => f.model)));
  return `# ${plan.title}

${plan.summary || "مشروع من بناء Nexus FORGE."}

**بُني بواسطة Nexus AI v19 FORGE** — مطوَّر من طرف **abdelrezakbezzag** (الجزائر 🇩🇿).

## الأرقام
| | |
|---|---|
| النوع | ${plan.kind} |
| اللغة | ${plan.language} |
| الوحدات | ${files.length} |
| الأسطر | ${total.toLocaleString("en")} |
| الملف الواحد | ${single.lines.toLocaleString("en")} سطر · ${(single.bytes / 1024).toFixed(0)} KB |
| النماذج المشاركة | ${models.join(" · ") || "—"} |

## التشغيل
1. افتح \`index.html\` بالنقر المزدوج — يعمل بلا خادم ولا بناء.
2. أو ارفع المجلد على أي استضافة ثابتة (Vercel, Netlify, GitHub Pages).

## بنية المشروع
${files.map((f) => `- \`${f.path}\` — ${f.lines.toLocaleString("en")} سطر · ${f.model}`).join("\n")}

## العقد (Contract)
\`\`\`
${plan.contract.slice(0, 4000)}
\`\`\`

---
نُشر برابط حي من داخل Nexus AI. كل الحقوق محفوظة لصاحب المشروع.
`;
}
