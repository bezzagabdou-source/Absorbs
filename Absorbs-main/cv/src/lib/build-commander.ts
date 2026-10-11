/**
 * BUILD COMMANDER — the short, hard-edged command layer on top of the MAX / BUILD contracts.
 *
 * Why it exists: the older contracts ask for 6000+ lines for EVERY build. Huge targets on small
 * requests cause cut-offs, filler and runtime errors. The commander keeps "huge and beautiful"
 * but puts CORRECTNESS FIRST, makes the file self-describing (so continuations stay consistent),
 * and injects ONLY the blueprint that matches the request (game / site / system) to stay fast.
 *
 * Pure strings, isomorphic.
 */
import { DZ_WILAYAS } from "@/lib/seed-data";

export type BuildKind = "game" | "site" | "system";

export function buildKindOf(text: string): BuildKind {
  const t = text || "";
  if (/لعب[ةه]|العاب|ألعاب|\bgames?\b|\bjeu/i.test(t) && !/لعبة كلمات|معنى لعبة/.test(t)) return "game";
  if (/نظام|system|إدار[ةه]|ادار[ةه]|قاعدة بيانات|قواعد بيانات|database|dashboard|لوح[ةه] (تحكم|قيادة)|تطبيق|\bapp\b|\bcrm\b|\berp\b|مخزون|فواتير|حجز/i.test(t)) return "system";
  return "site";
}

const CORE = `

BUILD COMMANDER — HARD ORDERS (they override any softer wording above)
1. CORRECTNESS BEFORE SIZE. A big file that crashes is a failed build; a big file that runs on the first tap is the goal. Never pad: every line is a working feature, real content or real polish.
2. SELF-DESCRIBING FILE. First line inside the code: an HTML/JS comment "ARCHITECTURE" (max 25 lines) listing the modules, global names, state keys, storage keys and CSS tokens. Write the rest of the file to match it exactly, and a continuation must reuse it verbatim.
3. BOOT-SAFE ORDER: tokens/CSS -> markup -> config & data -> state -> systems -> UI -> event wiring -> boot() at the very end. Every DOM lookup is null-checked; the whole boot is inside try/catch that paints a friendly in-page error card (never a blank page). Classic scripts only, one global namespace, no ES-module imports, no build tools.
4. ZERO EXTERNAL FRAGILITY: the page must work with no network: inline SVG / emoji / CSS art by default. Remote assets (Google Fonts, images, CDN libs) are optional extras loaded in the background with a fallback; allowed CDNs are pinned cdnjs / jsDelivr / unpkg builds, and the page must still render if they fail to load.
5. DEVICE LAW: 100dvh shell with overflow contained, no layout shift, safe-area insets, 44px tap targets, works from 360px, RTL-correct for Arabic (logical CSS), touch AND keyboard, pointer events, no hover-only actions, prefers-reduced-motion respected.
6. SPEED LAW: one requestAnimationFrame loop with clamped delta time, no allocations inside hot loops (pool objects), batch DOM writes, debounce resize/scroll/search, lazy-build heavy screens, never block the first paint for more than 100 ms.
7. DATA LAW: every localStorage / IndexedDB / audio / fullscreen / vibration / clipboard call sits in try/catch with a working fallback (in-memory). Never crash on private mode.
8. AUTOMATIC VERIFIER WILL CHECK YOUR FILE (JavaScript syntax of every inline script, every getElementById id, every inline onclick function). Pass it on the first try: prefer addEventListener over inline onclick; define every function before the markup that calls it needs it; every id you read exists in the markup or is created by your code; no duplicate const / let / function names; balanced braces and parentheses; no top-level await; no trailing commas inside calls. A failed check costs the user a repair round, so lint your own code line by line as you write.
9. FINAL TRACE (silent): walk the first 10 seconds of a real user: open -> first screen -> primary action -> result -> reload (state restored). Fix anything that would throw, overlap, clip or look unfinished BEFORE the closing tag. The file must end with its final closing tag.`;

const GAME = `

GAME BLUEPRINT (only for this request)
- State machine: boot -> menu -> playing -> paused -> gameover -> results; every transition tested; restart resets ALL state.
- Core loop is fun in 5 seconds: instant feedback (particles, shake, sound), readable HUD, escalating difficulty curve, a clear goal and a reason to replay (score multipliers, unlocks, daily seed, achievements).
- Procedural art and audio only: layered parallax / gradients / glow; Web Audio SFX + music started after the first tap; mute toggle persisted.
- Input: virtual joystick + action buttons on touch, WASD/arrows/Space on keyboard, gamepad when present; no input lag; prevent page scroll and double-tap zoom inside the canvas.
- Collision: spatial hash or grid; fixed physics step; no tunnelling at high speed.
- Save: versioned save slot with migration; settings, best score and unlocks persist.`;

const SITE = `

SITE BLUEPRINT (only for this request)
- Real content, not lorem: believable copy in the user's language, 8+ sections (hero with one strong promise and one primary action, proof, features, how-it-works, pricing/offer, gallery built from CSS/SVG art, FAQ, contact form, footer).
- Conversion-grade UX: sticky nav with active-section highlight, smooth anchors, mobile menu, working form with validation and a success state (stored locally), WhatsApp/phone action buttons, toast feedback.
- SEO/a11y: title, meta description, Open Graph, semantic landmarks, alt/aria labels, visible focus, 4.5:1 contrast.
- Motion with taste: scroll-reveal via IntersectionObserver, hover/press states, count-up stats; nothing janky on a mid phone.
- If it is a store: product grid with search / filter / sort, cart drawer, quantity controls, totals, checkout form, order saved locally.`;

const SYSTEM = `

SYSTEM + DATABASE BLUEPRINT (only for this request)
- A "database" inside one HTML file means IndexedDB with a versioned schema (onupgradeneeded migrations), object stores with real indexes, a tiny promise-based data layer (add / put / get / delete / query / count / paginate) and an automatic in-memory fallback when IndexedDB is unavailable.
- SEED ON FIRST RUN: generate a large, realistic, deterministic dataset (seeded PRNG, never Math.random for seed data): at least 300 records in the main store plus related stores (users, categories, transactions...), believable names, dates, amounts and statuses. Use the provided reference data instead of inventing places.
- Complete product, not a form: dashboard with KPI cards and live charts (canvas/SVG, no libraries), full CRUD with validation and undo, search + multi-filter + sort + pagination (virtualised list when > 500 rows), detail drawer, bulk actions, import/export JSON and CSV, print-friendly report view, roles (admin / staff) with a local login screen, activity log, settings, backup/restore, empty/loading/error states.
- Referential integrity and money maths are exact (integer cents), dates are ISO, every list re-renders from state, no duplicated sources of truth.
- Algerian context when relevant: DA currency formatting (Intl ar-DZ / fr-DZ), the 58 wilayas below, Arabic-first RTL UI with French terms allowed.
REFERENCE DATA — WILAYAS (code = index + 1): ${DZ_WILAYAS.join(", ")}.`;

/** The command layer for ONE build request: the core orders + only the matching blueprint. */
export function buildCommanderFor(text: string): string {
  const kind = buildKindOf(text);
  return CORE + (kind === "game" ? GAME : kind === "system" ? SYSTEM : SITE);
}
