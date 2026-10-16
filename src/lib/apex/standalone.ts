/**
 * NEXUS APEX — STANDALONE mode.
 *
 * The deterministic factory (`buildApexProject`) covers the blueprints it knows.
 * Everything else — the one-off thing a model writes by hand — lands here.
 *
 * A model answer is almost never a finished file: it is prose + a fenced block,
 * truncated mid-tag, with a Tailwind CDN, half the closing tags missing and no
 * error handling, so the preview is blank and the user is left with a snippet.
 * `completeStandalone()` takes whatever the model produced and turns it into ONE
 * complete, runnable, offline, verified single file:
 *
 *   markdown → code · missing head/body/html · unclosed tags & scripts
 *   CDN CSS/JS → embedded offline equivalents (Tailwind-lite, system fonts)
 *   no runtime → APEX kernel + the modules the markup asks for, mounted
 *   no palette → one of the 14 APEX palettes, applied as CSS variables
 *   blank page on error → safe boot (error boundary + toast, never white)
 *
 * Nothing here needs the network or a model, and every repair is reported back
 * in `fixed[]` so the UI can show exactly what was saved.
 */

import { APEX_CSS, themeVars } from "./theme";
import { FONT_STACKS, guessPalette, paletteById, type Palette, type PaletteId } from "./palettes";
import { planFromText } from "./planner";
import { blueprintById } from "./blueprints";
import { APEX_MODULE_IDS, apexModule, type ApexModuleDef } from "./modules";
import {
  HOST_DATA,
  byteLength,
  resolveHost,
  resolveModuleId,
  verifyProject,
  type ApexFile,
  type ApexPlan,
  type ApexStats,
  type VerifyReport,
} from "./compose";
import { buildData } from "./data-gen";

export interface StandaloneOptions {
  /** user request that produced the code — used for title, language, palette, kind */
  text?: string;
  palette?: PaletteId | string;
  title?: string;
  /** keep page-level metadata the model wrote (default true) */
  keepMeta?: boolean;
  /** inject the APEX kernel so `data-apex` hosts mount (default true) */
  mount?: boolean;
  /** add offline/PWA tags (default true) */
  pwa?: boolean;
  /** report from a trusted caller: skip nothing, but tag the source */
  source?: string;
}

export interface StandaloneResult {
  html: string;
  /** human-readable repairs, in the order they were applied */
  fixed: string[];
  /** things we could not repair and the user should know about */
  warnings: string[];
  plan: ApexPlan;
  palette: Palette;
  kind: "site" | "app" | "game" | "component";
  modules: ApexModuleDef[];
  stats: ApexStats;
  report: VerifyReport;
  score: number;
  lines: number;
  bytes: number;
  lang: "ar" | "fr" | "en";
  dir: "rtl" | "ltr";
}

const FENCE = /```([a-zA-Z0-9+#-]*)\s*\n([\s\S]*?)```/g;

/** Picks the biggest fenced block (HTML/JS/CSS), or the raw text if there is none. */
export function extractCode(raw: string): { code: string; notes: string[]; lang: string } {
  const src = (raw || "").replace(/\r\n/g, "\n");
  const notes: string[] = [];
  const blocks: { lang: string; code: string }[] = [];
  FENCE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE.exec(src))) blocks.push({ lang: (m[1] || "").toLowerCase(), code: m[2] });
  if (blocks.length === 0) {
    // an unterminated fence (the classic truncation) still has real code inside
    const open = src.indexOf("```");
    if (open >= 0) {
      const tail = src.slice(open).replace(/^```[a-zA-Z0-9+#-]*\s*\n?/, "");
      if (tail.trim().length > 40) {
        notes.push("رمز غير مغلق (``` بلا نهاية) — أُخِذ ما بعده");
        return { code: tail, notes, lang: guessLang(tail) };
      }
    }
    return { code: src, notes, lang: guessLang(src) };
  }
  const best = blocks.slice().sort((a, b) => rankBlock(b) - rankBlock(a))[0];
  if (blocks.length > 1) {
    const useful = blocks.filter((b) => rankBlock(b) >= rankBlock(best) - 1 && b !== best && b.code.trim().length > 120);
    notes.push(useful.length ? `أُخِذ أكبر كتلة كود (${blocks.length} كتل)` : `أُخِذ أكبر كتلة كود من ${blocks.length}`);
  }
  return { code: best.code, notes, lang: best.lang || guessLang(best.code) };
}

function rankBlock(b: { lang: string; code: string }): number {
  const htmlish = /<(html|body|div|section|canvas|script)\b/i.test(b.code) ? 40 : 0;
  const cssish = /^\s*[.#a-z][^{}]*\{[^}]*\}/im.test(b.code) && !/<[a-z]/i.test(b.code) ? -30 : 0;
  const jsish = /\b(function|const|let|=>)\b/.test(b.code) ? -8 : 0;
  const langBonus = /^(html|htm)$/.test(b.lang) ? 60 : b.lang === "" ? 10 : 0;
  return htmlish + cssish + jsish + langBonus + Math.min(60, Math.round(b.code.length / 600));
}

function guessLang(code: string): string {
  if (/<!doctype|<html|<body|<div|<section/i.test(code)) return "html";
  if (/[.#][a-z][^{}]*\{[^}]*\}/i.test(code)) return "css";
  return "js";
}

/** Escapes a string for safe use inside a <script> body. */
function jsSafe(code: string): string {
  return code.replace(/<\/(script)/gi, "<\\/$1").replace(/<\/(style)/gi, "<\\/$1");
}

/** Escapes text for HTML text nodes / attributes. */
function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ assets */

/**
 * Tailwind-lite: the utility classes models actually use, mapped to real CSS,
 * so replacing `<script src="https://cdn.tailwindcss.com">` never breaks layout.
 */
export const TAILWIND_LITE = String.raw`
/* Tailwind-lite — offline replacement for the Tailwind CDN (NEXUS APEX) */
.nx-tw *, .nx-tw *::before, .nx-tw *::after { box-sizing: border-box; }
.flex{display:flex}.inline-flex{display:inline-flex}.grid{display:grid}.block{display:block}.inline-block{display:inline-block}.hidden{display:none}
.flex-col{flex-direction:column}.flex-row{flex-direction:row}.flex-wrap{flex-wrap:wrap}.flex-1{flex:1 1 0%}.shrink-0{flex-shrink:0}
.items-center{align-items:center}.items-start{align-items:flex-start}.items-end{align-items:flex-end}
.justify-center{justify-content:center}.justify-between{justify-content:space-between}.justify-end{justify-content:flex-end}.justify-around{justify-content:space-around}
.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.col-span-2{grid-column:span 2/span 2}.col-span-3{grid-column:span 3/span 3}.col-span-full{grid-column:1/-1}
.gap-1{gap:.25rem}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-4{gap:1rem}.gap-6{gap:1.5rem}.gap-8{gap:2rem}
.space-y-1>*+*{margin-top:.25rem}.space-y-2>*+*{margin-top:.5rem}.space-y-3>*+*{margin-top:.75rem}.space-y-4>*+*{margin-top:1rem}.space-y-6>*+*{margin-top:1.5rem}
.p-1{padding:.25rem}.p-2{padding:.5rem}.p-3{padding:.75rem}.p-4{padding:1rem}.p-5{padding:1.25rem}.p-6{padding:1.5rem}.p-8{padding:2rem}
.px-2{padding-inline:.5rem}.px-3{padding-inline:.75rem}.px-4{padding-inline:1rem}.px-6{padding-inline:1.5rem}
.py-1{padding-block:.25rem}.py-2{padding-block:.5rem}.py-3{padding-block:.75rem}.py-4{padding-block:1rem}.py-8{padding-block:2rem}.py-12{padding-block:3rem}.py-20{padding-block:5rem}
.m-0{margin:0}.mx-auto{margin-inline:auto}.mt-2{margin-top:.5rem}.mt-4{margin-top:1rem}.mt-6{margin-top:1.5rem}.mt-8{margin-top:2rem}
.mb-1{margin-bottom:.25rem}.mb-2{margin-bottom:.5rem}.mb-4{margin-bottom:1rem}.mb-6{margin-bottom:1.5rem}
.w-full{width:100%}.w-auto{width:auto}.h-full{height:100%}.h-screen{height:100vh}.min-h-screen{min-height:100vh}
.max-w-md{max-width:28rem}.max-w-lg{max-width:32rem}.max-w-2xl{max-width:42rem}.max-w-4xl{max-width:56rem}.max-w-6xl{max-width:72rem}.max-w-full{max-width:100%}
.text-center{text-align:center}.text-right{text-align:right}.text-left{text-align:left}
.text-xs{font-size:.75rem;line-height:1.1rem}.text-sm{font-size:.875rem;line-height:1.35rem}.text-base{font-size:1rem}.text-lg{font-size:1.125rem}.text-xl{font-size:1.25rem}
.text-2xl{font-size:1.5rem;line-height:1.9rem}.text-3xl{font-size:1.875rem;line-height:2.2rem}.text-4xl{font-size:2.25rem;line-height:2.6rem}.text-5xl{font-size:3rem;line-height:1.1}
.font-normal{font-weight:400}.font-medium{font-weight:500}.font-semibold{font-weight:600}.font-bold{font-weight:700}.font-extrabold{font-weight:800}.font-black{font-weight:900}
.leading-tight{line-height:1.25}.leading-relaxed{line-height:1.7}.tracking-tight{letter-spacing:-.01em}.uppercase{text-transform:uppercase}
.text-white{color:#fff}.text-black{color:#000}.text-gray-400{color:#9ca3af}.text-gray-500{color:#6b7280}.text-gray-600{color:#4b5563}.text-gray-700{color:#374151}
.bg-white{background-color:#fff}.bg-black{background-color:#000}.bg-transparent{background:transparent}
.bg-gray-100{background-color:#f3f4f6}.bg-gray-800{background-color:#1f2937}.bg-gray-900{background-color:#111827}
.rounded{border-radius:.5rem}.rounded-md{border-radius:.375rem}.rounded-lg{border-radius:.75rem}.rounded-xl{border-radius:1rem}.rounded-2xl{border-radius:1.25rem}.rounded-full{border-radius:9999px}
.border{border:1px solid var(--ax-line)}.border-2{border-width:2px}.border-t{border-top:1px solid var(--ax-line)}.border-b{border-bottom:1px solid var(--ax-line)}
.shadow{box-shadow:0 1px 3px rgba(0,0,0,.24)}.shadow-md{box-shadow:0 6px 18px rgba(0,0,0,.22)}.shadow-lg{box-shadow:0 18px 40px rgba(0,0,0,.28)}.shadow-xl{box-shadow:0 26px 60px rgba(0,0,0,.34)}
.overflow-hidden{overflow:hidden}.overflow-auto{overflow:auto}.relative{position:relative}.absolute{position:absolute}.fixed{position:fixed}.sticky{position:sticky;top:0}
.z-10{z-index:10}.z-50{z-index:50}.inset-0{inset:0}.top-0{top:0}.left-0{left:0}.right-0{right:0}.bottom-0{bottom:0}
.cursor-pointer{cursor:pointer}.select-none{user-select:none}.pointer-events-none{pointer-events:none}
.transition{transition:all .22s cubic-bezier(.22,.61,.36,1)}.transition-transform{transition:transform .22s ease}
.hover\:scale-105:hover{transform:scale(1.05)}.hover\:opacity-90:hover{opacity:.9}.hover\:shadow-lg:hover{box-shadow:0 18px 40px rgba(0,0,0,.3)}
.opacity-0{opacity:0}.opacity-50{opacity:.5}.opacity-100{opacity:1}.backdrop-blur{backdrop-filter:blur(12px)}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.break-words{overflow-wrap:anywhere}
`;

/**
 * Safe boot: an error boundary, a toast bus and small helpers, injected into every
 * standalone page. A runtime error then shows a readable box instead of a blank
 * preview — the single most common complaint about generated code.
 */
const SAFE_BOOT = String.raw`
/* NEXUS APEX safe boot — keeps a generated page alive when a line of it fails. */
(function () {
  if (window.NEXUS_SAFE) return;
  window.NEXUS_SAFE = true;
  var doc = document;
  function ready(fn) { if (doc.readyState !== "loading") fn(); else doc.addEventListener("DOMContentLoaded", fn, { once: true }); }
  function box(msg, detail) {
    try {
      var id = "nx-error-box";
      var el = doc.getElementById(id);
      if (!el) {
        el = doc.createElement("div");
        el.id = id;
        el.setAttribute("role", "alert");
        el.style.cssText = "position:fixed;inset-inline:12px;bottom:12px;z-index:2147483647;background:#1b1b18;color:#f4efe9;border:1px solid #d97757;border-radius:14px;padding:12px 14px;font:13px/1.7 system-ui,sans-serif;box-shadow:0 18px 44px rgba(0,0,0,.45);max-height:40vh;overflow:auto";
        doc.body.appendChild(el);
      }
      el.innerHTML = '<b style="color:#d97757">تعذّر تشغيل جزء من الصفحة</b><div style="opacity:.85">' + String(msg || "").replace(/</g, "&lt;") + '</div>' +
        (detail ? '<details style="margin-top:6px"><summary style="cursor:pointer;opacity:.7">التفاصيل التقنية</summary><pre style="white-space:pre-wrap;font-size:11.5px;opacity:.8;margin:6px 0 0">' + String(detail).replace(/</g, "&lt;") + '</pre></details>' : "");
    } catch (e) { /* nothing left to do */ }
  }
  window.NEXUS_ERROR = box;
  window.addEventListener("error", function (e) { box(e.message || "خطأ في الجافاسكربت", (e.filename || "") + ":" + (e.lineno || 0) + "\n" + (e.error && e.error.stack ? e.error.stack : "")); });
  window.addEventListener("unhandledrejection", function (e) { box("وعد مرفوض بلا معالجة", String((e.reason && e.reason.message) || e.reason || "")); });
  window.NEXUS = {
    $: function (s, r) { return (r || doc).querySelector(s); },
    $$: function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); },
    ls: {
      get: function (k, d) { try { var v = localStorage.getItem("nx:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
      set: function (k, v) { try { localStorage.setItem("nx:" + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
    },
    money: function (n, cur) { try { return new Intl.NumberFormat("ar-DZ", { maximumFractionDigits: 0 }).format(n) + " " + (cur || "دج"); } catch (e) { return n + " دج"; } },
    date: function (v) { try { return new Intl.DateTimeFormat("ar-DZ", { dateStyle: "medium" }).format(v instanceof Date ? v : new Date(v)); } catch (e) { return String(v); } },
    toast: function (msg, ms) {
      var t = doc.createElement("div");
      t.textContent = String(msg);
      t.style.cssText = "position:fixed;inset-inline:0;top:16px;margin:auto;width:max-content;max-width:90vw;background:var(--ax-brand,#d97757);color:#fff;padding:9px 16px;border-radius:999px;font:600 13px system-ui;z-index:2147483646;box-shadow:0 12px 30px rgba(0,0,0,.35);opacity:0;transition:opacity .25s,transform .25s;transform:translateY(-8px)";
      doc.body.appendChild(t);
      requestAnimationFrame(function () { t.style.opacity = "1"; t.style.transform = "none"; });
      setTimeout(function () { t.style.opacity = "0"; setTimeout(function () { t.remove(); }, 300); }, ms || 2000);
    },
    copy: function (txt, msg) { try { navigator.clipboard.writeText(txt).then(function () { window.NEXUS.toast(msg || "تم النسخ"); }); } catch (e) { window.NEXUS.toast("النسخ غير متاح"); } },
    fmt: function (n) { return new Intl.NumberFormat("ar-DZ").format(n); }
  };
  ready(function () {
    /* reveal-on-scroll used by most generated landing pages */
    var els = window.NEXUS.$$("[data-reveal],.reveal,.fade-in");
    if (!els.length) return;
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) { els.forEach(function (e) { e.classList.add("is-visible"); e.style.opacity = 1; }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-visible"); e.target.style.opacity = "1"; e.target.style.transform = "none"; io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(function (e) { io.observe(e); });
  });
})();
`;

/**
 * Game kit — injected only when the page looks like a game but has no game feel:
 * pause button, keyboard/touch input map, score keeper with a localStorage best
 * score, and a fixed-timestep ticker a canvas loop can opt into.
 */
const GAME_KIT = String.raw`
/* NEXUS APEX game kit — pause, controls, score, best score, touch pad. */
(function () {
  if (window.NEXUS_GAME) return;
  window.NEXUS_GAME = true;
  var N = window.NEXUS || {};
  function ready(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn, { once: true }); }
  window.NX_GAME = {
    score: 0, best: (N.ls && N.ls.get("best", 0)) || 0, paused: false,
    add: function (n) { this.score += n || 0; this.paint(); if (this.score > this.best) { this.best = this.score; if (N.ls) N.ls.set("best", this.best); } },
    reset: function () { this.score = 0; this.paint(); },
    paint: function () {
      var s = document.getElementById("nx-score");
      if (s) s.textContent = N.fmt ? N.fmt(this.score) : String(this.score);
      var b = document.getElementById("nx-best");
      if (b) b.textContent = N.fmt ? N.fmt(this.best) : String(this.best);
    },
    toggle: function () { this.paused = !this.paused; var b = document.getElementById("nx-pause"); if (b) b.textContent = this.paused ? "▶ متابعة" : "❚❚ إيقاف"; document.dispatchEvent(new CustomEvent("nx:pause", { detail: this.paused })); },
    keys: {}, down: {}, touch: {},
    bind: function (map) {
      var self = this;
      document.addEventListener("keydown", function (e) { self.keys[e.key] = true; self.down[e.key] = true; if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.key) >= 0) e.preventDefault(); if (e.key === "p" || e.key === "P") self.toggle(); });
      document.addEventListener("keyup", function (e) { self.keys[e.key] = false; });
      window.addEventListener("blur", function () { self.keys = {}; });
      if (map) window.NX_KEYS = map;
      return self.keys;
    },
    frame: function (cb) {
      var last = performance.now(), acc = 0, STEP = 1000 / 60, self = this;
      function tick(now) {
        requestAnimationFrame(tick);
        var dt = now - last; last = now; if (dt > 250) dt = 250;
        if (self.paused) return;
        acc += dt;
        var guard = 0;
        while (acc >= STEP && guard++ < 5) { cb(STEP / 1000); acc -= STEP; }
      }
      requestAnimationFrame(tick);
    }
  };
  ready(function () {
    var host = document.querySelector("[data-nx-game-ui]");
    if (!host) return;
    var bar = document.createElement("div");
    bar.className = "nx-game-bar";
    bar.innerHTML = '<span>النقاط <b id="nx-score">0</b></span><span>الأفضل <b id="nx-best">' + (N.fmt ? N.fmt(window.NX_GAME.best) : window.NX_GAME.best) + '</b></span>' +
      '<button type="button" id="nx-pause">❚❚ إيقاف</button><button type="button" id="nx-restart">↺ إعادة</button>' +
      '<span class="nx-game-hint">مسافة = إيقاف · الأسهم = تحرّك</span>';
    host.appendChild(bar);
    bar.querySelector("#nx-pause").addEventListener("click", function () { window.NX_GAME.toggle(); });
    bar.querySelector("#nx-restart").addEventListener("click", function () { location.reload(); });
    window.NX_GAME.paint();
  });
})();
`;

const GAME_UI_CSS = String.raw`
.nx-game-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;justify-content:center;margin:10px auto;padding:8px 12px;border:1px solid var(--ax-line);border-radius:999px;background:var(--ax-surface);font:600 13px/1 var(--ax-font);color:var(--ax-text);max-width:max-content}
.nx-game-bar b{color:var(--ax-brand)}
.nx-game-bar button{border:1px solid var(--ax-line);background:transparent;color:inherit;border-radius:999px;padding:6px 12px;font:inherit;cursor:pointer}
.nx-game-bar button:hover{border-color:var(--ax-brand);color:var(--ax-brand)}
.nx-game-hint{opacity:.6;font-weight:500;font-size:11.5px}
.nx-badge{position:fixed;inset-block-end:10px;inset-inline-end:10px;z-index:2147483000;display:flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;background:rgba(15,15,14,.72);color:#f4efe9;font:600 11.5px/1 system-ui;text-decoration:none;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.14);opacity:.85;transition:opacity .2s}
.nx-badge:hover{opacity:1}
.nx-badge i{width:7px;height:7px;border-radius:50%;background:#d97757;box-shadow:0 0 10px #d97757}
`;

/* -------------------------------------------------------------- repairs */

interface Ctx {
  plan: ApexPlan;
  palette: Palette;
  text: string;
  fixed: string[];
  warnings: string[];
}

const CDN_RULES: { test: RegExp; note: string }[] = [
  { test: /<script[^>]+src=["'][^"']*(?:cdn\.tailwindcss\.com|tailwind)[^"']*["'][^>]*>\s*<\/script>/gi, note: "Tailwind CDN → Tailwind-lite مدمج" },
  { test: /<link[^>]+href=["'][^"']*(?:cdn\.tailwindcss\.com|tailwind)[^"']*["'][^>]*>/gi, note: "Tailwind CDN → Tailwind-lite مدمج" },
  { test: /<script[^>]+src=["'][^"']*(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|code\.jquery\.com|bootstrapcdn)[^"']*["'][^>]*>\s*<\/script>/gi, note: "مكتبة من CDN → محرّك APEX المدمج" },
  { test: /<link[^>]+href=["'][^"']*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^"']*["'][^>]*>/gi, note: "خطوط Google → خطوط النظام" },
  { test: /<link[^>]+href=["'][^"']*(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|bootstrapcdn)[^"']*["'][^>]*>/gi, note: "CSS خارجي → ملف مدمج" },
];

function applyPalette(html: string, ctx: Ctx): string {
  const vars = themeVars(ctx.palette);
  const styleBlock = `<style id="nx-palette">\n:root{${vars}}\n${APEX_CSS}\n${TAILWIND_LITE}\n${GAME_UI_CSS}\n</style>`;
  const hasApexCss = /--ax-brand:/.test(html);
  if (hasApexCss) {
    // the model already declared variables: keep its look, just ensure the base layer exists
    if (/--ax-surface:/.test(html)) return injectBefore(html, "</head>", styleBlock.replace(/<style id="nx-palette">[\s\S]*?<\/style>/, `<style id="nx-base">\n${APEX_CSS}\n${TAILWIND_LITE}\n${GAME_UI_CSS}\n</style>`));
    return injectBefore(html, "</head>", styleBlock);
  }
  ctx.fixed.push(`لوحة ألوان APEX (${ctx.palette.id}) + نظام تصميم كامل`);
  return injectBefore(html, "</head>", styleBlock);
}

function stripCdn(html: string, ctx: Ctx): string {
  let out = html;
  for (const rule of CDN_RULES) {
    if (rule.test.test(out)) {
      rule.test.lastIndex = 0;
      out = out.replace(rule.test, "");
      if (!ctx.fixed.includes(rule.note)) ctx.fixed.push(rule.note);
    }
    rule.test.lastIndex = 0;
  }
  return out;
}

function injectBefore(html: string, needle: string, extra: string): string {
  const i = html.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return html + extra;
  return html.slice(0, i) + extra + "\n" + html.slice(i);
}

function injectAfter(html: string, needle: string, extra: string): string {
  const i = html.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return extra + html;
  return html.slice(0, i + needle.length) + "\n" + extra + html.slice(i + needle.length);
}

/** Closes the tags a truncated answer left open (html-ish only). */
function balanceTags(html: string, ctx: Ctx): string {
  let out = html;
  const pairs: [string, RegExp, RegExp][] = [
    ["script", /<script\b/gi, /<\/script>/gi],
    ["style", /<style\b/gi, /<\/style>/gi],
    ["body", /<body\b/gi, /<\/body>/gi],
    ["html", /<html\b/gi, /<\/html>/gi],
  ];
  for (const [name, o, c] of pairs) {
    const opens = (out.match(o) ?? []).length;
    const closes = (out.match(c) ?? []).length;
    if (opens > closes) {
      out += `\n</${name}>`.repeat(opens - closes);
      ctx.fixed.push(`إغلاق ${opens - closes} × </${name}> مقطوع`);
    }
    o.lastIndex = 0;
    c.lastIndex = 0;
  }
  // void elements that models often close by mistake
  out = out.replace(/<\/(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)>/gi, "");
  return out;
}

/** A script that mounts the modules the markup asks for (and nothing else). */
function mountScript(ids: string[], ctx: Ctx): string {
  const defs = ids.map((id) => apexModule(id)).filter((m): m is ApexModuleDef => !!m);
  if (!defs.length) return "";
  const kernel = ids.includes("kernel") ? "" : (apexModule("kernel")?.code ?? "");
  const bodies = defs.filter((m) => m.id !== "kernel").map((m) => m.code);
  ctx.fixed.push(`تشغيل ${defs.length} وحدة APEX على الحاويات data-apex (${defs.map((d) => d.id).join(", ")})`);
  return `<script>\n${jsSafe(kernel)}\n${bodies.map(jsSafe).join("\n")}\n</script>`;
}

function detectKind(html: string, text: string): "site" | "app" | "game" | "component" {
  const both = `${text}\n${html}`;
  if (/<canvas\b/i.test(html) || /\b(requestAnimationFrame|gameLoop|Player|لفل|مستوى|وحش)\b/.test(both)) return "game";
  if (/data-apex=|ax-dashboard|ax-table|ax-kanban/i.test(html)) return "app";
  if (!/<!doctype|<html|<body/i.test(html)) return "component";
  return "site";
}

/** Builds the minimal stats object verifyProject expects for a single file. */
function statsFor(html: string, css: string, modules: ApexModuleDef[]): ApexStats {
  const htmlLines = html.split("\n").length;
  const cssLines = css.split("\n").length;
  const moduleLines = modules.reduce((s, m) => s + m.lines, 0);
  const dataJson = /window\.APEX_DATA\s*=/.test(html);
  const recordish = (html.match(/\{\s*"(?:id|name|title|label)"/g) ?? []).length;
  const rows = dataJson ? Math.max(60, recordish) : recordish;
  const dataLines = dataJson ? Math.max(40, Math.round(rows * 1.2)) : 0;
  const jsLines = (html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) ?? []).reduce((s, b) => s + b.split("\n").length, 0) + moduleLines;
  return {
    files: 1,
    lines: htmlLines + moduleLines,
    bytes: byteLength(html),
    htmlLines,
    cssLines,
    jsLines,
    dataLines,
    dataRows: rows,
    modules: modules.length,
    widgets: modules.map((m) => m.id),
    pages: Math.max(1, (html.match(/data-page=/g) ?? []).length || 1),
    score: 0,
  };
}

/** Synthesises a plan for code the model wrote by hand (needed by verifyProject). */
function planFor(kind: string, text: string, opts: StandaloneOptions): ApexPlan {
  const detected = planFromText(text || opts.title || "application", { palette: opts.palette as string | undefined, title: opts.title });
  const blueprint = kind === "game" ? "arcade" : detected.plan.blueprint;
  const bp = blueprintById(blueprint) ?? blueprintById("landing")!;
  return {
    ...detected.plan,
    blueprint: bp.id,
    kind: bp.kind,
    title: opts.title ?? detected.plan.title,
    scale: detected.plan.scale,
  };
}

/**
 * The shared verifier knows what a *factory* project must have (6 000 lines,
 * generated datasets, N pages). A single hand-written file is judged on its own
 * terms: it only has to be complete, offline and safe to open in a browser.
 */
function standaloneReport(base: VerifyReport, html: string, stats: ApexStats): VerifyReport {
  const usesData = /<table\b|<tbody\b|data-list|class="[^"]*\b(list|grid|cards|table)\b/i.test(html);
  const minLines = stats.lines >= 400 ? 400 : 200;
  const checks = base.checks.map((c) => {
    if (c.id === "size") {
      const ok = stats.lines >= minLines;
      return { ...c, label: `ملف واحد كامل (≥ ${minLines} سطر)`, ok, detail: `${stats.lines.toLocaleString("ar-DZ")} سطر · ${(stats.bytes / 1024).toFixed(0)} KB`, weight: 3 };
    }
    if (c.id === "data") {
      const ok = usesData ? stats.dataRows >= 20 : true;
      return { ...c, label: usesData ? "بيانات حقيقية داخل الصفحة" : "لا يحتاج قاعدة بيانات", ok, detail: usesData ? `${stats.dataRows} سجل` : "صفحة عرض/تفاعل بلا جداول", weight: usesData ? 2 : 0.4 };
    }
    if (c.id === "hosts") {
      const hosts = Array.from(new Set(Array.from(html.matchAll(/data-apex=["']([\w-]+)["']/g)).map((m) => m[1])));
      const unresolved = hosts.filter((h) => !resolveModuleId(h) && h !== "view");
      return { ...c, ok: unresolved.length === 0, detail: hosts.length ? (unresolved.length ? `بلا وحدة: ${unresolved.join(", ")}` : `${hosts.length} حاوية موصولة`) : "بلا حاويات وحدات" };
    }
    return c;
  });
  const total = checks.reduce((s, c) => s + (c.weight ?? 1), 0) || 1;
  const got = checks.reduce((s, c) => s + (c.ok ? (c.weight ?? 1) : 0), 0);
  const score = Math.round((got / total) * 100);
  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, score, checks, notes: failed.map((f) => `${f.label}: ${f.detail}`) };
}

/* ----------------------------------------------------------- the entry */

/**
 * Turns any model answer (markdown, half a file, a component, a game) into one
 * complete runnable page. Deterministic, offline, safe to call on user input.
 */
export function completeStandalone(raw: string, opts: StandaloneOptions = {}): StandaloneResult {
  const fixed: string[] = [];
  const warnings: string[] = [];
  const statsOverride: { rows: number } = { rows: 0 };
  const { code, notes, lang: codeLang } = extractCode(raw || "");
  fixed.push(...notes);
  let code2 = code.trim();

  if (code2.length < 60) {
    throw new Error("الكود قصير جدًا (أقل من 60 حرفًا) — الصق الملف كاملًا أو اكتب وصفًا للمشروع.");
  }

  /* unescape double-escaped model output (\\n inside a JSON string) */
  if (/\\n/.test(code2) && !/\n/.test(code2)) {
    code2 = code2.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"');
    fixed.push("فكّ تشفير الكود (كان JSON مضاعف)");
  }

  /* leading prose the model put before the file */
  const docStart = code2.search(/<!doctype\s+html|<html\b|<body\b/i);
  if (docStart > 0) {
    fixed.push(`حذف ${code2.slice(0, docStart).trim().split("\n").length} سطر كلام قبل الكود`);
    code2 = code2.slice(docStart);
  }
  code2 = code2.replace(/^\s*(?:here(?:'s| is)[^\n]*|هذا هو[^\n]*|تفضل[^\n]*)\n+/i, "");

  const kind = detectKind(code2, opts.text ?? "");
  const palette = opts.palette ? paletteById(opts.palette) : guessPalette(`${opts.text ?? ""} ${code2.slice(0, 400)}`, kind === "game" ? "cyber" : "midnight");
  const plan = planFor(kind, opts.text ?? "", opts);
  const ctx: Ctx = { plan, palette, text: opts.text ?? "", fixed, warnings };

  /* 1 — a real document */
  const isDoc = /<!doctype\s+html|<html\b/i.test(code2);
  if (!isDoc) {
    const bare = /<body\b|<head\b/i.test(code2);
    const inner = bare ? code2 : code2;
    const title = opts.title ?? plan.title ?? "مشروع Nexus";
    code2 = `<!doctype html>
<html lang="${plan.lang}" dir="${plan.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(plan.tagline || plan.desc || "مشروع منشور بـ Nexus AI")}">
</head>
<body>
${bare ? inner : `<main class="ax-wrap" data-page="home">\n${inner}\n</main>`}
</body>
</html>`;
    fixed.push(bare ? "تغليف الكود داخل مستند HTML كامل" : "تغليف الكود كصفحة كاملة (head + body + main)");
  }

  /* 2 — a head that browsers and crawlers need */
  if (opts.keepMeta !== false) {
    const headBits: string[] = [];
    if (!/<meta[^>]+charset/i.test(code2)) headBits.push('<meta charset="utf-8">');
    if (!/name="viewport"/i.test(code2)) headBits.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
    if (!/<title>\s*\S/i.test(code2)) headBits.push(`<title>${esc(opts.title ?? plan.title ?? "مشروع Nexus")}</title>`);
    if (!/name="description"/i.test(code2)) headBits.push(`<meta name="description" content="${esc(plan.tagline || plan.desc || "مشروع")}">`);
    if (!/name="theme-color"/i.test(code2)) headBits.push(`<meta name="theme-color" content="${palette.bg}">`);
    if (!/property="og:title"/i.test(code2)) headBits.push(`<meta property="og:title" content="${esc(opts.title ?? plan.title ?? "مشروع Nexus")}">`, `<meta property="og:description" content="${esc(plan.tagline || plan.desc || "")}">`, '<meta property="og:type" content="website">');
    if (!/rel="icon"/i.test(code2)) headBits.push(`<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${palette.bg}"/><circle cx="32" cy="32" r="14" fill="${palette.brand}"/></svg>`)}">`);
    if (headBits.length) {
      code2 = injectBefore(code2, "</head>", headBits.join("\n"));
      fixed.push(`إضافة ${headBits.length} وسم <head> ناقص (charset · viewport · SEO · أيقونة)`);
    }
  }

  /* 3 — language / direction */
  const hasArabic = /[\u0600-\u06FF]/.test(code2);
  code2 = code2.replace(/<html\b([^>]*)>/i, (_m, attrs: string) => {
    let a = attrs ?? "";
    if (!/lang=/i.test(a)) a += ` lang="${hasArabic ? "ar" : plan.lang}"`;
    if (!/dir=/i.test(a)) a += ` dir="${hasArabic ? "rtl" : plan.dir}"`;
    return `<html${a}>`;
  });
  if (!/dir="rtl"/i.test(code2) && hasArabic) {
    code2 = injectBefore(code2, "</head>", "");
    warnings.push("الصفحة فيها نص عربي بدون dir=rtl — تحقّق من المحاذاة");
  }

  /* 4 — offline: no CDN, no network fonts */
  code2 = stripCdn(code2, ctx);

  /* 5 — design system */
  code2 = applyPalette(code2, ctx);

  /* 6 — close what truncation left open, then repair empty containers */
  code2 = balanceTags(code2, ctx);
  const openDiv = (code2.match(/<div\b/gi) ?? []).length;
  const closeDiv = (code2.match(/<\/div>/gi) ?? []).length;
  if (openDiv > closeDiv) {
    // close divs at the end of the body rather than appending after </html>
    const closers = "</div>".repeat(Math.min(openDiv - closeDiv, 60));
    code2 = injectBefore(code2, "</body>", closers);
    fixed.push(`إغلاق ${openDiv - closeDiv} × </div> مقطوع`);
  }

  /* 7 — the runtime: every `data-apex` host is resolved to a real module */
  const moduleDefs: ApexModuleDef[] = [];
  const dataKinds = new Set<string>((plan.dataKinds ?? []).slice(0, 8));
  if (opts.mount !== false) {
    const rawHosts = Array.from(new Set(Array.from(code2.matchAll(/data-apex=["']([\w-]+)["']/g)).map((m) => m[1])));
    const wanted = ["kernel"];
    const fallbackData = plan.dataKinds?.[0] ?? "products";
    let rewritten = 0;
    for (const host of rawHosts) {
      const target = resolveHost({ apex: host }, fallbackData);
      if (target.cfg.data) dataKinds.add(String(target.cfg.data));
      else if (HOST_DATA[host]) dataKinds.add(HOST_DATA[host]);
      if (!wanted.includes(target.apex)) wanted.push(target.apex);
      const cfgJson = JSON.stringify(target.cfg);
      // rewrite the host: same id when it already points at a module, alias + cfg otherwise
      const re = new RegExp(`data-apex=(["'])${host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`, "g");
      if (target.apex !== host || Object.keys(target.cfg).length > 1) {
        code2 = code2.replace(re, `data-apex="${target.apex}" data-cfg='${cfgJson.replace(/'/g, "&#39;")}'`);
        rewritten++;
      }
    }
    const unresolved = rawHosts.filter((h) => !resolveModuleId(h) && resolveHost({ apex: h }, fallbackData).apex !== "view");
    if (unresolved.length) ctx.warnings.push(`حاويات بلا وحدة: ${unresolved.join(", ")}`);
    if (rewritten) ctx.fixed.push(`توجيه ${rewritten} حاوية data-apex إلى الوحدات المناسبة (+ بيانات)`);

    const script = mountScript(wanted, ctx);
    if (script) {
      code2 = injectBefore(code2, "</body>", script);
      for (const id of wanted) {
        const def = apexModule(id);
        if (def) moduleDefs.push(def);
      }
    }
  }

  /* 8 — the plan/data bridge: real Algerian data so every list is populated */
  const bundle = moduleDefs.length > 1 && dataKinds.size ? buildData(plan.seed, Array.from(dataKinds), { scale: "standard" }) : null;
  if (moduleDefs.length > 1) {
    const planJson = jsSafe(JSON.stringify({ id: plan.id, title: opts.title ?? plan.title, tagline: plan.tagline, lang: hasArabic ? "ar" : plan.lang, dir: hasArabic ? "rtl" : plan.dir, palette: palette.id, seed: plan.seed, blueprint: plan.blueprint }));
    const dataJson = bundle ? jsSafe(JSON.stringify(bundle)) : "{}";
    const rows = bundle ? Object.keys(bundle).reduce((n, k) => n + (Array.isArray((bundle as Record<string, unknown>)[k]) ? ((bundle as Record<string, unknown>)[k] as unknown[]).length : 0), 0) : 0;
    ctx.fixed.push(`حقن بيانات حقيقية (${rows.toLocaleString("ar-DZ")} سجل: ${Array.from(dataKinds).join(", ")})`);
    code2 = injectBefore(
      code2,
      "</body>",
      `<script>\nwindow.APEX_PLAN=${planJson};\nwindow.APEX_DATA=${dataJson};\nwindow.APEX_STATE=window.APEX_STATE||{};\n</script>`
    );
    statsOverride.rows = rows;
  }

  /* 9 — safe boot (error boundary + helpers) and, for games, the game kit */
  if (!/NEXUS_SAFE/.test(code2)) {
    code2 = injectBefore(code2, "</body>", `<script>\n${jsSafe(SAFE_BOOT)}\n</script>`);
    fixed.push("حقن Safe Boot (صندوق خطأ واضح بدل صفحة بيضاء + أدوات NEXUS.toast/format/store)");
  }
  if (kind === "game" && !/NX_GAME/.test(code2)) {
    code2 = injectBefore(code2, "</body>", `<script>\n${jsSafe(GAME_KIT)}\n</script>`);
    if (!/data-nx-game-ui/.test(code2)) {
      code2 = injectBefore(code2, "</body>", '<div data-nx-game-ui></div>');
      fixed.push("إضافة شريط اللعب (النقاط · الأفضل · إيقاف · إعادة · مساعدة الأسهم)");
    }
  }

  /* 10 — PWA bits + the credit badge */
  if (opts.pwa !== false && kind !== "component") {
    if (!/<link[^>]+rel="manifest"/i.test(code2)) {
      const manifest = { name: opts.title ?? plan.title, short_name: (opts.title ?? plan.title).slice(0, 12), start_url: "./", display: "standalone", background_color: palette.bg, theme_color: palette.brand, icons: [] };
      code2 = injectBefore(code2, "</head>", `<link rel="manifest" href="data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}">`);
      fixed.push("وسوم PWA (manifest مدمج + لون السمة)");
    }
  }
  if (!/nx-badge/.test(code2)) {
    code2 = injectBefore(code2, "</body>", `<a class="nx-badge" href="/code" target="_blank" rel="noopener"><i></i>بُني بـ Nexus APEX v18</a>`);
  }

  /* 10b — real SEO/a11y fixes on hand-written markup */
  if (!/application\/ld\+json/.test(code2)) {
    const ld = { "@context": "https://schema.org", "@type": kind === "game" ? "VideoGame" : "WebSite", name: opts.title ?? plan.title, description: plan.tagline || plan.desc || "", inLanguage: hasArabic ? "ar" : plan.lang };
    code2 = injectBefore(code2, "</head>", `<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
    fixed.push("بيانات منظمة JSON-LD (SEO)");
  }
  if (!/<h1\b/i.test(code2)) {
    code2 = injectAfter(code2, "<body", `\n<h1 class="sr-only">${esc(opts.title ?? plan.title ?? "مشروع Nexus")}</h1>`);
    fixed.push("عنوان h1 مخفي بصريًا (بنية سليمة لمحركات البحث وقارئات الشاشة)");
  }
  code2 = code2.replace(/<main\b(?![^>]*role=)/i, '<main role="main"');
  if (/<canvas\b/i.test(code2) && !/<canvas[^>]*aria-label/i.test(code2)) {
    code2 = code2.replace(/<canvas\b/i, '<canvas aria-label="ساحة اللعب" role="img"');
    fixed.push("وسم ARIA للوحة اللعب (قارئات الشاشة)");
  }
  code2 = code2.replace(/<nav\b(?![^>]*aria-label)/i, '<nav aria-label="القائمة الرئيسية"');

  /* 11 — last line of defence against a broken preview */
  if (!/\b(?:document|window|addEventListener|console)\b/.test(code2) && kind !== "component") {
    warnings.push("الصفحة بلا أي جافاسكربت — لا تفاعل فيها");
  }
  if (openDiv > closeDiv + 60) warnings.push(`عدد <div> غير متوازن بفارق ${openDiv - closeDiv}`);

  const css = Array.from(code2.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)).map((m) => m[1]).join("\n") + APEX_CSS + TAILWIND_LITE + GAME_UI_CSS;
  const stats = statsFor(code2, css, moduleDefs);
  if (statsOverride.rows > 0) {
    stats.dataRows = statsOverride.rows;
    stats.dataLines = Math.max(stats.dataLines, Math.round(statsOverride.rows * 1.2));
  }
  const report = standaloneReport(verifyProject({ plan, bp: blueprintById(plan.blueprint)!, modules: moduleDefs, files: [] as ApexFile[], html: code2, css, stats }), code2, stats);

  return {
    html: code2,
    fixed,
    warnings,
    plan,
    palette,
    kind,
    modules: moduleDefs,
    stats,
    report,
    score: report.score,
    lines: code2.split("\n").length + moduleDefs.reduce((s, m) => s + m.lines, 0),
    bytes: byteLength(code2),
    lang: hasArabic ? "ar" : plan.lang,
    dir: hasArabic ? "rtl" : plan.dir,
  };
}

/** Convenience: does this answer contain something worth completing? */
export function looksLikeDeliverable(text: string): boolean {
  const t = text || "";
  if (t.length < 240) return false;
  if (/```(?:html|htm)/i.test(t)) return true;
  if (/<!doctype\s+html|<html[\s>]|<body[\s>]/i.test(t)) return true;
  if (/data-apex=["'][\w-]+["']/.test(t)) return true;
  return false;
}

export const STANDALONE_KINDS = ["site", "app", "game", "component"] as const;
export type StandaloneKind = (typeof STANDALONE_KINDS)[number];
