/**
 * NEXUS SMITH — the factory: config sanitising + one-file assembly.
 *
 * `buildSmithGame()` turns a validated config into a COMPLETE self-contained
 * HTML game (engine + blueprint + palette + strings inline). No CDN, no
 * network, no build step: open the file from a USB stick and it plays.
 *
 * The runtime itself lives in ./runtime.ts as a plain string so it is bundled
 * with the serverless function — no `fs` reads at runtime, nothing to trace.
 */

import {
  BLUEPRINT_MAP,
  DIFFICULTY_LABEL,
  isBlueprintId,
  type BlueprintId,
  type Difficulty,
  type SmithConfig,
  type SmithLang,
} from "@/lib/smith/blueprints";
import { SMITH_STRINGS, SMITH_THEMES, THEME_MAP } from "@/lib/smith/skins";
import { SMITH_RUNTIME } from "@/lib/smith/runtime";

const DIFF_SPEED: Record<Difficulty, number> = {
  easy: 0.85,
  normal: 1,
  hard: 1.16,
  insane: 1.32,
};

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function sanitizeConfig(input: unknown): SmithConfig {
  const src = (input ?? {}) as Record<string, unknown>;
  const blueprint: BlueprintId = isBlueprintId(src.blueprint) ? src.blueprint : "runner";
  const def = BLUEPRINT_MAP[blueprint];

  const themeId =
    typeof src.theme === "string" && THEME_MAP[src.theme] ? src.theme : "neon";
  const difficulty: Difficulty =
    typeof src.difficulty === "string" && DIFFICULTY_LABEL[src.difficulty as Difficulty]
      ? (src.difficulty as Difficulty)
      : "normal";
  const lang: SmithLang = src.lang === "fr" || src.lang === "en" ? src.lang : "ar";

  const d = def.defaults;
  const speed = clampN(num(src.speed, num(d.speed, 1)), 0.7, 1.6);
  const levels = Math.round(clampN(num(src.levels, num(d.levels, 10)), 3, 40));
  const size = Math.round(clampN(num(src.size, num(d.size, 4)), 3, 24));
  const target = Math.round(clampN(num(src.target, num(d.target, 2048)), 32, 8192));

  const heroName =
    (typeof src.heroName === "string" ? src.heroName : "")
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 18) || "Nexus";

  const cfg: SmithConfig = {
    blueprint,
    theme: themeId,
    difficulty,
    heroName,
    lang,
    seed: Math.round(clampN(num(src.seed, Math.floor(Math.random() * 1_000_000)), 1, 2 ** 31 - 1)),
    speed,
    levels,
    size,
    target,
    sound: bool(src.sound, true),
    powerups: bool(src.powerups, bool(d.powerups, true)),
    boss: bool(src.boss, bool(d.boss, true)),
    endless: bool(src.endless, bool(d.endless, false)),
    wrap: bool(src.wrap, bool(d.wrap, false)),
    walls: bool(src.walls, bool(d.walls, false)),
    portals: bool(src.portals, bool(d.portals, false)),
    timed: bool(src.timed, bool(d.timed, true)),
    mobile: bool(src.mobile, true),
    autofire: bool(src.autofire, bool(d.autofire, false)),
    slug: "",
    title: "",
    blueprintLabel: def.name[lang],
    difficultyLabel: DIFFICULTY_LABEL[difficulty][lang],
    speedMul: Number((speed * DIFF_SPEED[difficulty]).toFixed(3)),
  };

  cfg.title =
    (typeof src.title === "string" ? src.title : "")
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 42) || defaultTitle(cfg);

  return cfg;
}

/** "عدّاء النيون" / "Course Néon" — a real name instead of "Untitled game". */
export function defaultTitle(cfg: Pick<SmithConfig, "blueprint" | "theme" | "lang">): string {
  const def = BLUEPRINT_MAP[cfg.blueprint];
  const theme = THEME_MAP[cfg.theme] ?? THEME_MAP.neon;
  const noun = def.name[cfg.lang];
  const adj = theme.name[cfg.lang];
  return cfg.lang === "ar" ? `${noun} — ${adj}` : cfg.lang === "fr" ? `${noun} ${adj}` : `${adj} ${noun}`;
}

/** A short, URL-safe id. Deterministic for a given title so remixes stay tidy. */
export function makeSlug(title: string, seed: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  const rand = (seed >>> 0).toString(36).slice(0, 5);
  return `${base || "nexus-game"}-${rand}`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The runtime is plain JS — this only guards against a stray closing tag. */
function safeScript(js: string): string {
  return js.replace(/<\//g, "<\\/");
}

export interface SmithBuild {
  html: string;
  title: string;
  bytes: number;
  config: SmithConfig;
}

/** Assemble the game. Deterministic: same config → byte-identical file. */
export function buildSmithGame(input: unknown): SmithBuild {
  const cfg = sanitizeConfig(input);
  const theme = THEME_MAP[cfg.theme] ?? THEME_MAP.neon;
  const S = SMITH_STRINGS[cfg.lang];
  const rtl = cfg.lang === "ar";

  const runtimeCfg = {
    blueprint: cfg.blueprint,
    theme: cfg.theme,
    lang: cfg.lang,
    difficulty: cfg.difficulty,
    difficultyLabel: cfg.difficultyLabel,
    blueprintLabel: cfg.blueprintLabel,
    title: cfg.title,
    heroName: cfg.heroName,
    seed: cfg.seed,
    speedMul: cfg.speedMul,
    levels: cfg.levels,
    size: cfg.size,
    target: cfg.target,
    sound: cfg.sound,
    powerups: cfg.powerups,
    boss: cfg.boss,
    endless: cfg.endless,
    wrap: cfg.wrap,
    walls: cfg.walls,
    portals: cfg.portals,
    timed: cfg.timed,
    mobile: cfg.mobile,
    autofire: cfg.autofire,
    slug: cfg.slug,
  };

  const data = `window.__SMITH_CFG__=${JSON.stringify(runtimeCfg).replace(/</g, "\\u003c")};` +
    `window.__SMITH_THEMES__=${JSON.stringify(Object.fromEntries(SMITH_THEMES.map((t) => [t.id, t])))
      .replace(/</g, "\\u003c")};` +
    `window.__SMITH_STR__=${JSON.stringify({
      ar: SMITH_STRINGS.ar,
      fr: SMITH_STRINGS.fr,
      en: SMITH_STRINGS.en,
    }).replace(/</g, "\\u003c")};`;

  const html = `<!DOCTYPE html>
<html lang="${cfg.lang}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>${esc(cfg.title)}</title>
<meta name="description" content="${esc(cfg.blueprintLabel)} — ${esc(theme.name[cfg.lang])}">
<meta name="theme-color" content="${theme.sky1}">
<meta name="generator" content="Nexus SMITH v17">
<style>
:root{--bg:${theme.page};--ink:${theme.text};--dim:${theme.dim};--accent:${theme.accent};--gold:${theme.gold};--rose:${theme.rose};--aqua:${theme.aqua};--edge:${theme.edge};--panel:rgba(8,10,18,.62)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%;margin:0;padding:0;overflow:hidden;background:#05070f;color:var(--ink);
font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;overscroll-behavior:none;touch-action:none}
body{display:flex;align-items:center;justify-content:center;background:var(--bg)}
#nx-stage{position:relative;width:100%;height:100%;max-width:560px;max-height:100dvh;display:flex;
flex-direction:column;overflow:hidden;background:radial-gradient(120% 80% at 50% 0%,rgba(255,255,255,.06),transparent 60%)}
#nx-canvas{display:block;flex:1;width:100%;height:100%;touch-action:none;background:transparent}
#nx-hud{position:absolute;inset-inline:0;top:0;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;
padding:calc(env(safe-area-inset-top,0px) + 8px) 10px 6px;pointer-events:none;z-index:3}
.nx-chip{display:flex;align-items:center;gap:5px;background:var(--panel);border:1px solid var(--edge);
border-radius:999px;padding:4px 10px;font-size:11px;line-height:1;backdrop-filter:blur(8px)}
.nx-chip .nx-k{color:var(--dim);font-weight:600}
.nx-chip b{font-weight:800;color:var(--gold);font-variant-numeric:tabular-nums}
.nx-chip.hp{padding:4px 8px;min-width:86px}
.nx-bar{position:relative;flex:1;height:6px;border-radius:999px;background:rgba(255,255,255,.14);overflow:hidden;min-width:44px}
#nx-hp{position:absolute;inset-block:0;inset-inline-start:0;width:100%;border-radius:999px;
background:linear-gradient(90deg,var(--rose),var(--gold));transition:width .18s ease}
#nx-combo,#nx-power{opacity:0;transition:opacity .2s;color:var(--aqua)}
#nx-top{position:absolute;top:calc(env(safe-area-inset-top,0px) + 44px);inset-inline-end:8px;display:flex;
flex-direction:column;gap:6px;z-index:4}
#nx-top button,#nx-pad button{border:1px solid var(--edge);background:var(--panel);color:var(--ink);
border-radius:14px;font:700 13px/1 system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(8px);
transition:transform .12s ease,background .12s ease}
#nx-top button{width:38px;height:38px;display:grid;place-items:center;font-size:15px}
#nx-top button:active,#nx-pad button:active{transform:scale(.92);background:rgba(255,255,255,.16)}
#nx-pad{position:absolute;inset-inline:0;bottom:0;display:grid;grid-template-columns:repeat(5,1fr);
gap:8px;padding:10px 12px calc(env(safe-area-inset-bottom,0px) + 12px);z-index:4}
#nx-pad button{height:56px;min-height:44px;font-size:20px;opacity:.9}
#nx-pad button.on{background:var(--accent);color:#08090f;opacity:1}
#nx-b-act{grid-column:span 2;background:linear-gradient(160deg,var(--accent),var(--gold));color:#0a0b12;font-weight:900}
#nx-meta{position:absolute;bottom:calc(env(safe-area-inset-bottom,0px) + 78px);inset-inline:0;
display:flex;justify-content:center;gap:8px;font-size:10.5px;color:var(--dim);z-index:2;pointer-events:none;padding:0 12px;text-align:center}
#nx-boot{position:absolute;inset:0;display:grid;place-items:center;background:#05070f;z-index:9;
opacity:1;transition:opacity .5s ease;pointer-events:none}
#nx-boot.on{opacity:0}
#nx-boot .b-in{text-align:center}
#nx-boot .b-logo{font:900 22px/1.2 system-ui,sans-serif;background:linear-gradient(90deg,var(--accent),var(--gold));
-webkit-background-clip:text;background-clip:text;color:transparent}
#nx-boot .b-sub{margin-top:6px;font-size:11px;color:var(--dim);letter-spacing:.14em;text-transform:uppercase}
@media (min-width:600px){#nx-stage{border-radius:26px;height:min(96dvh,900px);margin:12px;
box-shadow:0 40px 120px -40px rgba(0,0,0,.9),0 0 0 1px var(--edge)}}
@media (max-height:520px){#nx-pad button{height:46px}#nx-meta{display:none}}
</style>
</head>
<body>
<div id="nx-stage">
  <canvas id="nx-canvas" aria-label="${esc(cfg.title)}"></canvas>

  <div id="nx-hud" role="status" aria-live="off">
    <span class="nx-chip"><span class="nx-k">${esc(S.score)}</span><b id="nx-score">0</b></span>
    <span class="nx-chip"><span class="nx-k">${esc(S.best)}</span><b id="nx-best">0</b></span>
    <span class="nx-chip"><span class="nx-k">${esc(S.level)}</span><b id="nx-level">1</b></span>
    <span class="nx-chip"><span class="nx-k">${esc(S.coins)}</span><b id="nx-coins">0</b></span>
    <span class="nx-chip"><span class="nx-k">${esc(S.lives)}</span><b id="nx-lives">3</b></span>
    <span class="nx-chip hp"><span class="nx-bar"><i id="nx-hp"></i></span></span>
    <span class="nx-chip" id="nx-combo"></span>
    <span class="nx-chip" id="nx-power"></span>
  </div>

  <div id="nx-top">
    <button id="nx-b-pause" type="button" aria-label="${esc(S.pause)}">⏸</button>
    <button id="nx-b-mute" type="button" aria-label="${esc(S.sound)}">🔊</button>
    <button id="nx-b-full" type="button" aria-label="fullscreen">⛶</button>
  </div>

  <div id="nx-meta">
    <span id="nx-title">${esc(cfg.title)}</span>
    <span>·</span>
    <span id="nx-blueprint">${esc(cfg.blueprintLabel)}</span>
    <span>·</span>
    <span id="nx-state">${esc(S.states.MENU)}</span>
  </div>

  <div id="nx-pad">
    <button id="nx-b-left" type="button" aria-label="left">◀</button>
    <button id="nx-b-up" type="button" aria-label="up">▲</button>
    <button id="nx-b-down" type="button" aria-label="down">▼</button>
    <button id="nx-b-right" type="button" aria-label="right">▶</button>
    <button id="nx-b-act" type="button" aria-label="action">${esc(S.play)}</button>
  </div>

  <div id="nx-boot"><div class="b-in">
    <div class="b-logo">NEXUS SMITH</div>
    <div class="b-sub">${esc(cfg.blueprintLabel)} · v17</div>
  </div></div>
</div>

<script>${data}</script>
<script>${safeScript(SMITH_RUNTIME)}</script>
</body>
</html>
`;

  const bytes = typeof Buffer !== "undefined" ? Buffer.byteLength(html, "utf8") : html.length;
  return { html, title: cfg.title, bytes, config: cfg };
}

/** Cheap structural QA — the same checks the server runs before saving a game. */
export function verifySmithHtml(html: string): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!html.startsWith("<!DOCTYPE html>")) issues.push("missing doctype");
  if (!/<\/html>\s*$/.test(html)) issues.push("html not closed");
  if (!html.includes("id=\"nx-canvas\"")) issues.push("canvas missing");
  if (!html.includes("NexusSmith")) issues.push("runtime missing");
  const scripts = (html.match(/<script/g) ?? []).length;
  const closes = (html.match(/<\/script>/g) ?? []).length;
  if (scripts !== closes) issues.push(`unbalanced <script> (${scripts}/${closes})`);
  if (html.includes("TODO") || html.includes("rest of the code")) issues.push("placeholder text found");
  const open = (html.match(/{/g) ?? []).length;
  const close = (html.match(/}/g) ?? []).length;
  if (Math.abs(open - close) > 2) issues.push(`brace delta ${open - close}`);
  return { ok: issues.length === 0, issues };
}
