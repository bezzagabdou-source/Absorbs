/**
 * Nexus AI v15 — GAME FORGE
 * =============================================================================
 * Turns "دير لي لعبة 3D ضخمة" into a multi-file, multi-hour build that does not
 * stop halfway and does not restart when the user leaves the conversation.
 *
 * Three jobs:
 *   1. plan   — derive a concrete file manifest from a vague Arabic request,
 *               so the model always knows what "done" means.
 *   2. drive  — emit the per-round directive ("you are on file 7 of 18") so a
 *               continuation never loses the thread and never re-writes file 1.
 *   3. resume — a serialisable checkpoint the client stores, so navigating away
 *               and coming back continues from the exact same file.
 *
 * Pure / isomorphic. No node imports.
 */

export type GameKind = "fps" | "racing" | "platformer3d" | "openworld" | "rpg" | "survival" | "puzzle3d" | "generic3d";

export interface GameFile {
  path: string;
  role: string;
  /** Minimum useful size; the runtime rejects a file far below this. */
  minBytes: number;
}

export interface GamePlan {
  kind: GameKind;
  title: string;
  files: GameFile[];
  /** Total target bytes for the whole project. */
  targetBytes: number;
  features: string[];
}

export interface ForgeCheckpoint {
  /** Stable id so a reload can find the build again. */
  id: string;
  plan: GamePlan;
  /** Index of the file currently being written. */
  cursor: number;
  /** Paths already finished. */
  done: string[];
  /** Bytes emitted so far. */
  bytes: number;
  startedAt: number;
  updatedAt: number;
  /** Original user request, so a resume can re-seed the model. */
  prompt: string;
  version: 1;
}

/* ---------------------------------------------------------------- detection */

const KIND_RULES: { kind: GameKind; re: RegExp }[] = [
  { kind: "fps", re: /\b(fps|shooter|shoot|gun|zombie|battle ?royale|counter|doom)\b|شوتر|اطلاق|رماية|اسلحة|زومبي/i },
  { kind: "racing", re: /\b(racing|race|car|drift|kart|speed|track|moto)\b|سباق|سيارة|سيارات|دراجة|سرعة/i },
  { kind: "platformer3d", re: /\b(platformer|jump|parkour|mario|runner)\b|منصات|قفز|باركور|جري/i },
  { kind: "openworld", re: /\b(open[- ]?world|sandbox|city|gta|explore|voxel|minecraft)\b|عالم مفتوح|مدينة|استكشاف|مفتوح/i },
  { kind: "rpg", re: /\b(rpg|quest|inventory|level ?up|skill ?tree|dungeon|loot)\b|ار بي جي|مغامرة|مهام|مستويات/i },
  { kind: "survival", re: /\b(survival|craft|hunger|base ?build|wave)\b|بقاء|نجاة|موجات/i },
  { kind: "puzzle3d", re: /\b(puzzle|maze|escape ?room|physics ?puzzle)\b|لغز|الغاز|متاهة/i },
];

export function detectGameKind(text: string): GameKind {
  for (const r of KIND_RULES) if (r.re.test(text)) return r.kind;
  return "generic3d";
}

/** Is this a "build me a big game" request at all? */
export function isGameRequest(text: string): boolean {
  const t = text || "";
  const wantsGame = /\b(game|games)\b|لعبة|العاب|لعبه/i.test(t);
  const wants3d = /\b(3d|three\.?js|webgl|ثلاثي)\b/i.test(t);
  return wantsGame && (wants3d || /\b(fps|rpg|racing|open[- ]?world|shooter)\b/i.test(t) || /ضخمة|كبيرة|احترافية/.test(t));
}

/* ---------------------------------------------------------------- planning */

const BASE_FILES: GameFile[] = [
  { path: "index.html", role: "shell, canvas, HUD markup, importmap, loading screen", minBytes: 3_000 },
  { path: "src/engine.js", role: "renderer, scene, camera, fixed-timestep loop, resize, post", minBytes: 7_000 },
  { path: "src/input.js", role: "keyboard, mouse, pointer-lock, gamepad, touch joystick → action map", minBytes: 5_000 },
  { path: "src/physics.js", role: "spatial hash broadphase, AABB/sphere narrowphase, gravity, ground snap", minBytes: 7_000 },
  { path: "src/world.js", role: "procedural level geometry, instancing, culling, spawn points", minBytes: 9_000 },
  { path: "src/entities.js", role: "entity table, player controller, pooling, lifecycle", minBytes: 9_000 },
  { path: "src/ai.js", role: "enemy state machines, steering, A* on the nav grid", minBytes: 7_000 },
  { path: "src/audio.js", role: "WebAudio graph, 3D panner, fully procedural SFX + music bed", minBytes: 5_000 },
  { path: "src/ui.js", role: "HUD, menus, pause, settings, minimap, damage feedback", minBytes: 7_000 },
  { path: "src/save.js", role: "versioned localStorage slots, migration, settings persistence", minBytes: 3_000 },
  { path: "src/main.js", role: "bootstrap, preload, app state machine, wiring", minBytes: 5_000 },
  { path: "README.md", role: "controls, architecture, perf budget, how to run", minBytes: 2_000 },
];

const KIND_EXTRA: Record<GameKind, GameFile[]> = {
  fps: [
    { path: "src/weapons.js", role: "weapon table, recoil, spread, reload, hitscan + projectile", minBytes: 7_000 },
    { path: "src/combat.js", role: "damage model, hitboxes, armour, killfeed, score", minBytes: 5_000 },
    { path: "src/spawn.js", role: "wave director, difficulty curve, enemy budget", minBytes: 4_000 },
  ],
  racing: [
    { path: "src/vehicle.js", role: "wheel raycast suspension, engine curve, gearbox, drift model", minBytes: 9_000 },
    { path: "src/track.js", role: "spline track, checkpoints, barriers, racing line", minBytes: 7_000 },
    { path: "src/opponents.js", role: "rubber-band AI drivers on the racing line", minBytes: 5_000 },
  ],
  platformer3d: [
    { path: "src/character.js", role: "coyote time, jump buffer, wall jump, ledge grab", minBytes: 7_000 },
    { path: "src/levels.js", role: "level definitions, moving platforms, hazards, checkpoints", minBytes: 7_000 },
  ],
  openworld: [
    { path: "src/terrain.js", role: "noise heightmap, chunked LOD streaming, biomes", minBytes: 9_000 },
    { path: "src/chunks.js", role: "chunk manager, load/unload budget, disposal", minBytes: 6_000 },
    { path: "src/props.js", role: "instanced vegetation, buildings, roads", minBytes: 6_000 },
    { path: "src/daynight.js", role: "sun cycle, sky shader, fog and light colour ramps", minBytes: 4_000 },
  ],
  rpg: [
    { path: "src/stats.js", role: "attributes, XP curve, levelling, status effects", minBytes: 5_000 },
    { path: "src/inventory.js", role: "slots, stacking, equip, loot tables", minBytes: 6_000 },
    { path: "src/quests.js", role: "quest graph, triggers, journal", minBytes: 5_000 },
    { path: "src/dialogue.js", role: "dialogue tree, typewriter, choices", minBytes: 4_000 },
  ],
  survival: [
    { path: "src/needs.js", role: "hunger, thirst, stamina, temperature", minBytes: 4_000 },
    { path: "src/crafting.js", role: "recipe graph, workbench, resource nodes", minBytes: 6_000 },
    { path: "src/waves.js", role: "night waves, escalating director", minBytes: 5_000 },
  ],
  puzzle3d: [
    { path: "src/puzzles.js", role: "puzzle definitions, solve validation, hint system", minBytes: 7_000 },
    { path: "src/interact.js", role: "pick up, carry, throw, pressure plates, portals", minBytes: 6_000 },
  ],
  generic3d: [
    { path: "src/gameplay.js", role: "core loop, objectives, scoring, progression", minBytes: 7_000 },
  ],
};

const KIND_TITLE: Record<GameKind, string> = {
  fps: "Nexus Strike",
  racing: "Nexus Velocity",
  platformer3d: "Nexus Leap",
  openworld: "Nexus Horizon",
  rpg: "Nexus Realms",
  survival: "Nexus Outlast",
  puzzle3d: "Nexus Enigma",
  generic3d: "Nexus Arena",
};

const KIND_FEATURES: Record<GameKind, string[]> = {
  fps: ["3 أسلحة بإحساس مختلف", "موجات أعداء متصاعدة", "ارتداد وانتشار واقعي", "نظام صحة ودروع", "لوحة نتائج"],
  racing: ["تعليق بالـraycast", "دريفت حقيقي", "3 حلبات", "خصوم بذكاء اصطناعي", "سباق ضد الوقت"],
  platformer3d: ["قفز مزدوج وjump buffer", "منصات متحركة", "نقاط حفظ", "جمع عملات", "عدّاد وقت"],
  openworld: ["تضاريس لا نهائية بالـchunks", "دورة ليل ونهار", "نباتات ومبانٍ instanced", "خريطة مصغّرة", "نقاط اهتمام"],
  rpg: ["شجرة مهارات", "حقيبة ومعدّات", "مهام متفرّعة", "حوارات", "نظام مستويات"],
  survival: ["جوع وعطش وطاقة", "تصنيع أدوات", "موجات ليلية", "بناء قاعدة", "دورة طقس"],
  puzzle3d: ["10 ألغاز متدرّجة", "فيزياء حمل ورمي", "ألواح ضغط", "نظام تلميحات", "غرف هروب"],
  generic3d: ["حلقة لعب كاملة", "نظام نقاط", "تصاعد صعوبة", "قوائم", "حفظ تلقائي"],
};

export function planGame(prompt: string): GamePlan {
  const kind = detectGameKind(prompt);
  const files = [...BASE_FILES];
  // insert the kind-specific files before README so the doc is always last
  const extra = KIND_EXTRA[kind];
  files.splice(files.length - 1, 0, ...extra);

  const targetBytes = files.reduce((n, f) => n + f.minBytes, 0) * 2;
  return {
    kind,
    title: KIND_TITLE[kind],
    files,
    targetBytes: Math.max(240_000, Math.min(3_000_000, targetBytes)),
    features: KIND_FEATURES[kind],
  };
}

/* ---------------------------------------------------------------- directives */

/** The contract the model must satisfy. Injected once at the start of a build. */
export function forgeSystemBlock(plan: GamePlan, prompt: string): string {
  const manifest = plan.files
    .map((f, i) => `  ${String(i + 1).padStart(2, "0")}. ${f.path}  — ${f.role}  (≥ ${Math.round(f.minBytes / 1000)} KB)`)
    .join("\n");

  return `

===== GAME FORGE — BINDING BUILD CONTRACT =====
You are building a complete, shippable 3D game. This is a MARATHON, not a reply.

PROJECT: ${plan.title}  (genre: ${plan.kind})
USER REQUEST: ${prompt.slice(0, 600)}

FILE MANIFEST — every one of these must exist, in this order:
${manifest}

REQUIRED FEATURES: ${plan.features.join(" · ")}

OUTPUT FORMAT — exactly this, nothing else between files:
\`\`\`path/to/file.js
<the complete file>
\`\`\`

HARD RULES
  1. ONE file per fenced block. The path goes on the fence info line.
  2. Never write "// ... rest of the code", "TODO", "implement later",
     "same as above", or an elided block. Every function has a real body.
  3. Never re-emit a file you already finished. Continue from the manifest.
  4. No CDN, no npm, no build step: the game runs from a plain file:// open.
     Three.js is loaded through the importmap you write in index.html, pinned
     to a version, with a local fallback note in the README.
  5. Everything procedural — geometry from primitives, textures from
     CanvasTexture/noise, audio from oscillators. Zero binary assets.
  6. Fixed timestep, capped delta, object pooling, dispose() on teardown.
  7. Touch controls AND keyboard/mouse. Both must work.
  8. When the last file is written, output the single line:
     NEXUS-FORGE-COMPLETE
     and nothing after it.
  9. index.html must import EVERY module in the manifest — a missing
     <script type="module"> or broken path = failed delivery.
 10. After writing each file, verify its exports match what index.html
     imports.
 11. Saving: src/save.js is part of the contract. It exposes save(slot, data) /
     load(slot) and uses window.NexusDB when it exists (it stores in the player's
     cloud database: NexusDB.save(slot, obj) / NexusDB.load(slot) both return a
     Promise), otherwise localStorage inside try/catch, otherwise memory. Never
     crash when storage is blocked and never await a save inside the frame loop.
 12. Module paths: every import is a relative path that matches a file of the
     manifest exactly ("./engine.js", "../src/state.js"), with the .js extension.
     No circular import may read an export at load time (only inside functions).
 13. index.html must contain exactly ONE entry: <script type="module" src="src/main.js">
     (plus the importmap for three.js if used) and a visible loading screen, so
     the first frame is never black.

DO NOT stop to ask whether to continue. DO NOT summarise what you are about to
do. DO NOT write a plan paragraph. Start with file 01 immediately.
===== END CONTRACT =====
`;
}

/** Per-round nudge so a continuation knows exactly where it is. */
export function forgeContinueBlock(cp: ForgeCheckpoint): string {
  const next = cp.plan.files[cp.cursor];
  const remaining = cp.plan.files.slice(cp.cursor).map((f) => f.path);
  const pct = Math.round((cp.done.length / cp.plan.files.length) * 100);

  return `

===== FORGE RESUME =====
Project: ${cp.plan.title} (${cp.plan.kind}) — ${pct}% complete, ${cp.bytes.toLocaleString("en-US")} bytes written.
ALREADY FINISHED (never rewrite these): ${cp.done.join(", ") || "(none)"}
WRITE NEXT: ${next ? `${next.path} — ${next.role} (≥ ${Math.round(next.minBytes / 1000)} KB)` : "(manifest done)"}
STILL REMAINING: ${remaining.join(", ") || "(none)"}

Continue the build. Do not greet, do not recap, do not apologise for the break.
Open directly with the fenced block for the next file.
===== END RESUME =====
`;
}

/* ---------------------------------------------------------------- checkpoint */

const FENCE = /```([^\n`]*)\n([\s\S]*?)```/g;

/** Scans emitted text and advances the checkpoint. Safe on partial output. */
export function advanceCheckpoint(cp: ForgeCheckpoint, emitted: string): ForgeCheckpoint {
  const done = new Set(cp.done);
  let bytes = cp.bytes;

  FENCE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE.exec(emitted))) {
    const info = (m[1] || "").trim();
    const body = m[2] || "";
    // the fence info line carries the path in our contract
    const path = info.replace(/^[a-z]+:/i, "").trim();
    const file = cp.plan.files.find((f) => f.path === path || f.path.endsWith("/" + path));
    if (file && body.length >= Math.min(400, file.minBytes * 0.25)) {
      done.add(file.path);
      bytes += body.length;
    }
  }

  const cursor = cp.plan.files.findIndex((f) => !done.has(f.path));
  return {
    ...cp,
    done: cp.plan.files.filter((f) => done.has(f.path)).map((f) => f.path),
    cursor: cursor === -1 ? cp.plan.files.length : cursor,
    bytes,
    updatedAt: Date.now(),
  };
}

export function newCheckpoint(prompt: string, id?: string): ForgeCheckpoint {
  const plan = planGame(prompt);
  return {
    id: id ?? `forge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    plan,
    cursor: 0,
    done: [],
    bytes: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    prompt,
    version: 1,
  };
}

export function isComplete(cp: ForgeCheckpoint): boolean {
  return cp.cursor >= cp.plan.files.length;
}

export function forgeProgress(cp: ForgeCheckpoint): { pct: number; label: string; eta: string } {
  const pct = Math.round((cp.done.length / Math.max(1, cp.plan.files.length)) * 100);
  const next = cp.plan.files[cp.cursor];
  const elapsed = Math.max(1, (Date.now() - cp.startedAt) / 1000);
  const perFile = elapsed / Math.max(1, cp.done.length);
  const left = Math.max(0, cp.plan.files.length - cp.done.length) * perFile;
  const eta = cp.done.length < 1 ? "—" : left > 90 ? `${Math.round(left / 60)} دقيقة` : `${Math.round(left)} ثانية`;
  return {
    pct,
    label: next ? `يكتب ${next.path}` : "اكتمل",
    eta,
  };
}

/* ---------------------------------------------------------------- storage */

const KEY = "nexus_forge_v1";

/** Client-side persistence so leaving the chat does not restart the build. */
export function saveCheckpoint(cp: ForgeCheckpoint): void {
  if (typeof localStorage === "undefined") return;
  try {
    const all = loadAll();
    all[cp.id] = cp;
    // keep the 5 most recent
    const trimmed = Object.values(all)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);
    const out: Record<string, ForgeCheckpoint> = {};
    for (const c of trimmed) out[c.id] = c;
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    /* quota — a lost checkpoint is not worth throwing over */
  }
}

export function loadAll(): Record<string, ForgeCheckpoint> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, ForgeCheckpoint>;
  } catch {
    return {};
  }
}

/** The most recent build that is not finished — what a returning user resumes. */
export function pendingCheckpoint(maxAgeMs = 1000 * 60 * 60 * 24 * 3): ForgeCheckpoint | null {
  const all = Object.values(loadAll());
  const live = all
    .filter((c) => !isComplete(c) && Date.now() - c.updatedAt < maxAgeMs)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return live[0] ?? null;
}

export function clearCheckpoint(id: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const all = loadAll();
    delete all[id];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/* ═══════════════════════════════════════════════════════════════════
 *  PLAYABLE ASSEMBLY — In-Browser Execution for forged games (v19)
 * ═══════════════════════════════════════════════════════════════════
 *  Turns the forged file set into ONE self-contained, instrumented HTML
 *  document that runs instantly in a sandboxed iframe (no servers, no
 *  build step). The bridge reports console output + crashes to the host
 *  via window.postMessage ({__nexus_sandbox:1, …}) so the Studio can show
 *  a live console and auto-heal against a real error log.
 */

export interface PlayableFile {
  path: string;
  code: string;
}

/** Runtime guards every playable game gets: error capture, canvas sizing, input focus. */
export const GAME_RUNTIME_BRIDGE = `<script data-nexus-game>(function(){
"use strict";
function post(m){try{parent.postMessage(Object.assign({__nexus_sandbox:1,at:Date.now()},m),"*")}catch(e){}}
function stringify(a){if(typeof a==="string")return a;try{return JSON.stringify(a).slice(0,500)}catch(e){return String(a)}}
["log","warn","error"].forEach(function(lv){var o=console[lv].bind(console);console[lv]=function(){try{post({kind:"console",level:lv,text:Array.prototype.map.call(arguments,stringify).join(" ")})}catch(e){}o.apply(null,arguments)}});
window.addEventListener("error",function(e){post({kind:"error",text:String(e.message||"script error"),line:e.lineno||0})});
// canvas autofit: generated games often assume a fixed window size
function fit(){var c=document.querySelector("canvas");if(!c)return;if(!c.style.width){c.style.width="100vw";c.style.height="100vh";c.style.display="block";}document.body.style.margin="0";document.body.style.overflow="hidden";document.body.style.background="#0a0a12";}
document.addEventListener("DOMContentLoaded",fit);
window.addEventListener("resize",fit);
// keyboard focus: click once so WASD/arrow input works without a foundry-specific fix
window.addEventListener("pointerdown",function(){try{window.focus()}catch(e){}},{once:true});
document.addEventListener("DOMContentLoaded",function(){post({kind:"ready",text:"game ready"})});
})();</script>`;

/**
 * Assembles forged game files into a single runnable HTML document.
 * JS files execute in dependency-friendly order (utils/engine first,
 * main/game/loop last) inside isolated IIFEs — a file that crashes can
 * never take down the files after it. Three.js / CDN script tags inside
 * an index.html are preserved; everything else is inlined offline-style.
 */
export function assemblePlayableGame(files: PlayableFile[], title = "Nexus Game"): string {
  const html = files.find((f) => /\.html?$/i.test(f.path));
  const css = files.filter((f) => /\.css$/i.test(f.path));
  const js = files
    .filter((f) => /\.m?js$/i.test(f.path))
    .sort(
      (a, b) =>
        rankOf(a.path) - rankOf(b.path)
    );

  const styleBlock = css.map((c) => `<style data-src="${c.path}">\n${c.code}\n</style>`).join("\n");
  const scriptBlock = js
    .map(
      (f) =>
        `<script data-src="${f.path}">\ntry{\n${f.code}\n}catch(e){console.error("[${f.path}]",e&&(e.message||e));parent.postMessage({__nexus_sandbox:1,kind:"error",text:"${f.path.replace(
          /"/g,
          '\\"'
        )}: "+(e&&(e.message||e)),at:Date.now()},"*")}\n</script>`
    )
    .join("\n");

  if (html) {
    let doc = html.code;
    // drop external <script src> tags that point at our own local files (they 404 in srcdoc)
    for (const f of js) {
      const esc = f.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      doc = doc.replace(new RegExp(`<script[^>]+src=["'](?:\\.?\\/)?${esc}["'][^>]*>\\s*<\\/script>`, "gi"), "");
    }
    for (const c of css) {
      const esc = c.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      doc = doc.replace(new RegExp(`<link[^>]+href=["'](?:\\.?\\/)?${esc}["'][^>]*>\\s*`, "gi"), "");
    }
    const inject = (s: string) => (/<\/head>/i.test(doc) ? doc.replace(/<\/head>/i, `${s}\n</head>`) : s + doc);
    doc = inject(GAME_RUNTIME_BRIDGE + styleBlock);
    doc = /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, `${scriptBlock}\n</body>`) : doc + scriptBlock;
    return doc;
  }

  return (
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">` +
    `<title>${title}</title>${GAME_RUNTIME_BRIDGE}${styleBlock}</head>` +
    `<body><canvas id="game"></canvas>${scriptBlock}</body></html>`
  );
}

function rankOf(p: string): number {
  if (/(^|\/)(main|game|index|loop|app)\.m?js$/i.test(p)) return 10;
  if (/(^|\/)(utils?|math|engine|core|asset|input|audio)/i.test(p)) return 0;
  return 5;
}
