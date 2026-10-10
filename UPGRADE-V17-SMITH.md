# Nexus AI v17 — SMITH · MIND · MASTERY

What this upgrade adds, where it lives, and how to prove it works.
Everything below is already wired: no feature flags, no extra env vars.

---

## 1 · قوة الفهم — MIND (`src/lib/mind.ts`)

A pure, dependency-free reader that understands a request **before** any model is
called. It runs in ~1 ms, in the browser *and* on the server, from the same file.

What it extracts:

| | |
|---|---|
| **Language** | `ar` (MSA) · `ar-dz` (Darija) · `fr` · `en` · `mixed`, with an Arabic/Latin mix ratio |
| **Arabizi** | `bghit n3mel jeu` → `بغيت نعمل jeu` — digit-letter mapping (`3`→ع, `7`→ح, `9`→ق…) |
| **Intent** | 24 intents (`build_game`, `translate`, `math`, `marketing`, `code_fix`, …) + confidence 35–99 + a runner-up |
| **Entities** | money (`4500 دج`), places (`وهران`), dates, times, quantities (`١٠ مراحل`), URLs, emails, phones, levels, target languages, code languages, quoted text |
| **Corrections** | common typos (`منتاج` → `منتج`, `هاذا` → `هذا`) |
| **Unsaid slots** | what the user never specified, with a sensible guess (`genre`, `difficulty`, `budget`…) |
| **Deliverable** | format (`html`/`code`/`text`/`steps`), length, answer language |

**Protection:** code fences, inline code, URLs, emails, paths and maths
(`f(x)=3x^2+2x`) are masked before normalisation and restored byte-for-byte, so
Arabizi conversion can never corrupt a snippet a user pasted.

Where it is used:

- `src/app/api/ai/chat/route.ts` — the reading's `brief` is injected into the
  system prompt of **every** chat request, and `mindTask()` overrides the keyword
  classifier only when that classifier fell through to `general`/`quick` with
  MIND confident ≥ 58 % (exactly the Darija / mixed-language case regexes miss).
- `src/app/api/ai/mind/route.ts` — `POST { text }` returns one full reading;
  `GET` is a no-auth demo.
- `src/components/app/chat.tsx` — the 🧠 button next to the attach button opens
  **MindCard**: live understanding of the draft (language, intent, confidence
  bar, entities, corrections, missing slots) plus one-tap chips that append a
  guess, switch the answer language, or jump to the right tool. It computes in
  the browser, so nothing is sent anywhere while typing.
- `barq.mind_events` — privacy-safe telemetry (intent, language, confidence,
  ms, domain… **never the user's text**), which feeds the Mastery dashboard.

---

## 2 · صانع الألعاب الفوري — SMITH (`src/lib/smith/`)

The second way to make a game — deliberately **not** the same shape as the AI
builders that already exist:

| | AI builder (`game-forge.ts`, `game-master.ts`) | **SMITH** |
|---|---|---|
| How | a model writes the game | a real engine + your parameters |
| Time | tens of seconds, credits | **< 1 second, free** |
| Result | can stall or break | always runs, byte-identical for the same seed |
| Output | multi-file project or one HTML | one self-contained HTML (~128 KB) |

**One engine, 8 blueprints** (`scripts/smith-src/*.js` → `src/lib/smith/runtime.ts`):
`runner` (endless dash, double jump, slide, 4 power-ups) · `breaker` (multi-hit
bricks, multiball, laser) · `snake` (walls / portals / wrap modes) · `shooter`
(5 enemy behaviours, weapon upgrades, two-phase boss every 5 waves) · `climber`
(springs, moving & breaking platforms, jetpack) · `maze` (generated per level,
fog of war, keys + golden door) · `merge` (2048, 3×3…6×6, target you choose) ·
`memory` (timed pairs, combos, peek phase).

Shared core: DPR-aware canvas, clamped-`dt` RAF loop, keyboard **and** touch,
procedural WebAudio (SFX + a generative music loop that follows the level),
particles, screen shake, hit-stop, floating score text, HUD, state machine
(LOADING → MENU → PLAYING → PAUSED → GAMEOVER), `localStorage` + `window.NexusDB`
saves, RTL Arabic UI, and a `postMessage` bridge that reports scores to the host
page. 8 palettes × 3 languages (ar / fr / en), all injected as data.

Pages & endpoints:

- `/app/smith` — the factory (pick a blueprint → tune → build), the vault, the leaderboards.
- `/play/[slug]` — public arena page: a shared game plays with **no login**.
- `POST /api/smith/build` — build (+ optionally save). Deterministic; refuses to serve a file that fails `verifySmithHtml()`.
- `GET|PATCH|DELETE /api/smith/games` — vault (list is metadata-only; `?id=` returns the HTML).
- `POST|GET /api/smith/score` — submit a run / read a board, `?global=1` for the XP board.
- `GET /api/smith/play/[slug]` — the file itself, under a strict CSP; only SMITH-engine games are streamed from our origin, private games need their owner.

---

## 3 · مسار الإتقان — MASTERY (`src/lib/mastery-rules.ts`, `src/lib/mastery.ts`)

XP for everything: build a game (+60), publish (+45), play (+6), submit a score
(+25 and up to +120 scaled), AI game (+120), MIND read (+4), tool run (+12),
first activity of the day (+30, Algeria-day clock so it matches the daily credits).

- Levels from a real curve (`xpForLevel`), 7 ranks (مبتدئ → صانع → محترف → خبير → أسطورة → تيتان → خالد).
- **24 badges** with live progress (`first_smith`, `all_blueprints`, `polyglot`, `night_owl`, `streak_30`, `score_20k`…).
- Streaks with `longest_streak`, and a global XP leaderboard.
- `/app/mastery` — dashboard drawn in hand-written SVG (no chart library): level ring, badge grid, top intents, language donut, activity-by-hour, best runs, hall of honour.
- `GET /api/mastery/stats` — one call for the whole dashboard, each query independent; unavailable sections come back in `offline: []` instead of failing the page.
- `POST /api/mastery/award` — only `smith_play` / `smith_like` are claimable from the browser, and only for a slug that really exists.

The rules live in `mastery-rules.ts` with **zero imports** so the client bundle
never drags in `pg`/drizzle; `mastery.ts` does the database work and re-exports them.

---

## 4 · Database (`src/db/schema.ts` + `src/db/ensure-schema.ts`)

Four tables, declared twice on purpose: drizzle types **and** the idempotent DDL
that `ensureSchema()` runs on the first authenticated request, so a fresh
deployment creates them by itself (schema `barq`, `ON DELETE CASCADE` where it matters).

| table | purpose |
|---|---|
| `barq.smith_games` | the vault: slug (unique), blueprint, theme, config jsonb, html, visibility `private|unlisted|public`, plays, likes, best_score, bytes |
| `barq.smith_scores` | one row per run: score, level, duration_ms, handle |
| `barq.mastery_profiles` | xp, level, counters, streak, longest_streak, badges jsonb |
| `barq.mind_events` | MIND telemetry: kind, intent, lang, confidence, ms, payload jsonb (no user text) |

---

## 5 · Build stability (why this deploys at all)

- **Self-hosted fonts.** `next/font/google` downloads at build time; when Google
  Fonts is slow or blocked the whole Vercel build fails and nothing deploys.
  IBM Plex Sans Arabic is now vendored (`src/fonts/plex-{arabic,latin}-{400,500,600,700}.woff2`)
  and loaded with `next/font/local`. Two families (Arabic + Latin) with
  per-character fallback, because `next/font/local` accepts no `unicodeRange`,
  and every loader value is a **literal** — Next reads that call statically, so a
  computed `src` (`.flatMap`, template interpolation) breaks the build.
- **Typecheck hygiene.** `cv/` (a stale duplicate of the app), `nexus-rag/` and
  `__MACOSX/` are excluded from `tsconfig.json` and ESLint: the 13 legacy errors
  they produced were noise hiding real ones. `npx tsc --noEmit` is now 0 errors.

---

## 6 · How to verify (all of it, locally)

```bash
npx tsc --noEmit          # 0 errors
npx next build            # production build, all routes
npm run smoke:smith       # 24 generated games, actually executed headlessly
npm run build:smith       # regenerate runtime.ts after editing scripts/smith-src/
```

`npm run smoke:smith` is not a syntax check. It builds every blueprint × 3
configs (theme/language/difficulty), then **runs** each game against a virtual
DOM, canvas, clock and Web Audio stub: it boots, shows the menu, starts a run,
simulates 260–420 frames of keyboard/touch input, and fails if a single frame
throws, if the QA check finds an unbalanced tag, or if the state machine never
reaches PLAYING. Two real bugs were caught this way (a shadowed `left()` in
Breaker, and stale menu buttons swallowing taps during play).

Engine sources live in `scripts/smith-src/*.js` (plain JS, no backticks, no
`${`) and are concatenated into `src/lib/smith/runtime.ts` by
`scripts/build-smith-runtime.mjs`, which refuses to write output that does not
parse — edit the sources, never the generated file.
