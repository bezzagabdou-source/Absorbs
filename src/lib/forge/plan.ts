/**
 * NEXUS FORGE v19 — المهندس المعماري (plan parsing, normalisation, waves)
 * ---------------------------------------------------------------------------
 * The architect answers with JSON. Models are models: the parser tolerates fences,
 * prose around the object, trailing commas and missing fields, then `normalizePlan`
 * rebuilds a plan that is *safe to execute* — right module count, real line targets,
 * a shallow dependency graph, exactly one markup module and a boot order.
 *
 * If the architect fails completely, `defaultPlan()` still produces a buildable plan,
 * so a Forge build never dies at stage one.
 */
import type { ForgeKind, ForgeModule, ForgePlan, ForgeScale, ModuleKind } from "@/lib/forge/types";
import { FORGE_MAX_FILE_LINES, FORGE_MAX_MODULES, SCALE_META, countLines } from "@/lib/forge/types";

const KIND_RE = /\b(game|site|system|app|tool|landing)\b/i;

/** Guess the kind from the request when the architect did not say. */
export function guessKind(prompt: string): ForgeKind {
  const t = prompt.toLowerCase();
  if (/لعب|العاب|ألعاب|game|jeu|platformer|shooter|racer|puzzle|tower defense/.test(t)) return "game";
  if (/نظام|system|dashboard|لوحة (تحكم|قيادة)|crm|erp|مخزون|فواتير|قاعدة بيانات|database|إدار[ةه]|ادار[ةه]/.test(t)) return "system";
  if (/تطبيق|app\b|webapp|web app|منصة|platform/.test(t)) return "app";
  if (/صفحة هبوط|landing|capture/.test(t)) return "landing";
  if (/أداة|اداة|tool|محول|converter|حاسبة|calculator|مولد|generator/.test(t)) return "tool";
  return "site";
}

/** Guess the UI language of the finished project. */
export function guessLanguage(prompt: string): "ar" | "fr" | "en" {
  if (/[\u0600-\u06FF]/.test(prompt)) return "ar";
  if (/\b(je|tu|vous|le|la|les|pour|avec|site|page|créer|creer|faire)\b/i.test(prompt)) return "fr";
  return "en";
}

/** Guess the scale the user asked for (they almost always want the biggest). */
export function guessScale(prompt: string, fallback: ForgeScale = "big"): ForgeScale {
  const t = prompt.toLowerCase();
  if (/titan|تيتان|أسطوري|اسطوري|legendary|10\s*000|10000|ضخم جدا|ضخمه جدا|massive|huge|عملاق/.test(t)) return "titan";
  if (/صغير|small|بسيط|simple|خفيف|quick|سريع/.test(t) && !/ضخم|كبير|big|huge/.test(t)) return "standard";
  if (/ضخم|كبير|big|huge|large|كامل|complete|full|احترافي|احترافية|professional/.test(t)) return "titan";
  return fallback;
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

/** Pulls the first balanced JSON object out of a model answer. */
export function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  // unbalanced (the answer was cut): close it and let JSON5-ish repair try
  return text.slice(start) + "}".repeat(Math.max(0, depth));
}

type Raw = Record<string, unknown>;
const str = (v: unknown, max = 4000, d = ""): string => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : d);
const num = (v: unknown, d: number, min: number, max: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.min(max, Math.max(min, Math.round(n)));
};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const KIND_OK: ForgeKind[] = ["game", "site", "system", "app", "tool", "landing"];
const MODKIND_OK: ModuleKind[] = ["html", "css", "js", "json", "md"];

/** Turns any model answer into a strict ForgePlan, or null when hopeless. */
export function parseForgePlan(text: string, hint: { prompt: string; kind?: ForgeKind; scale?: ForgeScale }): ForgePlan | null {
  const raw0 = extractJson(text);
  if (!raw0) return null;
  let raw: Raw;
  try {
    raw = JSON.parse(raw0) as Raw;
  } catch {
    try {
      // tolerate trailing commas and smart quotes
      raw = JSON.parse(raw0.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"')) as Raw;
    } catch {
      return null;
    }
  }
  const scale = hint.scale ?? "big";
  const kindRaw = str(raw.kind, 20).toLowerCase();
  const kind = (KIND_OK.includes(kindRaw as ForgeKind) ? kindRaw : hint.kind ?? guessKind(hint.prompt)) as ForgeKind;

  const d = (raw.design ?? {}) as Raw;
  const pal = (d.palette ?? {}) as Raw;
  const hex = (v: unknown, fb: string) => {
    const s = str(v, 24);
    return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s) ? s : fb;
  };

  const mods = arr(raw.modules)
    .map((m, i) => {
      const o = (m ?? {}) as Raw;
      const pathRaw = str(o.path, 120) || str(o.id, 60) || `module-${i + 1}.js`;
      const path = pathRaw.replace(/\\/g, "/").replace(/^\/+/, "").slice(0, 120);
      const ext = (path.split(".").pop() ?? "js").toLowerCase();
      const kind2: ModuleKind = MODKIND_OK.includes(ext as ModuleKind) ? (ext as ModuleKind) : ext === "htm" ? "html" : "js";
      const id = (str(o.id, 60) || path.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "")).slice(0, 60).toLowerCase();
      return {
        id: id || `m${i + 1}`,
        path,
        kind: kind2,
        title: str(o.title, 120, path),
        spec: str(o.spec, 6000),
        lines: num(o.lines, 400, 40, FORGE_MAX_FILE_LINES),
        needs: arr(o.needs).map((n) => str(n, 60).toLowerCase()).filter(Boolean).slice(0, 8),
        wave: 0,
      } satisfies ForgeModule;
    })
    .filter((m) => m.spec.length > 12 || m.title.length > 2);

  if (!mods.length) return null;

  const plan: ForgePlan = {
    title: str(raw.title, 120, hint.prompt.slice(0, 60) || "مشروع Nexus"),
    kind,
    language: (["ar", "fr", "en"].includes(str(raw.language, 4)) ? str(raw.language, 4) : guessLanguage(hint.prompt)) as ForgePlan["language"],
    summary: str(raw.summary, 1200),
    design: {
      palette: {
        bg: hex(pal.bg, "#100f14"),
        surface: hex(pal.surface, "#1a1922"),
        text: hex(pal.text, "#f4f3f7"),
        muted: hex(pal.muted, "#a5a2b3"),
        accent: hex(pal.accent, "#d97757"),
        accent2: hex(pal.accent2, "#f5c451"),
      },
      typography: str(d.typography, 600),
      motion: str(d.motion, 600),
      layout: str(d.layout, 600),
      notes: str(d.notes, 900),
    },
    contract: str(raw.contract, 12_000),
    target: {
      lines: num((raw.target as Raw)?.lines, SCALE_META[scale].total, 400, 60_000),
      modules: num((raw.target as Raw)?.modules, mods.length, 1, FORGE_MAX_MODULES),
      kb: num((raw.target as Raw)?.kb, Math.round(SCALE_META[scale].total / 32), 5, 4_000),
    },
    modules: mods,
    shell: str(raw.shell, 4000),
  };
  return normalizePlan(plan, scale);
}

/* ------------------------------------------------------------------ *
 * Normalisation — make any plan executable
 * ------------------------------------------------------------------ */

/** Topological waves from `needs` (cycles are broken by ignoring the back edge). */
export function assignWaves(mods: ForgeModule[]): ForgeModule[] {
  const byId = new Map(mods.map((m) => [m.id, m]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const walk = (id: string): number => {
    if (depth.has(id)) return depth.get(id) as number;
    if (visiting.has(id)) return 0; // cycle → treat as same wave
    visiting.add(id);
    const m = byId.get(id);
    let d = 0;
    for (const n of m?.needs ?? []) {
      if (!byId.has(n) || n === id) continue;
      d = Math.max(d, walk(n) + 1);
    }
    visiting.delete(id);
    depth.set(id, Math.min(d, 3));
    return depth.get(id) as number;
  };

  for (const m of mods) {
    m.needs = m.needs.filter((n) => byId.has(n) && n !== m.id);
    m.wave = walk(m.id);
  }
  return mods;
}

export function normalizePlan(plan: ForgePlan, scale: ForgeScale): ForgePlan {
  const meta = SCALE_META[scale];
  const seen = new Set<string>();
  let mods = plan.modules.filter((m) => {
    const key = m.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // exactly one markup module
  const htmlIdx = mods.findIndex((m) => m.kind === "html");
  if (htmlIdx < 0) {
    mods.unshift({
      id: "shell",
      path: "index.html",
      kind: "html",
      title: "هيكل الصفحة",
      spec: plan.shell || "The complete markup of the project: head (meta, title, OG), all screens/sections in order, every element the other modules look up by id.",
      lines: Math.round(meta.lines[1] * 0.7),
      needs: [],
      wave: 0,
    });
  } else if (mods[htmlIdx].path !== "index.html") {
    mods[htmlIdx] = { ...mods[htmlIdx], path: "index.html" };
  }

  // at least one stylesheet
  if (!mods.some((m) => m.kind === "css")) {
    mods.splice(1, 0, {
      id: "styles",
      path: "css/styles.css",
      kind: "css",
      title: "نظام التصميم",
      spec: `The full design system: :root tokens from the palette, reset, layout, every component used by the markup, states (hover/active/focus/disabled), empty/loading/error states, and the responsive breakpoints down to 360px. Design: ${plan.design.typography} ${plan.design.motion} ${plan.design.layout}`.slice(0, 6000),
      lines: meta.lines[1],
      needs: [],
      wave: 0,
    });
  }

  // clamp module count and line targets to the scale
  if (mods.length > meta.modules[1] + 4) mods = mods.slice(0, meta.modules[1] + 4);
  mods = mods.map((m) => ({
    ...m,
    lines: Math.min(FORGE_MAX_FILE_LINES, Math.max(meta.lines[0], m.lines < meta.lines[0] ? meta.lines[0] : m.lines)),
    needs: m.needs.slice(0, 4),
  }));

  mods = padModules(mods, meta, plan);
  mods = assignWaves(mods);

  const total = mods.reduce((s, m) => s + m.lines, 0);
  // scale up proportionally when the architect under-planned
  if (total < meta.total * 0.8) {
    const k = (meta.total * 0.92) / Math.max(1, total);
    mods = mods.map((m) => ({ ...m, lines: Math.min(FORGE_MAX_FILE_LINES, Math.round(m.lines * k)) }));
  }

  const lines = mods.reduce((s, m) => s + m.lines, 0);
  return {
    ...plan,
    modules: mods,
    target: { lines, modules: mods.length, kb: Math.max(plan.target.kb, Math.round(lines / 32)) },
    // a two-line contract cannot coordinate six engines: pad it with the real one
    contract: plan.contract.trim().length > 160 ? plan.contract.trim() : [plan.contract.trim(), defaultContract(plan, mods)].filter(Boolean).join("\n\n"),
  };
}

/**
 * A scale is a promise: if the architect planned too few modules the build would
 * come out small, so the Forge adds real, spec'd modules until the minimum is met.
 */
function padModules(mods: ForgeModule[], meta: (typeof SCALE_META)[ForgeScale], plan: ForgePlan): ForgeModule[] {
  const out = [...mods];
  const isGame = plan.kind === "game";
  const isSystem = plan.kind === "system";
  const hasCore = out.some((m) => m.id === "core");
  const dep = hasCore ? ["core"] : [];
  const wave = dep.length ? 2 : 1;

  const RECIPES: { id: string; path: string; kind: ModuleKind; title: string; spec: string }[] = [
    {
      id: "content-extra",
      path: "js/content-extra.js",
      kind: "js",
      title: "محتوى إضافي كامل",
      spec: isGame
        ? "More real game content: 10 extra levels with distinct layouts and difficulty curves, 6 extra enemy variants with their own AI and stats, 12 shop items, 15 achievements, and the localisation strings for every new label."
        : isSystem
          ? "More real records and metadata: 200 extra seeded rows across the stores, 8 saved filter presets, 6 report templates, 12 field-validation rules and the labels for every one of them."
          : "More real content: 8 extra feature blocks with copy and SVG icons, 6 extra testimonials, 8 extra FAQ entries, 6 gallery items described as CSS/SVG art, and 4 extra footer/link sections — all in the project language.",
    },
    {
      id: "systems-extra",
      path: "js/systems-extra.js",
      kind: "js",
      title: "أنظمة إضافية",
      spec: isGame
        ? "Extra game systems: combo and multiplier tracking, a quest/objective tracker, unlock progression with persistence, a procedural daily challenge from a seeded PRNG, and a replay/ghost of the best run."
        : isSystem
          ? "Extra system features: notifications centre, activity timeline, bulk actions with confirmation, saved views, an offline queue that syncs when back online, and export scheduling."
          : "Extra app features: a Ctrl/⌘+K command palette, keyboard shortcuts map, recently-used list, favourites, share/copy-link, and print-friendly output.",
    },
    {
      id: "ui-extra",
      path: "js/ui-extra.js",
      kind: "js",
      title: "شاشات وواجهات إضافية",
      spec: isGame
        ? "Extra screens: settings (sound/music/controls/quality/language/difficulty), level-select map, achievements gallery, shop with purchase flow, tutorial overlay, and the results screen with stars, stats and personal bests."
        : "Extra views: settings centre (theme, density, language, data management), profile, help/onboarding tour, and a full-screen detail view for every list item — each rendered from state, none dead.",
    },
    {
      id: "css-extra",
      path: "css/components-extra.css",
      kind: "css",
      title: "مكوّنات إضافية",
      spec: "Extra components and their states: cards, chips, tabs, steppers, timelines, tables with sticky headers, drawers, bottom sheets, tooltips, badges, progress bars, skeletons, toasts, modals, empty states, and the responsive tuning from 1440px down to 320px (RTL-correct).",
    },
    {
      id: "fx",
      path: "js/fx.js",
      kind: "js",
      title: "المؤثرات والحركة",
      spec: isGame
        ? "The effects layer: particle system with pooling, screen shake, hit-flash, trails, glow, fog, parallax backgrounds, procedural sprite drawing helpers and a small tween/easing library used by every screen."
        : "The motion layer: IntersectionObserver reveals, count-up numbers, magnetic/hover-lift buttons, smooth anchor scrolling, page transitions, skeleton shimmer and reduced-motion fallbacks.",
    },
  ];

  let i = 0;
  while (out.length < meta.modules[0] && i < RECIPES.length) {
    const r = RECIPES[i++];
    if (out.some((m) => m.path === r.path)) continue;
    out.push({ id: r.id, path: r.path, kind: r.kind, title: r.title, spec: r.spec, lines: Math.round((meta.lines[0] + meta.lines[1]) / 2), needs: dep.slice(), wave });
  }
  return out;
}

/** A minimal but real contract when the architect left it empty. */
export function defaultContract(plan: ForgePlan, mods: ForgeModule[]): string {
  const ns = "NX";
  return [
    `GLOBAL NAMESPACE: window.${ns} = window.${ns} || {}; every module registers itself on it.`,
    `STATE: ${ns}.state = { screen:'boot', data:{}, ui:{}, settings:{ sound:true, lang:'${plan.language}' } }.`,
    `EVENTS: ${ns}.emit(name, payload) / ${ns}.on(name, fn) — a tiny event bus defined by the core module.`,
    `STORAGE KEYS: '${ns.toLowerCase()}:save:v1', '${ns.toLowerCase()}:settings:v1', '${ns.toLowerCase()}:stats:v1' — always inside try/catch.`,
    `CSS TOKENS: --bg ${plan.design.palette.bg}, --surface ${plan.design.palette.surface}, --text ${plan.design.palette.text}, --muted ${plan.design.palette.muted}, --accent ${plan.design.palette.accent}, --accent2 ${plan.design.palette.accent2}, --r-sm 10px, --r-md 16px, --r-lg 24px, --sp 8px grid, --t 180ms.`,
    `BOOT ORDER: ${mods.filter((m) => m.kind === "js").map((m) => m.id).join(" → ")} → ${ns}.boot() at the end of the last script.`,
    `RULES: classic scripts only, no ES modules, no TypeScript syntax, one design system, no name collisions.`,
  ].join("\n");
}

/** The architect's user message. */
export function planUserPrompt(o: { prompt: string; kind: ForgeKind; scale: ForgeScale; language: string; extra?: string }): string {
  const meta = SCALE_META[o.scale];
  return [
    `USER REQUEST (build exactly this, in ${o.language === "ar" ? "Arabic" : o.language === "fr" ? "French" : "English"}):`,
    o.prompt.slice(0, 8000),
    o.extra ? `\nEXTRA REQUIREMENTS:\n${o.extra.slice(0, 3000)}` : "",
    `\nPROJECT KIND: ${o.kind}`,
    `SCALE: ${o.scale} — plan ${meta.modules[0]}–${meta.modules[1]} modules totalling at least ${meta.total.toLocaleString("en")} lines.`,
    `Remember: ${meta.modules[0]}+ modules, one index.html with ALL markup, one or two css modules, and the rest as js/json modules that can be written in parallel.`,
    `Answer with the JSON object only.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ------------------------------------------------------------------ *
 * Fallback plan — the build never dies at stage one
 * ------------------------------------------------------------------ */

export function defaultPlan(prompt: string, kind: ForgeKind, scale: ForgeScale, language: "ar" | "fr" | "en"): ForgePlan {
  const meta = SCALE_META[scale];
  const title = prompt.trim().split("\n")[0].slice(0, 90) || "مشروع Nexus";
  const isGame = kind === "game";
  const isSystem = kind === "system";

  const mods: ForgeModule[] = [
    {
      id: "shell",
      path: "index.html",
      kind: "html",
      title: "الهيكل الكامل",
      spec: isGame
        ? "ALL markup: canvas + HUD, main menu, level select, pause overlay, settings panel, game-over/results screen with stats and stars, shop, achievements toast container, tutorial overlay, loading screen with progress and tips. Every element has a stable id listed in the contract."
        : isSystem
          ? "ALL markup: login screen, app shell (sidebar + topbar), dashboard with KPI cards and chart canvases, every CRUD view, filters/search bar, pagination, detail drawer, modal + toast containers, settings, report view, empty/loading/error states."
          : "ALL markup: sticky nav + mobile menu, hero, proof strip, features, how-it-works, gallery, pricing, testimonials, stats, FAQ accordion, contact form with validation, final CTA, footer with all links, toast container.",
      lines: Math.round(meta.lines[1] * 0.85),
      needs: [],
      wave: 0,
    },
    {
      id: "styles",
      path: "css/styles.css",
      kind: "css",
      title: "نظام التصميم",
      spec: "The complete design system: :root tokens, reset, layout primitives, every component used by index.html with all states, dark layered surfaces, soft shadows, fluid type scale, 8px spacing grid, micro-interactions (150–250ms), scroll-reveal helpers, and responsive rules down to 360px with RTL support.",
      lines: meta.lines[1],
      needs: [],
      wave: 0,
    },
    {
      id: "core",
      path: "js/core.js",
      kind: "js",
      title: "النواة والحالة",
      spec: "Core runtime: the NX namespace, event bus (emit/on/off), state container with subscribe, versioned storage layer in try/catch with in-memory fallback, seeded PRNG, utils (clamp, lerp, rand, uid, formatNumber, formatDate, debounce, throttle), the screen/router state machine, toast + modal helpers, i18n dictionary and t() for the project language.",
      lines: meta.lines[1],
      needs: [],
      wave: 0,
    },
    {
      id: "data",
      path: "js/data.js",
      kind: "js",
      title: "البيانات والمحتوى",
      spec: isGame
        ? "All game data: 15+ level definitions (layout, waves, difficulty curve, rewards), 8+ enemy types with stats and AI parameters, 3 boss definitions with phases, weapons/abilities/upgrade trees with costs and effects, 20+ achievements, shop items with prices, sound parameter tables, and the daily-seed generator."
        : isSystem
          ? "The seeded dataset: 300+ records for the main entity plus related entities (users, categories, transactions), generated deterministically from a seeded PRNG with believable names, ISO dates and integer-cent amounts, plus the schema/metadata, filter definitions, report templates and role permissions."
          : "All real content: 12+ features with icons and copy, 3 pricing tiers with full feature matrices, 8+ testimonials, 10+ FAQ entries, 8+ gallery items described as CSS/SVG art, stats, team/partners, and the contact-form field definitions with validation messages — all in the project language.",
      lines: Math.round(meta.lines[1] * 1.1),
      needs: ["core"],
      wave: 1,
    },
    {
      id: isGame ? "engine" : "features",
      path: isGame ? "js/engine.js" : "js/features.js",
      kind: "js",
      title: isGame ? "المحرك والأنظمة" : "المنطق الرئيسي",
      spec: isGame
        ? "The game engine: one rAF loop with clamped delta time, fixed physics step, object pooling, spatial hash collisions, entity system, particle system, camera with shake and easing, procedural sprite drawing, parallax layers, Web Audio SFX + music started after the first tap, input manager (touch joystick + buttons, keyboard, gamepad), save/load of runs and settings."
        : isSystem
          ? "The data layer + business logic: IndexedDB store with versioned migrations and in-memory fallback, promise CRUD (add/put/get/delete/query/count/paginate), search + multi-filter + sort, exact money maths in integer cents, referential integrity, undo stack, import/export JSON+CSV, printable report generation, activity log, role-based access."
          : "The primary workflow end to end: form validation with inline errors and success state persisted locally, cart/pricing maths or the tool's computation, filter/search/sort where relevant, hash router with view lazy-building, IntersectionObserver reveals, count-up stats, accordion FAQ, mobile menu, keyboard shortcuts and a Ctrl/⌘+K command palette.",
      lines: Math.round(meta.lines[1] * 1.25),
      needs: ["core", "data"],
      wave: 2,
    },
    {
      id: "ui",
      path: "js/ui.js",
      kind: "js",
      title: "الواجهات والشاشات",
      spec: isGame
        ? "All screens and HUD: menu with animated logo and background scene, level-select map, HUD chips and bars with easing, pause, settings (sound/music/controls/quality/language/difficulty), game-over/results with stars and stats, shop, achievements toast, tutorial overlay, loading screen with progress and tips — every screen built from the markup ids and wired to the engine."
        : "Every view rendered from state: dashboard KPIs and hand-drawn canvas/SVG charts, list views with virtualised rows above 500 items, detail drawer, modals, toasts, skeletons, empty/error states, settings, login screen, and the wiring of every button in index.html (no dead control).",
      lines: meta.lines[1],
      needs: ["core", "data"],
      wave: 2,
    },
    {
      id: "boot",
      path: "js/boot.js",
      kind: "js",
      title: "الإقلاع والربط النهائي",
      spec: "The boot sequence: guard every dependency, initialise storage and settings, seed data on first run, register global error handlers that paint a friendly in-page error card instead of a blank page, wire resize/visibility/online events, run the first-run tutorial, then NX.boot() and the first screen. Ends with a self-test that logs a one-line OK.",
      lines: Math.round(meta.lines[0] * 1.1),
      needs: ["core", "ui"],
      wave: 3,
    },
  ];

  if (scale === "titan") {
    mods.push(
      {
        id: "extras",
        path: "js/extras.js",
        kind: "js",
        title: "الأنظمة الإضافية",
        spec: isGame
          ? "Extra depth: procedural level generator, daily challenge with seed, combo/multiplier system, quest tracker, unlock progression, local leaderboard with rival ghosts, replay of the best run, accessibility options (colour-blind palette, reduced motion, one-hand mode), and a debug overlay."
          : "Extra depth: notifications centre, activity timeline, saved views, bulk actions, keyboard-first navigation, offline queue with sync on reconnect, data validation rules editor, chart drill-down, export scheduler, and a full settings centre with theme + density + language.",
        lines: meta.lines[1],
        needs: ["core"],
        wave: 2,
      },
      {
        id: "audio",
        path: "js/audio.js",
        kind: "js",
        title: "الصوت والموسيقى",
        spec: isGame
          ? "The whole audio engine: Web Audio context created on the first user gesture, synthesised SFX (jump, hit, coin, explosion, power-up, ui-click, boss-roar, victory, defeat) with envelopes and filters, a procedural music loop with layers that change with the game state, master/music/sfx volumes persisted, mute toggle, and a visualiser hook."
          : "The audio layer: Web Audio UI feedback (click, success, error, notify), optional ambient loop, volume + mute persisted in settings, and a spoken-summary helper using speechSynthesis when available — all guarded with try/catch.",
        lines: Math.round(meta.lines[0] * 1.15),
        needs: ["core"],
        wave: 2,
      },
      {
        id: "polish",
        path: "css/polish.css",
        kind: "css",
        title: "اللمسات والحركات",
        spec: "The polish layer: keyframe animations for every screen transition, shimmer skeletons, glow and gradient meshes, particle overlays, hover-lift and magnetic buttons, animated counters, print stylesheet, reduced-motion fallbacks, and the fine responsive tuning from 1440px down to 320px.",
        lines: Math.round(meta.lines[0] * 1.2),
        needs: ["styles"],
        wave: 1,
      }
    );
  }

  const plan: ForgePlan = {
    title,
    kind,
    language,
    summary: prompt.slice(0, 400),
    design: {
      palette: { bg: "#100f14", surface: "#1a1922", text: "#f4f3f7", muted: "#a5a2b3", accent: "#d97757", accent2: "#f5c451" },
      typography: "System stacks only; Arabic uses a readable sans with line-height 1.8; fluid type scale 13→40px.",
      motion: "150–250ms micro-interactions, screen transitions with opacity+translate, reduced-motion safe.",
      layout: "8px spacing grid, 14–24px radii, layered surfaces with soft warm shadows, max content width 1200px.",
      notes: language === "ar" ? "Full RTL: dir=\"rtl\", logical CSS properties, Arabic numerals where natural." : "",
    },
    contract: "",
    target: { lines: 0, modules: 0, kb: 0 },
    modules: mods,
    shell: "",
  };
  plan.contract = defaultContract(plan, mods);
  return normalizePlan(plan, scale);
}

/** Quick summary of a plan for logs / the UI. */
export function planSummary(plan: ForgePlan) {
  return {
    title: plan.title,
    kind: plan.kind,
    modules: plan.modules.length,
    lines: plan.modules.reduce((s, m) => s + m.lines, 0),
    waves: Math.max(0, ...plan.modules.map((m) => m.wave)) + 1,
    contractLines: countLines(plan.contract),
  };
}
