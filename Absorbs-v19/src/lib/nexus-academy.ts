/**
 * Nexus AI v15 — THE ACADEMY
 * =============================================================================
 * An honest note about "training", kept in the source on purpose:
 *
 * We do NOT fine-tune anybody's weights here. Nexus talks to Gemini, Grok,
 * Claude, GPT and the Hugging Face models over their public APIs; nobody ships
 * gradient updates to those. What this file *does* give is the thing that
 * actually moves output quality on hosted models, and it moves it a lot:
 *
 *   1. a large curated domain corpus (patterns, invariants, pitfalls, recipes)
 *      injected only when the task needs it,
 *   2. a per-model playbook — each of the 16 engines has different failure
 *      modes, context budgets and tool habits, so each gets its own directives,
 *   3. hard output contracts (file manifests, size floors, no-placeholder rules)
 *      that are checked by the runtime, not just requested politely.
 *
 * That is "training" in the only sense available to an API client, and it is
 * what makes a 7B-class model emit a working Three.js scene instead of a stub.
 *
 * Pure / isomorphic: no node imports, safe on both sides.
 */

export type DomainId =
  | "game3d"
  | "game2d"
  | "web"
  | "mobile"
  | "backend"
  | "data"
  | "algorithms"
  | "design"
  | "arabic"
  | "devops"
  | "security"
  | "media";

export interface KnowledgePack {
  id: DomainId;
  /** Arabic label shown in diagnostics. */
  label: string;
  /** Matched against the normalised user text. */
  triggers: RegExp;
  /** Injected verbatim into the system prompt. Keep each under ~3 KB. */
  body: string;
  /** Rough token weight so we can budget what gets injected. */
  weight: number;
}

/* ===========================================================================
   1. THE CORPUS
   Each pack is distilled engineering knowledge: the invariants a senior dev
   would enforce in review. These are the "databases" the models study from.
   =========================================================================== */

const GAME3D = `
### 3D GAME ENGINEERING CORPUS (Three.js / WebGL, zero-build, CDN-free)

ARCHITECTURE — always split a 3D game into these modules:
  index.html      shell, canvas, HUD markup, <script type="importmap">
  src/engine.js   renderer, scene, camera, resize, render loop, fixed timestep
  src/input.js    keyboard + pointer-lock + touch joystick, unified action map
  src/physics.js  AABB/sphere colliders, gravity, swept collision, ground snap
  src/world.js    terrain/level geometry, instancing, spatial hash for culling
  src/entities.js player, enemies, pickups — a component-ish entity table
  src/ai.js       state machines (idle/patrol/chase/attack), steering, A* grid
  src/audio.js    WebAudio graph, 3D panner, procedural SFX (no asset files)
  src/ui.js       HUD, menus, pause, damage flash, minimap
  src/save.js     localStorage slots, versioned schema, migration
  src/main.js     bootstrap, asset preload, state machine (menu/play/over)

NON-NEGOTIABLE INVARIANTS
  - Fixed timestep for simulation (const STEP = 1/60), accumulator loop,
    interpolated rendering. Never multiply gameplay by a raw delta.
  - Cap delta: dt = Math.min(0.25, (now - last) / 1000) — stops the tunnelling
    explosion after a tab is backgrounded.
  - Dispose discipline: geometry.dispose(), material.dispose(), texture.dispose()
    on every level unload or the GPU leaks within minutes.
  - One THREE.Clock, one requestAnimationFrame loop. Never nest rAF.
  - renderer.setPixelRatio(Math.min(devicePixelRatio, 2)) — uncapped DPR kills
    mobile GPUs.
  - Use InstancedMesh above ~50 repeated objects; BufferGeometry merging for
    static scenery. A naive 1000-mesh scene drops to 12 fps on a phone.
  - Frustum + distance culling with a spatial hash grid, cell ≈ 2× view radius.
  - Shadows: ONE directional light casting, shadow.mapSize 1024/2048, tight
    shadow camera frustum fitted to the play area. More casters = instant death.
  - Object pooling for bullets/particles/enemies. Never allocate in the loop;
    zero garbage per frame is the target.
  - Collision: broadphase (spatial hash) → narrowphase (AABB or sphere) →
    resolve along the minimum translation vector, then ground-snap with a
    downward ray so the player never jitters on slopes.
  - Camera: third-person spring-arm with a collision ray so it never clips the
    wall; first-person uses pointer-lock with clamped pitch ±89°.
  - Input must support keyboard+mouse AND touch. Detect once, show the matching
    HUD. A mobile player with no joystick = a broken game.
  - Pause on visibilitychange; resume without a delta spike.
  - Everything procedural: geometry from primitives, textures from CanvasTexture
    or noise, audio from oscillators. The game must run from a file:// open with
    no network and no asset downloads.

PROCEDURAL CONTENT RECIPES
  - Terrain: value/simplex noise → PlaneGeometry vertex displacement → compute
    vertex normals → vertex colours by height band (sand/grass/rock/snow).
  - Buildings: extruded footprints, boolean-free; vary height by seeded random.
  - Trees: cylinder trunk + 2–3 cones, 3 LOD variants, InstancedMesh.
  - Skybox: gradient shader on a BackSide sphere + a fake sun billboard.
  - Water: plane with a scrolling normal-ish sine displacement in the vertex
    shader, transparency + fresnel-ish rim in the fragment shader.
  - Particles: Points with a BufferAttribute ring buffer, additive blending.
  - Sound: short oscillator envelopes — square for pickups, sawtooth + lowpass
    sweep for engines, white-noise burst + fast decay for impacts.

GAME FEEL (what separates a demo from a game)
  - Coyote time (~90 ms) and jump buffering (~120 ms).
  - Screen shake on impact: decaying random offset on the camera, max ~0.3 units.
  - Hitstop: freeze the simulation 40–80 ms on a heavy hit.
  - Damage numbers, a hit flash (material.emissive pulse), and a sound per event.
  - Difficulty curve driven by a single tunable table at the top of the file.

PERFORMANCE BUDGET (must be stated in the README you generate)
  - ≤ 120 draw calls, ≤ 300k triangles, ≤ 60 MB GPU, 60 fps desktop / 30 fps mid phone.

SHIP CHECKLIST — refuse to call the game done until all pass:
  [ ] runs from a plain file:// open, no build step, no CDN
  [ ] win state AND lose state both reachable
  [ ] pause/resume, restart without reload, settings persist
  [ ] touch controls present and tested logic-wise
  [ ] no console errors, no NaN positions, no leaked listeners
  [ ] README.md with controls, architecture and the perf budget
`;

const GAME2D = `
### 2D GAME CORPUS (Canvas2D)
  - Separate the simulation grid from the render transform. Camera = a single
    ctx.setTransform, never per-object maths.
  - Sprite batching by image; ctx.imageSmoothingEnabled = false for pixel art.
  - Tilemaps: a flat Int16Array + a chunk dirty-flag; redraw chunks to an
    offscreen canvas, blit one image per frame.
  - Collision: swept AABB against the tile grid, resolve X then Y separately —
    this single ordering trick removes 90% of platformer corner bugs.
  - Platformer constants that feel right: gravity 2200 px/s², jump impulse -720,
    max fall 1400, accel 2600, friction 1800, coyote 0.09 s, buffer 0.12 s.
  - Juice: squash/stretch on land, dust particles, 1-frame hitstop, chromatic
    shake on damage.
`;

const WEB = `
### PRODUCTION WEB CORPUS
  - Semantic HTML first; every interactive element reachable by keyboard, every
    icon-only button has aria-label, focus rings are visible.
  - CSS: custom properties for the palette, clamp() for type scale, container
    queries over media queries where supported, prefers-reduced-motion honoured.
  - Layout: never a fixed-position decorative layer inside another fixed parent
    (it vanishes); position:sticky needs a scrolling ANCESTOR, not a sibling.
  - Flex overflow: a growing child pushes siblings out unless you set min-w-0 on
    the flex item and shrink-0 on the thing that must never move.
  - Images: explicit width/height to stop CLS, loading="lazy" below the fold.
  - State: derive, don't duplicate. setState inside an effect to mirror a prop
    is a cascading-render bug — compute it during render instead.
  - Forms: controlled inputs, disabled submit while pending, optimistic UI only
    with a rollback path.
  - Dark + light must BOTH be defined for every token you introduce.
`;

const MOBILE = `
### MOBILE / PWA CORPUS
  - 100dvh not 100vh; the URL bar eats the difference on iOS.
  - env(safe-area-inset-*) padding on any fixed bottom bar.
  - Tap targets ≥ 44×44 px; no :hover-only affordances.
  - -webkit-overflow-scrolling and overscroll-behavior: contain on scrollers.
  - Service worker: cache-first for the shell, network-first for the API, and a
    version bump that actually evicts the old cache.
  - Avoid 300 ms delay with touch-action: manipulation.
`;

const BACKEND = `
### BACKEND / API CORPUS
  - Validate at the edge, trust nothing from the client, never echo raw errors.
  - Idempotency keys on anything that charges or creates.
  - Timeouts on EVERY outbound call; an unbounded fetch is an outage waiting.
  - Retry with jittered exponential backoff, and a circuit breaker after N fails.
  - Streaming: send a heartbeat so proxies don't kill an idle connection.
  - Pagination by cursor, not offset, once rows exceed ~10k.
  - Structured logs with a request id; log decisions, not payloads.
`;

const DATA = `
### DATA CORPUS
  - Normalise then denormalise deliberately, and write down why.
  - Index every column you filter or sort on; a composite index is ordered —
    (a,b) serves a and a+b, never b alone.
  - N+1 queries are the default failure; batch or join.
  - Dates in UTC in storage, localised only at the edge.
  - For analytics: pre-aggregate into rollup tables, don't scan raw events live.
`;

const ALGORITHMS = `
### ALGORITHMS CORPUS
  - State the complexity before writing the code; if it is worse than O(n log n)
    on a hot path, redesign.
  - Prefer a hash map over a nested loop; prefer a heap over repeated sorting.
  - Grid pathing: A* with an octile heuristic and a binary heap open set.
  - Spatial queries: uniform hash grid beats a quadtree for uniform density.
  - Always handle: empty input, single element, duplicates, overflow, and the
    already-sorted / reverse-sorted adversarial cases.
`;

const DESIGN = `
### VISUAL DESIGN CORPUS
  - One accent hue, one neutral ramp, one signal colour. Three hues maximum.
  - Type scale by ratio (1.25), never arbitrary px. Line height 1.5 for body,
    1.15 for display. Measure 60–75 characters.
  - Spacing on a 4 px grid; the 8/12/16/24/32 rhythm reads as "designed".
  - Elevation = one soft large shadow + one tight contact shadow, never both big.
  - Motion: 120–220 ms, ease-out for entering, ease-in for leaving, and nothing
    animates on prefers-reduced-motion.
  - Contrast ≥ 4.5:1 for body text. Gradients never carry meaning alone.
  - Arabic UI: set dir="rtl", use logical properties (margin-inline-start),
    mirror chevrons, and never letter-space Arabic — it breaks the joins.
`;

const ARABIC = `
### ARABIC / DARIJA CORPUS
  - Reply in the user's register: Algerian darija gets darija, MSA gets MSA.
  - Keep technical nouns in Latin (API, Three.js, localStorage) — translating
    them makes the answer harder, not friendlier.
  - Numbers and code identifiers stay LTR inside an RTL paragraph; wrap them so
    they don't flip.
  - Common darija intents: "دير/ديرلي" = make, "صورلي" = draw me,
    "نسحقك" = I need you to, "بزاف" = a lot, "وقتاش" = when, "شحال" = how much,
    "نحّي" = remove, "زيد" = add, "غليتش" = glitch/bug, "قع" = at all/entirely.
  - Never transliterate the user's name or brand into Arabic unless asked.
`;

const DEVOPS = `
### SCALE CORPUS (10 → 100k users/day)
  - 100k/day ≈ 1.2 rps average but ~12 rps at the evening peak; design for peak.
  - Serverless: assume EVERY instance is cold and isolated. In-memory counters,
    caches and rate limiters are per-instance — they must degrade safely, and
    anything that must be global goes to a shared store.
  - Cache the expensive and the popular: a 60 s edge cache on a hot read removes
    most of the load for free.
  - Streaming responses hold a connection; cap concurrency per user or a single
    abusive client starves everyone.
  - Backpressure beats queuing: reject fast with Retry-After rather than hold.
  - Measure p95, not average. The average hides the outage.
`;

const SECURITY = `
### SECURITY CORPUS
  - Never trust a client-sent uid, tier or price. Re-derive server-side.
  - Verify the ID token on every privileged route; check issuer, audience, exp.
  - Escape on output, parameterise on query, validate on input.
  - Secrets only in env; a key in the bundle is a key that is already public.
  - Rate-limit auth, OTP and anything that sends mail or costs money.
  - CSP without unsafe-inline where possible; sanitise any HTML you render.
`;

const MEDIA = `
### MEDIA CORPUS
  - Image prompts: subject → action → setting → lighting → lens → style, in that
    order. Negative prompts remove, they do not add.
  - Any non-Latin prompt must be translated before it reaches a diffusion model;
    the tokenizer cannot read it and will hallucinate.
  - Aspect ratio changes composition, not just crop — say "wide establishing
    shot" for 16:9, "portrait, head and shoulders" for 9:16.
  - Audio/video: state duration, pacing and shot list before generating.
`;

export const KNOWLEDGE_PACKS: KnowledgePack[] = [
  { id: "game3d", label: "ألعاب 3D", weight: 3, body: GAME3D, triggers: /\b(3d|three\.?js|webgl|babylon|shader|fps|rpg|open[- ]world|voxel|minecraft|racing|unity)\b|لعبة|العاب|ثلاثي|ثري دي|شوتر|سباق/i },
  { id: "game2d", label: "ألعاب 2D", weight: 2, body: GAME2D, triggers: /\b(2d|canvas|platformer|tilemap|sprite|arcade|puzzle|snake|tetris|flappy)\b|منصات|بزل|ثنائي/i },
  { id: "web", label: "ويب", weight: 2, body: WEB, triggers: /\b(website|web ?app|landing|html|css|react|next\.?js|vue|svelte|tailwind|dashboard)\b|موقع|صفحة|واجهة|لوحة تحكم/i },
  { id: "mobile", label: "موبايل", weight: 2, body: MOBILE, triggers: /\b(mobile|android|ios|pwa|flutter|react ?native|apk|app ?store)\b|تطبيق|هاتف|جوال|موبايل/i },
  { id: "backend", label: "خادم", weight: 2, body: BACKEND, triggers: /\b(api|server|backend|endpoint|rest|graphql|webhook|auth|jwt|node|express|fastapi)\b|خادم|سيرفر|واجهة برمجية/i },
  { id: "data", label: "بيانات", weight: 2, body: DATA, triggers: /\b(database|sql|postgres|mysql|mongo|schema|query|index|migration|analytics)\b|قاعدة بيانات|قواعد بيانات|استعلام/i },
  { id: "algorithms", label: "خوارزميات", weight: 2, body: ALGORITHMS, triggers: /\b(algorithm|complexity|optimi[sz]e|leetcode|sort|search|graph|dynamic programming|pathfind)\b|خوارزم|تعقيد|تحسين/i },
  { id: "design", label: "تصميم", weight: 2, body: DESIGN, triggers: /\b(design|ui|ux|theme|palette|layout|typography|figma|beautiful|logo|brand)\b|تصميم|واجهة|شعار|جمال|ألوان|خلفية/i },
  { id: "arabic", label: "عربية", weight: 1, body: ARABIC, triggers: /[\u0600-\u06FF]/ },
  { id: "devops", label: "توسّع", weight: 2, body: DEVOPS, triggers: /\b(scale|scaling|users|traffic|load|performance|concurrent|cdn|cache|deploy)\b|مستخدم|زوار|ضغط|توسع|أداء|سرعة/i },
  { id: "security", label: "أمان", weight: 2, body: SECURITY, triggers: /\b(security|auth|login|password|token|encrypt|xss|csrf|permission)\b|أمان|كلمة السر|تسجيل|حماية|تشفير/i },
  { id: "media", label: "وسائط", weight: 1, body: MEDIA, triggers: /\b(image|photo|video|audio|render|prompt|diffusion|voice)\b|صورة|صور|فيديو|صوت|رسم/i },
];

/* ===========================================================================
   2. PER-MODEL PLAYBOOKS — all 16 engines
   Every hosted model fails differently. These directives are written against
   the observed failure mode of each one.
   =========================================================================== */

export interface ModelPlaybook {
  key: string;
  label: string;
  /** Short directive appended to the system prompt for this engine. */
  directive: string;
  /** Safe continuation chunk size in characters for TITAN. */
  chunk: number;
  /** Whether this engine tends to emit meta/draft preambles that must be cut. */
  stripsPreamble: boolean;
}

const COMMON = `Write complete, runnable code. Never emit "// ...", "TODO", "rest of the code", or an abbreviated block. If the answer is long, keep going across turns rather than summarising.`;

export const MODEL_PLAYBOOKS: Record<string, ModelPlaybook> = {
  // ---------------- free tier ----------------
  "flash-2.5": {
    key: "flash-2.5", label: "Nexus Flash", chunk: 24_000, stripsPreamble: false,
    directive: `${COMMON} You are fast and wide-context: plan the whole file list first in one short block, then emit files back to back without re-explaining.`,
  },
  "flash-lite": {
    key: "flash-lite", label: "Nexus Lite", chunk: 14_000, stripsPreamble: false,
    directive: `${COMMON} You are the smallest engine here: do not attempt clever abstractions. Prefer one obvious implementation, short functions, and explicit names. Emit one file per message chunk.`,
  },
  "flash-2.0": {
    key: "flash-2.0", label: "Nexus Flash 2.0", chunk: 18_000, stripsPreamble: false,
    directive: `${COMMON} Keep prose to a minimum; this engine drifts into commentary. Code blocks first, one short sentence between them at most.`,
  },
  think: {
    key: "think", label: "Nexus Think", chunk: 28_000, stripsPreamble: true,
    directive: `${COMMON} Do your reasoning silently. The user must never see planning text, self-talk, "Let me", "I'll start by", or a draft. Output only the final artefact.`,
  },
  "qwen-235b": {
    key: "qwen-235b", label: "Qwen3 235B", chunk: 22_000, stripsPreamble: true,
    directive: `${COMMON} Do not open with a restatement of the task. No "Certainly". Start directly with the plan block or the first file.`,
  },
  "qwen-coder": {
    key: "qwen-coder", label: "Qwen3 Coder 480B", chunk: 30_000, stripsPreamble: true,
    directive: `${COMMON} You are the strongest coder available: take the hardest architectural option that is still correct. Always include error handling, disposal and teardown paths — this engine omits them unless told.`,
  },
  "deepseek-free": {
    key: "deepseek-free", label: "DeepSeek V3.1", chunk: 24_000, stripsPreamble: true,
    directive: `${COMMON} Suppress chain-of-thought entirely. No "<think>", no scratchpad, no draft section. Final answer only.`,
  },
  "llama-70b": {
    key: "llama-70b", label: "Llama 3.3 70B", chunk: 16_000, stripsPreamble: false,
    directive: `${COMMON} This engine repeats itself near the end of long outputs — before finishing a file, check you have not already written that function.`,
  },
  // ---------------- pro tier ----------------
  auto: {
    key: "auto", label: "التوجيه الذكي", chunk: 24_000, stripsPreamble: true,
    directive: `${COMMON} Pick the simplest engine that can do the job, and say nothing about routing.`,
  },
  "sonnet-45": {
    key: "sonnet-45", label: "Claude Sonnet 4.5", chunk: 32_000, stripsPreamble: true,
    directive: `${COMMON} CRITICAL: emit no preamble, no plan narration, no "I'll create...", no draft version followed by a final version. Produce the finished artefact on the first pass. Prefer long, complete files over many small ones.`,
  },
  "grok-4": {
    key: "grok-4", label: "Grok 4", chunk: 28_000, stripsPreamble: true,
    directive: `${COMMON} Skip the jokes and the editorialising. Technical register only.`,
  },
  "gpt-4o": {
    key: "gpt-4o", label: "GPT-4o", chunk: 24_000, stripsPreamble: true,
    directive: `${COMMON} Do not hedge and do not add a closing summary of what you just wrote. End on the last line of code.`,
  },
  "grok-3": {
    key: "grok-3", label: "Grok 3", chunk: 22_000, stripsPreamble: true,
    directive: `${COMMON} Keep the structure strict: one fenced block per file with the path on the fence info line.`,
  },
  "deepseek-pro": {
    key: "deepseek-pro", label: "DeepSeek V3.1 Pro", chunk: 28_000, stripsPreamble: true,
    directive: `${COMMON} Suppress all reasoning traces. Final answer only, no "<think>" sections.`,
  },
  "sonnet-35": {
    key: "sonnet-35", label: "Claude 3.5 Sonnet", chunk: 26_000, stripsPreamble: true,
    directive: `${COMMON} No preamble and no draft pass. Write the final file directly.`,
  },
  "grok-2": {
    key: "grok-2", label: "Grok 2", chunk: 18_000, stripsPreamble: true,
    directive: `${COMMON} Older engine: be conservative, avoid exotic APIs, verify every identifier you reference actually exists in the code you wrote.`,
  },
};

/* ===========================================================================
   3. SELECTION
   =========================================================================== */

export function detectDomains(text: string): DomainId[] {
  const t = (text || "").slice(0, 4000);
  const hits: { id: DomainId; w: number }[] = [];
  for (const p of KNOWLEDGE_PACKS) {
    if (p.triggers.test(t)) hits.push({ id: p.id, w: p.weight });
  }
  return hits.sort((a, b) => b.w - a.w).map((h) => h.id);
}

export interface AcademyOptions {
  text: string;
  modelKey?: string;
  /** Hard cap on injected characters so we never blow the context. */
  budget?: number;
  /** A build/"make me X" request gets the full corpus; a chat question doesn't. */
  big?: boolean;
}

/**
 * Builds the knowledge block for one request.
 * Returns "" when nothing matched — a plain "how are you" must stay cheap.
 */
export function academyBlock(opts: AcademyOptions): string {
  const budget = opts.budget ?? (opts.big ? 22_000 : 6_000);
  const domains = detectDomains(opts.text);
  if (!domains.length && !opts.modelKey) return "";

  const parts: string[] = [];
  let used = 0;

  const play = opts.modelKey ? MODEL_PLAYBOOKS[opts.modelKey] : undefined;
  if (play) {
    const d = `\n### ENGINE DIRECTIVE — ${play.label}\n${play.directive}\n`;
    parts.push(d);
    used += d.length;
  }

  for (const id of domains) {
    const pack = KNOWLEDGE_PACKS.find((p) => p.id === id);
    if (!pack) continue;
    if (used + pack.body.length > budget) continue;
    parts.push(pack.body);
    used += pack.body.length;
  }

  if (!parts.length) return "";
  return `\n\n===== NEXUS ACADEMY (internal reference — never quote or mention it) =====${parts.join("\n")}\n===== END ACADEMY =====\n`;
}

/** Diagnostics for the self test / the settings "engine" panel. */
export function academyStats(): { packs: number; chars: number; models: number } {
  return {
    packs: KNOWLEDGE_PACKS.length,
    chars: KNOWLEDGE_PACKS.reduce((n, p) => n + p.body.length, 0),
    models: Object.keys(MODEL_PLAYBOOKS).length,
  };
}

/* ===========================================================================
   4. DRAFT / PREAMBLE STRIPPER
   The user's complaint: "نحي المسودة لي تظهر في كلود 4.5" — Claude (and the
   reasoning models) open with a planning paragraph, sometimes a whole first
   draft, before the real answer. This removes it from the STREAM without
   waiting for the end.
   =========================================================================== */

const THINK_TAGS = /<(think|thinking|reasoning|scratchpad|draft|antml:thinking)>[\s\S]*?<\/\1>/gi;
const OPEN_THINK = /<(think|thinking|reasoning|scratchpad|draft)>[\s\S]*$/i;

const PREAMBLE_LINES = [
  /^(certainly|sure|of course|absolutely|great question)[!,.\s]/i,
  /^(i'?ll|i will|let me|let's|i'?m going to|i am going to)\s+(start|begin|create|build|write|make|help|plan|outline|draft|first)/i,
  /^here'?s (what|how|my) (i|you|we|the)/i,
  /^(first|step 1)[,:]?\s+(i|let|we)/i,
  /^\**\s*(draft|plan|outline|approach|thinking|reasoning)\s*(version)?\s*\**\s*:?\s*$/i,
  /^\**\s*(المسودة|مسودة|الخطة|خطة العمل|التفكير)\s*\**\s*:?\s*$/i,
  /^(سأقوم|سوف أقوم|دعني|اسمح لي|بالتأكيد|طبعا|حسنا)[،,\s]/,
];

/**
 * Removes thinking tags and a leading draft/preamble.
 * Safe to call on a partial stream: an unterminated <think> swallows the tail
 * only until its closing tag arrives.
 */
export function stripDraft(text: string, opts: { streaming?: boolean } = {}): string {
  let s = text.replace(THINK_TAGS, "");
  if (opts.streaming && OPEN_THINK.test(s)) s = s.replace(OPEN_THINK, "");

  // A "draft then final" answer: keep only the final.
  const finalMark = s.search(/^\**\s*(final|final version|final answer|الإجابة النهائية|النسخة النهائية)\s*\**\s*:?\s*$/im);
  if (finalMark > 0) {
    const after = s.slice(finalMark);
    const nl = after.indexOf("\n");
    if (nl > -1) s = after.slice(nl + 1);
  }

  // Drop leading narration lines, but stop at the first substantial line.
  const lines = s.split("\n");
  let cut = 0;
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const L = lines[i].trim();
    if (!L) { if (cut === i) cut = i + 1; continue; }
    if (L.startsWith("```") || L.startsWith("#") || L.startsWith("|")) break;
    if (PREAMBLE_LINES.some((re) => re.test(L))) { cut = i + 1; continue; }
    break;
  }
  if (cut > 0) s = lines.slice(cut).join("\n");

  return s.replace(/^\s+/, "");
}

/** True when this engine is known to need the stripper. */
export function needsDraftStrip(modelKey?: string): boolean {
  if (!modelKey) return true;
  return MODEL_PLAYBOOKS[modelKey]?.stripsPreamble ?? true;
}

/* ===========================================================================
   5. RESOLVING A PLAYBOOK FROM THE WIRE SELECTION
   The client sends {provider, model}; the playbooks are keyed by the UI key.
   This maps one to the other without changing the wire shape.
   =========================================================================== */

const MODEL_ID_MAP: { re: RegExp; key: string }[] = [
  { re: /sonnet-4|claude.*4\.5|claude-sonnet-4/i, key: "sonnet-45" },
  { re: /claude-3\.5|sonnet-3\.5/i, key: "sonnet-35" },
  { re: /grok-4/i, key: "grok-4" },
  { re: /grok-3/i, key: "grok-3" },
  { re: /grok-2/i, key: "grok-2" },
  { re: /gpt-4o|chatgpt-4o/i, key: "gpt-4o" },
  { re: /qwen3-coder|qwen.*coder/i, key: "qwen-coder" },
  { re: /qwen3-235b|qwen.*235/i, key: "qwen-235b" },
  { re: /deepseek/i, key: "deepseek-pro" },
  { re: /llama-3\.3|llama.*70b/i, key: "llama-70b" },
  { re: /gemini-2\.5-flash-lite|flash-lite/i, key: "flash-lite" },
  { re: /gemini-2\.5-pro|2\.5-pro/i, key: "think" },
  { re: /gemini-2\.0-flash/i, key: "flash-2.0" },
  { re: /gemini-2\.5-flash/i, key: "flash-2.5" },
];

export function playbookKeyFor(model?: string | null): string | undefined {
  if (!model) return undefined;
  for (const m of MODEL_ID_MAP) if (m.re.test(model)) return m.key;
  return undefined;
}

/* ===========================================================================
   6. v15.1 — DEEP CORPUS
   The first pass gave each domain one dense page. These are the second-order
   packs: the things that only show up in code review after shipping. They are
   injected on top of the base pack when the request is a real build.
   =========================================================================== */

const DEEP_GAME3D = `
### 3D DEEP CORPUS — the bugs that only appear after an hour of play

MEMORY & LIFETIME
  - Every addObject must have a matching removeObject that calls
    geometry.dispose(), material.dispose(), and for each material key ending in
    "Map" also texture.dispose(). Materials shared between meshes must be
    reference-counted or disposed once at shutdown, never per-mesh.
  - renderer.info.memory.geometries should be flat after 10 level loads. If it
    climbs, something is retained — usually a closure in an event listener.
  - Remove listeners with the SAME function reference you added. An inline
    arrow in addEventListener can never be removed.

NUMERICAL STABILITY
  - Never compare floats with ===. Use an epsilon (1e-6 for positions).
  - Normalising a zero-length vector yields NaN and poisons the whole transform
    chain silently. Guard every normalize() whose input can be zero.
  - Quaternion slerp with t>1 or NaN produces an invisible object. Clamp t.
  - A position that reaches Infinity renders nothing and throws no error — add
    a dev-mode assert on !Number.isFinite(x).
  - Large worlds lose float precision past ~10,000 units: recentre the origin
    around the player instead of letting coordinates grow.

CAMERA & CONTROLS
  - Pointer lock can fail silently (user pressed Esc, or the document is not
    focused). Always listen for pointerlockchange and pause when it drops.
  - Clamp pitch to ±(Math.PI/2 - 0.001). Exactly 90° makes the up-vector
    degenerate and the camera flips.
  - Mouse delta must be scaled by sensitivity only, never by delta time —
    frame-rate-dependent aiming is the single most reported "feels bad" bug.
  - Third-person spring arm: cast from the pivot toward the desired camera
    position, place the camera at hit.distance * 0.9, and lerp the radius so it
    does not snap when a wall is passed.

COLLISION, IN ORDER
  1. Integrate velocity → candidate position.
  2. Broadphase: query the spatial hash for cells the swept AABB touches.
  3. Narrowphase: sort contacts by penetration depth, resolve deepest first.
  4. Resolve on one axis at a time (Y, then X, then Z) — simultaneous
     resolution is what makes characters stick to corners.
  5. Ground check: short downward ray from slightly above the feet, not from
     the centre, or stairs register as walls.
  6. Re-run once if a resolution created a new overlap; cap at 3 iterations.

ANIMATION
  - One AnimationMixer per skinned model, updated with the SAME dt as physics.
  - Cross-fade with fadeIn/fadeOut, never by setting weight directly, or poses
    pop on the first frame.
  - Root motion: either the animation drives position or the controller does.
    Both at once produces sliding feet.

RENDER ORDER & TRANSPARENCY
  - Transparent objects do not write depth: set depthWrite=false and sort by
    distance, or accept artefacts.
  - Additive particles must render after opaque geometry; give them a high
    renderOrder.
  - Outlines/sky/UI planes need explicit renderOrder — relying on insertion
    order breaks the moment you pool objects.

AUDIO
  - AudioContext starts "suspended" until a user gesture. Resume it on the
    first click or nothing ever plays and no error is thrown.
  - Create oscillators per-shot and let them be garbage collected; reusing one
    oscillator after stop() throws.
  - Always ramp gain (setTargetAtTime) — an instant gain change clicks audibly.

SAVE DATA
  - Version every save. On load, if version < current, run migrations in order;
    if the save is from the future, refuse rather than crash.
  - Wrap JSON.parse in try/catch — a half-written save from a closed tab is a
    real and common state.
`;

const DEEP_WEB = `
### WEB DEEP CORPUS — production failure modes

REACT
  - A state update derived from props belongs in render, not in an effect.
    Mirroring causes a second render pass and a visible flash.
  - useEffect with an object/array dependency re-runs every render unless the
    dependency is memoised. This is the #1 cause of infinite loops.
  - Cleanup must cancel in-flight work: AbortController for fetch, a "dead"
    flag for promises, clearTimeout/clearInterval for timers.
  - Keys must be stable and unique. Array index as key corrupts state on
    reorder or deletion.
  - Never call a setState during render of another component.

STREAMING UI
  - Buffer stream chunks and flush on a rAF, not per chunk — per-chunk setState
    on a fast stream drops frames.
  - Keep a heartbeat: if nothing arrives for ~1 s, show motion, or the user
    believes the app is dead and reloads mid-generation.
  - Never block the first paint waiting for a complete parse.

CSS
  - A position:fixed descendant of a transformed/filtered ancestor is
    positioned against that ancestor, not the viewport. This silently breaks
    modals inside animated containers.
  - overflow:hidden on an ancestor clips position:sticky.
  - 100vh on iOS includes the URL bar; use 100dvh.
  - z-index only works inside the same stacking context; a parent with opacity
    < 1, transform, filter or will-change creates a new one.
  - Flex children default to min-width:auto and refuse to shrink below content.
    min-w-0 is required on any flex child containing text that must truncate.

PERFORMANCE
  - Virtualise lists past ~200 rows.
  - Debounce input-driven network calls at 250-350 ms; throttle scroll at rAF.
  - Images: explicit dimensions, modern format, and lazy below the fold.
  - Measure with the Performance panel, not by feel. The bottleneck is almost
    never where it feels like it is.
`;

const DEEP_SCALE = `
### SCALE DEEP CORPUS — what breaks between 1k and 100k/day

THE ARITHMETIC
  100,000 requests/day = 1.16 rps mean. But traffic is not flat: expect ~8-12%
  of the day's volume in the busiest hour → ~3 rps sustained, ~12 rps spikes.
  If a request holds a streaming connection for 30 s, 12 rps means ~360
  concurrent open connections. That is the number that actually matters.

SERVERLESS REALITY
  - Every instance has its own memory. A Map-based rate limiter with N
    instances allows N× the intended rate. Treat in-memory limits as a burst
    guard only, and put the real limit in a shared store (Redis/Upstash/
    Firestore with a TTL) keyed by uid+window.
  - Cold starts add 200-800 ms. Keep the bundle small and lazy-import heavy
    modules inside the handler.
  - There is no graceful shutdown: never buffer state you have not persisted.

CONCURRENCY CONTROL
  - Cap concurrent streams per user (2-3). One tab-spamming user otherwise
    consumes an instance's whole connection budget.
  - Use a semaphore with a queue and a hard wait timeout; on timeout return 429
    with Retry-After rather than queueing forever.
  - Shed load deliberately: when p95 latency crosses a threshold, downgrade to
    a cheaper model instead of failing.

CACHING
  - Identical prompt + model + system → cache the response for 60 s. On a
    public demo this removes 30-60% of calls.
  - Cache the EMBEDDING of a query, not just the answer.
  - Stale-while-revalidate on anything a user reads more than once.

DATA
  - Firestore: a document is limited to 1 MiB and ~1 write/second sustained per
    document. Never keep a global counter in one doc — shard it.
  - Batch writes; a per-message write at 12 rps is 1M writes/day.
  - Paginate by cursor; offset pagination degrades linearly.

OBSERVABILITY
  - Log a request id, the model used, byte count and total ms for every call.
  - Alert on p95 and on error RATE, never on a single error.
`;

const DEEP_PROMPTING = `
### PROMPT ENGINEERING CORPUS (for when the user asks you to WRITE a prompt)

An image prompt is an ordered sentence, not a keyword soup:
  subject → defining detail → action/pose → environment → time/weather →
  lighting → camera (lens, angle, distance) → style/medium → quality tags

  Good:  "an elderly Algerian fisherman mending a blue net, weathered hands,
          sitting on a stone jetty in Bejaia harbour at dawn, soft golden
          backlight, shot on 85mm f/1.8, shallow depth of field, photorealistic,
          high detail"
  Bad:   "old man, fisherman, Algeria, nice, 4k, trending"

RULES
  - Negative prompts REMOVE; they never add. "no blur" does not sharpen.
  - Weight by position: the first 8 words dominate the composition.
  - One subject per prompt. Two subjects need an explicit spatial relation
    ("on the left… on the right…") or the model blends them.
  - Aspect ratio changes framing: say "wide establishing shot" for 16:9,
    "portrait, head and shoulders" for 9:16.
  - For text in an image, keep it under 4 words and quote it exactly.
  - Non-Latin prompts must be translated first — the tokenizer cannot read
    Arabic and will produce an unrelated picture.

VIDEO PROMPTS add: camera movement (static / slow dolly in / orbit / handheld),
duration, and what changes between the first and last frame.

LLM/SYSTEM PROMPTS: role → task → constraints → output format → examples →
failure handling. Put the output format LAST; it is what the model obeys most.

DELIVER a prompt as plain prose the user can copy. Never in a code fence.
`;

const DEEP_ALGO = `
### ALGORITHMS DEEP CORPUS — reference implementations worth memorising

A* ON A GRID
  open = binary heap keyed by f = g + h
  h = octile: (dx+dy) + (Math.SQRT2 - 2) * Math.min(dx, dy)
  closed = typed array of visited flags, not a Set of strings
  reconstruct via a cameFrom Int32Array of parent indices
  Complexity O(E log V); on a 256² grid this is sub-millisecond.

SPATIAL HASH
  cell = Math.floor(x / S) * 73856093 ^ Math.floor(z / S) * 19349663
  S ≈ 2 × the largest query radius. Rebuild per frame for dynamic objects —
  rebuilding 5k entries is cheaper than maintaining incremental buckets.

OBJECT POOL
  Pre-allocate N, keep a free-list index, never splice an array in the loop.
  "Release" swaps with the last active element and decrements the count.

FIXED TIMESTEP ACCUMULATOR
  acc += Math.min(0.25, dt); while (acc >= STEP) { step(STEP); acc -= STEP; }
  render(acc / STEP)  // alpha for interpolation

SEEDED RANDOM (mulberry32) — deterministic worlds need it:
  t += 0x6D2B79F5; let r = Math.imul(t ^ (t>>>15), 1 | t);
  r ^= r + Math.imul(r ^ (r>>>7), 61 | r); return ((r ^ (r>>>14))>>>0) / 4294967296;

VALUE NOISE — cheap terrain without a library: hash lattice points with the
above, smoothstep interpolate, sum 4-6 octaves at halving amplitude.
`;

/** Second-order packs, injected only on real build requests. */
export const DEEP_PACKS: { id: DomainId | "prompting"; triggers: RegExp; body: string }[] = [
  { id: "game3d", triggers: /\b(3d|three\.?js|webgl|fps|rpg|racing|open[- ]world|shader)\b|لعبة|العاب|ثلاثي/i, body: DEEP_GAME3D },
  { id: "web", triggers: /\b(react|next\.?js|website|web ?app|css|component|hook|stream)\b|موقع|واجهة|صفحة/i, body: DEEP_WEB },
  { id: "devops", triggers: /\b(scale|users|traffic|concurrent|load|performance|rate ?limit|cache)\b|مستخدم|ضغط|توسع|أداء/i, body: DEEP_SCALE },
  { id: "prompting", triggers: /\b(prompt|prompts|midjourney|stable diffusion|dall-?e)\b|برومت|برومبت|مطالبة/i, body: DEEP_PROMPTING },
  {
    id: "algorithms",
    // v15.1: a 3D/2D game build ALWAYS needs A*, the spatial hash, pooling,
    // seeded noise and the fixed-timestep accumulator — the old trigger list
    // missed every "دير لي لعبة" request, which is exactly when it matters.
    triggers: /\b(algorithm|pathfind|a\*|noise|pool|optimi[sz]e|complexity|physics|3d|2d|three\.?js|webgl|fps|rpg|racing|open[- ]world|game)\b|خوارزم|فيزياء|تحسين|لعبة|العاب|ثلاثي/i,
    body: DEEP_ALGO,
  },
];

/**
 * v15.1 — the richer block. Base packs + deep packs, still budgeted.
 * Drop-in superset of academyBlock().
 */
export function academyBlockDeep(opts: AcademyOptions): string {
  const base = academyBlock(opts);
  if (!opts.big) return base;

  const budget = opts.budget ?? 48_000;
  let used = base.length;
  const extra: string[] = [];
  for (const p of DEEP_PACKS) {
    if (!p.triggers.test(opts.text.slice(0, 4000))) continue;
    if (used + p.body.length > budget) continue;
    extra.push(p.body);
    used += p.body.length;
  }
  if (!extra.length) return base;
  return base + `\n===== ACADEMY — DEEP REFERENCE =====${extra.join("\n")}\n===== END DEEP =====\n`;
}

export function deepStats(): { packs: number; chars: number } {
  return { packs: DEEP_PACKS.length, chars: DEEP_PACKS.reduce((n, p) => n + p.body.length, 0) };
}
