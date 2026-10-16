/**
 * NEXUS APEX — theme engine.
 *
 * Turns a palette into (a) CSS variables and (b) one complete, modern stylesheet:
 * glass surfaces, gradient meshes, motion primitives, dark/light support, RTL,
 * print rules, accessibility focus rings, and a component vocabulary
 * (`ax-*`) that every module in the widget library uses.
 */

import { FONT_STACKS, type Palette } from "./palettes";

/** CSS custom properties for a palette. Written into the generated `:root`. */
export function themeVars(p: Palette): string {
  const radius = p.radius;
  const isDark = p.mode === "dark";
  return [
    `  --ax-bg:${p.bg};`,
    `  --ax-bg2:${p.bg2};`,
    `  --ax-card:${p.card};`,
    `  --ax-line:${p.line};`,
    `  --ax-text:${p.text};`,
    `  --ax-dim:${p.dim};`,
    `  --ax-brand:${p.brand};`,
    `  --ax-brand2:${p.brand2};`,
    `  --ax-accent:${p.accent};`,
    `  --ax-accent2:${p.accent2};`,
    `  --ax-ok:${p.ok};`,
    `  --ax-warn:${p.warn};`,
    `  --ax-err:${p.err};`,
    `  --ax-brand-ink:${isDark ? "#08131d" : "#ffffff"};`,
    `  --ax-brand-soft:${hexAlpha(p.brand, isDark ? 0.18 : 0.12)};`,
    `  --ax-brand-soft2:${hexAlpha(p.brand2, isDark ? 0.16 : 0.1)};`,
    `  --ax-accent-soft:${hexAlpha(p.accent, 0.14)};`,
    `  --ax-glass:${isDark ? "rgba(255,255,255,.045)" : "rgba(255,255,255,.72)"};`,
    `  --ax-glass-2:${isDark ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.88)"};`,
    `  --ax-ink-soft:${isDark ? "rgba(0,0,0,.32)" : "rgba(15,23,42,.06)"};`,
    `  --ax-shadow:0 1px 2px ${hexAlpha("#000000", isDark ? 0.4 : 0.06)}, 0 12px 32px -12px ${hexAlpha("#000000", isDark ? 0.7 : 0.22)};`,
    `  --ax-shadow-lg:0 2px 4px ${hexAlpha("#000000", isDark ? 0.45 : 0.08)}, 0 32px 64px -24px ${hexAlpha("#000000", isDark ? 0.8 : 0.3)};`,
    `  --ax-glow:0 0 0 1px ${hexAlpha(p.brand, 0.4)}, 0 0 34px -6px ${hexAlpha(p.brand, 0.55)};`,
    `  --ax-r:${radius}px;`,
    `  --ax-r-sm:${Math.max(6, radius - 6)}px;`,
    `  --ax-r-lg:${radius + 8}px;`,
    `  --ax-gap:${radius >= 18 ? 22 : 18}px;`,
    `  --ax-pad:${radius >= 18 ? 26 : 22}px;`,
    `  --ax-font:${FONT_STACKS[p.font]};`,
    `  --ax-ease:cubic-bezier(.22,.61,.36,1);`,
    `  --ax-ease-bounce:cubic-bezier(.34,1.56,.64,1);`,
    `  --ax-series:${p.series.join(",")};`,
  ].join("\n");
}

export function paletteSeries(p: Palette): string[] {
  return p.series;
}

/** #rrggbb → rgba() with alpha. Accepts 3- and 6-digit hex. */
export function hexAlpha(hex: string, alpha: number): string {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6) || "000000", 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/** Slightly darker/lighter variant of a hex color (for hover states). */
export function shade(hex: string, amount: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h || "000000", 16);
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The generated project stylesheet. ~700 lines of real CSS: layouts, cards,
 * buttons, tables, forms, chips, kanban, calendar, chat, tables, print, motion,
 * dark/light, RTL/LTR, and responsive rules down to 360px.
 */
export const APEX_CSS = String.raw`
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
body{margin:0;background:var(--ax-bg);color:var(--ax-text);font-family:var(--ax-font);line-height:1.7;-webkit-font-smoothing:antialiased;
  background-image:radial-gradient(1100px 620px at 12% -12%,var(--ax-brand-soft),transparent 62%),radial-gradient(900px 520px at 96% 4%,var(--ax-brand-soft2),transparent 60%)}
[dir=rtl] body{line-height:1.85}
img,svg,canvas,video{max-width:100%;display:block}
a{color:var(--ax-brand);text-decoration:none;transition:color .18s var(--ax-ease)}
a:hover{color:var(--ax-accent)}
h1,h2,h3,h4{margin:0 0 .5em;line-height:1.24;font-weight:800;letter-spacing:-.015em}
h1{font-size:clamp(2.1rem,5.2vw,4rem)}
h2{font-size:clamp(1.6rem,3.4vw,2.6rem)}
h3{font-size:clamp(1.15rem,2vw,1.5rem)}
p{margin:0 0 1em}
small{font-size:.82em;color:var(--ax-dim)}
code,pre,kbd{font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:.92em}
code{background:var(--ax-ink-soft);padding:.15em .42em;border-radius:6px}
pre{background:var(--ax-bg2);border:1px solid var(--ax-line);border-radius:var(--ax-r-sm);padding:14px 16px;overflow:auto;direction:ltr;text-align:left}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2.5px solid var(--ax-brand);outline-offset:2px;border-radius:4px}
::selection{background:var(--ax-brand);color:var(--ax-brand-ink)}
.ax-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.ax-skip{position:absolute;inset-inline-start:-9999px;top:8px;z-index:99;background:var(--ax-brand);color:var(--ax-brand-ink);padding:10px 16px;border-radius:10px}
.ax-skip:focus{inset-inline-start:8px}

/* ---------- layout ---------- */
.ax-wrap{width:min(1240px,100% - 32px);margin-inline:auto}
.ax-narrow{width:min(760px,100% - 32px);margin-inline:auto}
.ax-section{padding:clamp(46px,7vw,104px) 0;position:relative}
.ax-section+.ax-section{border-top:1px solid var(--ax-line)}
.ax-grid{display:grid;gap:var(--ax-gap)}
.ax-cols-2{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.ax-cols-3{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.ax-cols-4{grid-template-columns:repeat(auto-fit,minmax(196px,1fr))}
.ax-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.ax-row-between{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.ax-stack{display:flex;flex-direction:column;gap:12px}
.ax-spacer{flex:1}
.ax-muted{color:var(--ax-dim)}
.ax-center{text-align:center}
.ax-hide{display:none!important}
.ax-mono{font-family:ui-monospace,Consolas,monospace}

/* ---------- header / nav ---------- */
.ax-header{position:sticky;top:0;z-index:50;backdrop-filter:blur(16px) saturate(140%);background:color-mix(in srgb,var(--ax-bg) 76%,transparent);border-bottom:1px solid var(--ax-line)}
.ax-header-in{display:flex;align-items:center;gap:14px;padding:12px 0}
.ax-logo{display:flex;align-items:center;gap:10px;font-weight:900;font-size:1.08rem;color:var(--ax-text)}
.ax-logo-mark{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:linear-gradient(135deg,var(--ax-brand),var(--ax-brand2));color:var(--ax-brand-ink);font-size:19px;box-shadow:var(--ax-glow)}
.ax-nav{display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-inline-start:auto}
.ax-nav a,.ax-nav button{background:none;border:0;cursor:pointer;padding:9px 13px;border-radius:10px;color:var(--ax-dim);font-weight:600;font-size:.94rem}
.ax-nav a:hover,.ax-nav button:hover{background:var(--ax-ink-soft);color:var(--ax-text)}
.ax-nav a[aria-current=page],.ax-nav .is-on{background:var(--ax-brand-soft);color:var(--ax-brand)}
.ax-burger{display:none}
@media (max-width:860px){
  .ax-nav{position:fixed;inset:64px 12px auto 12px;flex-direction:column;align-items:stretch;background:var(--ax-card);border:1px solid var(--ax-line);border-radius:var(--ax-r);padding:10px;box-shadow:var(--ax-shadow-lg);display:none}
  .ax-nav.is-open{display:flex}
  .ax-nav a,.ax-nav button{text-align:start;padding:12px}
  .ax-burger{display:grid;place-items:center;margin-inline-start:auto;width:42px;height:42px;border-radius:12px;background:var(--ax-ink-soft);border:1px solid var(--ax-line)}
}

/* ---------- surfaces ---------- */
.ax-card{background:var(--ax-card);border:1px solid var(--ax-line);border-radius:var(--ax-r);padding:var(--ax-pad);box-shadow:var(--ax-shadow)}
.ax-glass{background:var(--ax-glass);backdrop-filter:blur(18px) saturate(150%);border:1px solid var(--ax-line);border-radius:var(--ax-r);padding:var(--ax-pad);box-shadow:var(--ax-shadow)}
.ax-card-hover{transition:transform .28s var(--ax-ease),box-shadow .28s var(--ax-ease),border-color .28s var(--ax-ease)}
.ax-card-hover:hover{transform:translateY(-5px);border-color:color-mix(in srgb,var(--ax-brand) 45%,var(--ax-line));box-shadow:var(--ax-shadow-lg)}
.ax-gradient-border{position:relative;background:var(--ax-card);border-radius:var(--ax-r);padding:var(--ax-pad)}
.ax-gradient-border::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(135deg,var(--ax-brand),var(--ax-accent),var(--ax-brand2));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.ax-pill{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:var(--ax-brand-soft);color:var(--ax-brand);font-weight:700;font-size:.8rem;border:1px solid color-mix(in srgb,var(--ax-brand) 26%,transparent)}
.ax-badge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:.74rem;font-weight:700;background:var(--ax-ink-soft);border:1px solid var(--ax-line)}
.ax-badge-ok{background:color-mix(in srgb,var(--ax-ok) 16%,transparent);color:var(--ax-ok);border-color:transparent}
.ax-badge-warn{background:color-mix(in srgb,var(--ax-warn) 16%,transparent);color:var(--ax-warn);border-color:transparent}
.ax-badge-err{background:color-mix(in srgb,var(--ax-err) 16%,transparent);color:var(--ax-err);border-color:transparent}
.ax-divider{height:1px;background:var(--ax-line);border:0;margin:18px 0}

/* ---------- buttons ---------- */
.ax-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:12px 22px;border-radius:calc(var(--ax-r) - 4px);border:1px solid var(--ax-line);background:var(--ax-card);color:var(--ax-text);font-weight:700;cursor:pointer;position:relative;overflow:hidden;transition:transform .18s var(--ax-ease),box-shadow .22s var(--ax-ease),background .22s var(--ax-ease),filter .22s var(--ax-ease)}
.ax-btn:hover{transform:translateY(-2px);box-shadow:var(--ax-shadow)}
.ax-btn:active{transform:translateY(0) scale(.985)}
.ax-btn-primary{background:linear-gradient(135deg,var(--ax-brand),var(--ax-brand2));color:var(--ax-brand-ink);border-color:transparent;box-shadow:var(--ax-glow)}
.ax-btn-primary:hover{filter:brightness(1.07) saturate(1.05)}
.ax-btn-ghost{background:transparent}
.ax-btn-soft{background:var(--ax-brand-soft);color:var(--ax-brand);border-color:transparent}
.ax-btn-danger{background:linear-gradient(135deg,var(--ax-err),color-mix(in srgb,var(--ax-err) 60%,#000));color:#fff;border-color:transparent}
.ax-btn-sm{padding:8px 14px;font-size:.86rem}
.ax-btn-lg{padding:16px 30px;font-size:1.04rem}
.ax-btn[disabled]{opacity:.55;cursor:not-allowed;transform:none}
.ax-btn .ax-ripple{position:absolute;border-radius:50%;transform:scale(0);background:color-mix(in srgb,var(--ax-brand) 42%,transparent);animation:ax-ripple .62s var(--ax-ease) forwards;pointer-events:none}
@keyframes ax-ripple{to{transform:scale(3.2);opacity:0}}
.ax-icon-btn{width:40px;height:40px;padding:0;border-radius:12px;display:grid;place-items:center}

/* ---------- metrics ---------- */
.ax-kpis{display:grid;gap:var(--ax-gap);grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.ax-kpi{background:var(--ax-card);border:1px solid var(--ax-line);border-radius:var(--ax-r);padding:18px;position:relative;overflow:hidden}
.ax-kpi::after{content:"";position:absolute;inset-inline-end:-30px;top:-30px;width:110px;height:110px;border-radius:50%;background:var(--ax-brand-soft)}
.ax-kpi .ax-kpi-label{color:var(--ax-dim);font-size:.82rem;font-weight:700}
.ax-kpi .ax-kpi-value{font-size:clamp(1.5rem,3vw,2.1rem);font-weight:900;letter-spacing:-.02em;position:relative}
.ax-kpi .ax-kpi-foot{font-size:.78rem;color:var(--ax-dim);position:relative}
.ax-trend-up{color:var(--ax-ok)}.ax-trend-down{color:var(--ax-err)}

/* ---------- tables ---------- */
.ax-table-wrap{overflow:auto;border:1px solid var(--ax-line);border-radius:var(--ax-r);background:var(--ax-card)}
table.ax-table{width:100%;border-collapse:collapse;min-width:560px}
.ax-table th,.ax-table td{padding:12px 14px;text-align:start;border-bottom:1px solid var(--ax-line);font-size:.92rem}
.ax-table thead th{position:sticky;top:0;background:var(--ax-bg2);color:var(--ax-dim);font-weight:800;font-size:.8rem;text-transform:none;z-index:1}
.ax-table tbody tr{transition:background .16s var(--ax-ease)}
.ax-table tbody tr:hover{background:var(--ax-ink-soft)}
.ax-table tbody tr.is-selected{background:var(--ax-brand-soft)}
.ax-table td.ax-num,.ax-table th.ax-num{font-variant-numeric:tabular-nums;text-align:end}
.ax-sort{cursor:pointer;user-select:none}
.ax-sort::after{content:"↕";opacity:.4;margin-inline-start:6px;font-size:.78em}
.ax-sort.is-asc::after{content:"↑";opacity:1;color:var(--ax-brand)}
.ax-sort.is-desc::after{content:"↓";opacity:1;color:var(--ax-brand)}
.ax-pager{display:flex;gap:6px;align-items:center;justify-content:center;padding:12px;flex-wrap:wrap}
.ax-pager button{min-width:38px;padding:7px 10px;border-radius:10px;border:1px solid var(--ax-line);background:var(--ax-card);cursor:pointer}
.ax-pager button.is-on{background:var(--ax-brand);color:var(--ax-brand-ink);border-color:transparent}

/* ---------- forms ---------- */
.ax-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.ax-label{font-size:.84rem;font-weight:700;color:var(--ax-dim)}
.ax-input,.ax-select,.ax-textarea{width:100%;padding:12px 14px;border-radius:calc(var(--ax-r) - 6px);border:1px solid var(--ax-line);background:var(--ax-bg2);color:var(--ax-text);transition:border-color .18s var(--ax-ease),box-shadow .18s var(--ax-ease)}
.ax-input:focus,.ax-select:focus,.ax-textarea:focus{outline:0;border-color:var(--ax-brand);box-shadow:0 0 0 3px var(--ax-brand-soft)}
.ax-input[aria-invalid=true]{border-color:var(--ax-err);box-shadow:0 0 0 3px color-mix(in srgb,var(--ax-err) 18%,transparent)}
.ax-error{color:var(--ax-err);font-size:.8rem;font-weight:600}
.ax-hint{color:var(--ax-dim);font-size:.8rem}
.ax-checkbox{display:flex;gap:9px;align-items:flex-start;font-size:.9rem;cursor:pointer}
.ax-switch{position:relative;display:inline-block;width:46px;height:26px;flex:0 0 auto}
.ax-switch input{position:absolute;opacity:0}
.ax-switch i{position:absolute;inset:0;border-radius:999px;background:var(--ax-line);transition:background .2s var(--ax-ease)}
.ax-switch i::after{content:"";position:absolute;top:3px;inset-inline-start:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .24s var(--ax-ease-bounce)}
.ax-switch input:checked + i{background:var(--ax-brand)}
.ax-switch input:checked + i::after{transform:translateX(20px)}
[dir=rtl] .ax-switch input:checked + i::after{transform:translateX(-20px)}
.ax-drop{border:2px dashed var(--ax-line);border-radius:var(--ax-r);padding:26px;text-align:center;color:var(--ax-dim);cursor:pointer;transition:border-color .2s var(--ax-ease),background .2s var(--ax-ease)}
.ax-drop.is-over{border-color:var(--ax-brand);background:var(--ax-brand-soft);color:var(--ax-brand)}
.ax-steps{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.ax-step{display:flex;gap:8px;align-items:center;padding:8px 14px;border-radius:999px;border:1px solid var(--ax-line);color:var(--ax-dim);font-size:.86rem;font-weight:700}
.ax-step.is-on{border-color:var(--ax-brand);color:var(--ax-brand);background:var(--ax-brand-soft)}
.ax-step.is-done{border-color:var(--ax-ok);color:var(--ax-ok)}

/* ---------- chips / tags / toast ---------- */
.ax-chips{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ax-chip{padding:6px 13px;border-radius:999px;background:var(--ax-ink-soft);border:1px solid var(--ax-line);font-size:.82rem;font-weight:600}
.ax-chip-btn{cursor:pointer;transition:all .18s var(--ax-ease)}
.ax-chip-btn:hover{border-color:var(--ax-brand);color:var(--ax-brand)}
.ax-chip.is-on{background:var(--ax-brand);color:var(--ax-brand-ink);border-color:transparent}
.ax-toasts{position:fixed;inset-block-end:18px;inset-inline-start:18px;z-index:120;display:flex;flex-direction:column;gap:10px;max-width:min(360px,90vw)}
.ax-toast{background:var(--ax-card);border:1px solid var(--ax-line);border-inline-start:4px solid var(--ax-brand);border-radius:12px;padding:12px 16px;box-shadow:var(--ax-shadow-lg);animation:ax-slide-in .32s var(--ax-ease-bounce)}
.ax-toast-ok{border-inline-start-color:var(--ax-ok)}
.ax-toast-warn{border-inline-start-color:var(--ax-warn)}
.ax-toast-err{border-inline-start-color:var(--ax-err)}
@keyframes ax-slide-in{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}

/* ---------- modal / drawer ---------- */
.ax-overlay{position:fixed;inset:0;background:rgba(3,6,14,.62);backdrop-filter:blur(6px);z-index:110;display:grid;place-items:center;padding:18px;animation:ax-fade .22s var(--ax-ease)}
.ax-modal{background:var(--ax-card);border:1px solid var(--ax-line);border-radius:var(--ax-r-lg);max-width:min(620px,96vw);width:100%;max-height:88vh;overflow:auto;box-shadow:var(--ax-shadow-lg);animation:ax-pop .3s var(--ax-ease-bounce)}
.ax-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid var(--ax-line);position:sticky;top:0;background:var(--ax-card);z-index:1}
.ax-modal-body{padding:20px}
.ax-modal-foot{padding:16px 20px;border-top:1px solid var(--ax-line);display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
@keyframes ax-fade{from{opacity:0}to{opacity:1}}
@keyframes ax-pop{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}

/* ---------- charts ---------- */
.ax-chart{background:var(--ax-card);border:1px solid var(--ax-line);border-radius:var(--ax-r);padding:18px}
.ax-chart-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.ax-chart-title{font-weight:800;font-size:1rem}
.ax-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:.8rem;color:var(--ax-dim)}
.ax-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-inline-end:6px}
.ax-tip{position:fixed;z-index:200;background:var(--ax-card);border:1px solid var(--ax-line);border-radius:10px;padding:8px 12px;font-size:.82rem;box-shadow:var(--ax-shadow-lg);pointer-events:none}
.ax-bars{display:flex;flex-direction:column;gap:10px}
.ax-bar-row{display:grid;grid-template-columns:110px 1fr 74px;gap:10px;align-items:center;font-size:.86rem}
.ax-bar{height:12px;background:var(--ax-ink-soft);border-radius:999px;overflow:hidden}
.ax-bar>span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--ax-brand),var(--ax-accent));transition:width .7s var(--ax-ease)}
.ax-progress{height:9px;background:var(--ax-ink-soft);border-radius:999px;overflow:hidden}
.ax-progress>span{display:block;height:100%;background:linear-gradient(90deg,var(--ax-brand),var(--ax-accent));transition:width .5s var(--ax-ease)}

/* ---------- media ---------- */
.ax-gallery{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.ax-shot{position:relative;border-radius:var(--ax-r-sm);overflow:hidden;border:1px solid var(--ax-line);aspect-ratio:4/3;cursor:pointer;background:var(--ax-bg2)}
.ax-shot img{width:100%;height:100%;object-fit:cover;transition:transform .5s var(--ax-ease)}
.ax-shot:hover img{transform:scale(1.07)}
.ax-lightbox{position:fixed;inset:0;background:rgba(2,4,10,.92);z-index:130;display:grid;place-items:center;padding:20px}
.ax-lightbox img{max-height:86vh;max-width:92vw;border-radius:12px}

/* ---------- kanban ---------- */
.ax-kanban{display:flex;gap:14px;overflow-x:auto;padding-bottom:8px;align-items:flex-start}
.ax-lane{background:var(--ax-bg2);border:1px solid var(--ax-line);border-radius:var(--ax-r);padding:12px;min-width:268px;flex:1}
.ax-lane.is-over{border-color:var(--ax-brand);background:var(--ax-brand-soft)}
.ax-lane-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:800;font-size:.9rem;margin-bottom:10px}
.ax-cardtask{background:var(--ax-card);border:1px solid var(--ax-line);border-radius:10px;padding:11px;margin-bottom:9px;cursor:grab;box-shadow:var(--ax-shadow)}
.ax-cardtask:active{cursor:grabbing}
.ax-cardtask.is-dragging{opacity:.5;transform:rotate(1.6deg)}

/* ---------- calendar ---------- */
.ax-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.ax-cal-head{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px;color:var(--ax-dim);font-size:.8rem;font-weight:700;text-align:center}
.ax-day{min-height:96px;border:1px solid var(--ax-line);border-radius:10px;padding:6px;background:var(--ax-card);font-size:.78rem}
.ax-day.is-out{opacity:.4}
.ax-day.is-today{border-color:var(--ax-brand);box-shadow:0 0 0 3px var(--ax-brand-soft)}
.ax-day .ax-ev{display:block;margin-top:4px;padding:2px 6px;border-radius:6px;background:var(--ax-brand-soft);color:var(--ax-brand);font-size:.72rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ---------- chat ---------- */
.ax-chat{display:grid;grid-template-rows:1fr auto;height:min(74vh,660px);border:1px solid var(--ax-line);border-radius:var(--ax-r);overflow:hidden;background:var(--ax-card)}
.ax-chat-log{padding:16px;overflow:auto;display:flex;flex-direction:column;gap:12px}
.ax-msg{max-width:74%;padding:11px 15px;border-radius:16px;background:var(--ax-bg2);border:1px solid var(--ax-line);animation:ax-msg-in .3s var(--ax-ease)}
.ax-msg.is-me{align-self:flex-end;background:linear-gradient(135deg,var(--ax-brand),var(--ax-brand2));color:var(--ax-brand-ink);border-color:transparent}
.ax-msg-time{display:block;font-size:.7rem;opacity:.7;margin-top:4px}
.ax-typing{display:inline-flex;gap:4px;align-items:center}
.ax-typing i{width:7px;height:7px;border-radius:50%;background:var(--ax-brand);animation:ax-blink 1.1s infinite}
.ax-typing i:nth-child(2){animation-delay:.18s}.ax-typing i:nth-child(3){animation-delay:.36s}
@keyframes ax-msg-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes ax-blink{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}
.ax-composer{display:flex;gap:10px;padding:12px;border-top:1px solid var(--ax-line);background:var(--ax-bg2)}

/* ---------- game surfaces ---------- */
.ax-stage{position:relative;border-radius:var(--ax-r);overflow:hidden;border:1px solid var(--ax-line);background:#05070f;box-shadow:var(--ax-shadow-lg)}
.ax-stage canvas{width:100%;height:auto;touch-action:none;cursor:crosshair}
.ax-hud{position:absolute;inset-block-start:12px;inset-inline-start:12px;display:flex;gap:8px;flex-wrap:wrap;pointer-events:none}
.ax-hud .ax-chip{background:rgba(4,8,18,.66);backdrop-filter:blur(8px);border-color:rgba(255,255,255,.14);color:#fff}
.ax-game-keys{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px}

/* ---------- misc ---------- */
.ax-empty{padding:34px;text-align:center;color:var(--ax-dim);border:1px dashed var(--ax-line);border-radius:var(--ax-r)}
.ax-loading{display:inline-block;width:18px;height:18px;border:2.5px solid var(--ax-line);border-top-color:var(--ax-brand);border-radius:50%;animation:ax-spin .8s linear infinite}
@keyframes ax-spin{to{transform:rotate(360deg)}}
.ax-skeleton{background:linear-gradient(90deg,var(--ax-ink-soft),var(--ax-glass),var(--ax-ink-soft));background-size:200% 100%;animation:ax-shimmer 1.3s linear infinite;border-radius:8px;height:14px}
@keyframes ax-shimmer{to{background-position:-200% 0}}
.ax-quote{border-inline-start:3px solid var(--ax-brand);padding-inline-start:16px;color:var(--ax-dim);font-style:italic}
.ax-hero{position:relative;overflow:hidden;padding:clamp(52px,9vw,120px) 0}
.ax-hero::before{content:"";position:absolute;inset:-30% -10% auto -10%;height:70%;background:radial-gradient(closest-side,var(--ax-brand-soft),transparent);filter:blur(30px);pointer-events:none}
.ax-hero-grid{display:grid;gap:34px;grid-template-columns:1.15fr .85fr;align-items:center}
@media (max-width:900px){.ax-hero-grid{grid-template-columns:1fr}}
.ax-glass-card{background:var(--ax-glass-2);backdrop-filter:blur(20px);border:1px solid var(--ax-line);border-radius:var(--ax-r);padding:var(--ax-pad);box-shadow:var(--ax-shadow-lg)}
.ax-reveal{opacity:0;transform:translateY(22px);transition:opacity .6s var(--ax-ease),transform .6s var(--ax-ease)}
.ax-reveal.is-in{opacity:1;transform:none}
.ax-marquee{overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.ax-marquee-track{display:flex;gap:36px;width:max-content;animation:ax-scroll 26s linear infinite}
@keyframes ax-scroll{to{transform:translateX(-50%)}}
.ax-tilt{transition:transform .3s var(--ax-ease);transform-style:preserve-3d}
.ax-cursor-glow{position:fixed;width:340px;height:340px;border-radius:50%;pointer-events:none;background:radial-gradient(closest-side,var(--ax-brand-soft),transparent);z-index:1;transform:translate(-50%,-50%);transition:opacity .3s var(--ax-ease)}

/* ---------- invoice / print ---------- */
.ax-invoice{background:#fff;color:#111;max-width:760px;margin-inline:auto;padding:34px;border-radius:8px}
.ax-invoice h1{font-size:1.5rem}
.ax-inv-table{width:100%;border-collapse:collapse;margin-top:16px}
.ax-inv-table th,.ax-inv-table td{border-bottom:1px solid #e5e5e5;padding:9px;text-align:start}
.ax-inv-totals{margin-top:14px;text-align:end;font-weight:800}
@media print{
  .ax-header,.ax-nav,.ax-toasts,.ax-btn,.ax-composer,.ax-skip{display:none!important}
  body{background:#fff;color:#000}
  .ax-card,.ax-glass{box-shadow:none;border-color:#ddd}
  .ax-section{padding:12px 0;border:0}
  .ax-print-page{page-break-after:always}
}
`;

/** Stylesheet for the workspace/IDE that hosts a preview + file tree. */
export const STUDIO_CSS = String.raw`
.axstudio{display:grid;grid-template-columns:300px 1fr;gap:0;height:100%;min-height:0}
.axstudio-side{border-inline-end:1px solid var(--ax-line);display:flex;flex-direction:column;min-height:0;background:var(--ax-bg2)}
.axstudio-tree{overflow:auto;padding:10px}
.axstudio-node{display:flex;gap:8px;align-items:center;padding:6px 9px;border-radius:8px;cursor:pointer;font-size:.84rem;white-space:nowrap}
.axstudio-node:hover{background:var(--ax-ink-soft)}
.axstudio-node.is-on{background:var(--ax-brand-soft);color:var(--ax-brand)}
.axstudio-main{display:grid;grid-template-rows:auto 1fr;min-height:0}
.axstudio-tabs{display:flex;gap:4px;padding:8px;border-bottom:1px solid var(--ax-line);overflow:auto}
.axstudio-tab{padding:7px 13px;border-radius:9px;border:1px solid transparent;background:none;cursor:pointer;font-size:.84rem;color:var(--ax-dim)}
.axstudio-tab.is-on{background:var(--ax-card);border-color:var(--ax-line);color:var(--ax-text)}
.axstudio-body{display:grid;grid-template-columns:1fr 1fr;min-height:0}
.axstudio-code{overflow:auto;background:#0a0d16;color:#dbe4f5;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;line-height:1.65;padding:14px;direction:ltr;text-align:left;white-space:pre;min-height:0}
.axstudio-preview{border-inline-start:1px solid var(--ax-line);background:#fff;min-height:0;position:relative}
.axstudio-preview iframe{width:100%;height:100%;border:0;background:#fff}
`;

export function studioCss(): string {
  return STUDIO_CSS;
}
