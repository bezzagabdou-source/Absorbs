# Nexus AI v10.1 — PWA / a11y / perf pass

## PWA (public/sw.js, src/components/pwa.tsx, offline.html)
- Navigation preload enabled; page requests fall back to cache after 8 s instead of hanging on a stalled network.
- Cache writes are wrapped in try/catch (quota / private mode no longer throw); cache name bumped to `nexus-v10-1-perf`.
- Notification click only opens same-origin URLs (falls back to `/app`).
- SW registered with `updateViaCache: "none"`; update check on tab/app resume so new deploys land fast; also registers immediately if `load` already fired.

## Accessibility
- Pinch-zoom re-enabled (removed `maximumScale` / `userScalable:false` from layout viewport and offline.html) — WCAG 1.4.4. Inputs are already 16px, so iOS won't auto-zoom.
- Global `prefers-reduced-motion` rule covers every animation/transition (previously only `.aurora`).
- Click-catcher backdrops (`export-menu`, `voice-recorder`) are `aria-hidden`; tools-menu overlay is `role="presentation"` (its inner dialog keeps `role="dialog"`).

## Metadata
- Removed stale "v8.4" from title, OG, keywords (duplicate keyword dropped) and offline page.

## Deploy
- No new dependencies. Run `npm run typecheck && npm run lint` before deploying (node_modules were not installed in this sandbox, so only `sw.js` was syntax-checked).

## In-chat image generation (Gemini-style)
- Ask in chat ("ديرلي صورة…", "اصنع لي صورة…", "generate an image…", "dessine-moi…") and a card appears at once: shimmering frame in the right aspect ratio, rotating status text, timer and progress bar, then the picture fades in (blur-up).
- Buttons under the picture: تنزيل · نسخة جديدة · تعديل (opens Image Studio with the same prompt). Tap the picture for full-screen.
- `src/lib/image-intent.ts`: Arabic / Darija / French / English intent detection (questions like "كيف اصنع صورة في فوتوشوب" are ignored); infers aspect (16:9 / 9:16 / 4:3 / 3:4) and style (anime, 3D, cinematic, art…) from the text.
- `src/lib/inline-image.ts`: 100 s hard timeout, one automatic retry on transient errors, abort support.
- `src/components/chat/image-gen-card.tsx`: loading → done | error state machine, aria-live status, keyboard-closable zoom.
- Blob URLs are released on retry and when the chat is cleared. Free accounts use the fast engine (server rule unchanged); Pro keeps the stronger tiers.
- Note: generated pictures live in the browser session (blob URLs); they are not re-loaded after a page refresh. Download or open in Image Studio to keep them.

## MAX precision pass (create / design / edit)
Note: model weights are not trained here — MAX is hardened with prompt discipline, lower randomness and an automatic verify-and-repair loop. "Zero errors" cannot be promised by any model; this makes broken output far rarer and self-correcting.
- `MAX_PRECISION_ADDON` (src/lib/max-engine.ts): fast first byte, silent pre-flight (fix all names first), list of error magnets (missing ids, ES modules, duplicate ids, unclosed tags, dt=0…), surgical-edit rules (keep every name, return the full file), token-first design, silent post-flight re-read.
- Temperature for MAX builds 0.7 → 0.35 (hard tasks 0.6 → 0.3) in `api/ai/chat/route.ts`.
- `src/lib/code-check.ts`: static checker (tag balance, missing `</html>`, duplicate ids, JS syntax by compile-only `new Function`, `getElementById` of missing ids, non-cdnjs scripts). It never executes the code.
- Chat: after a live MAX answer finishes, the file is checked; if issues exist an auto-repair message is sent (max 2 rounds per request) with the exact list; the model returns the full corrected file. Old conversations are never re-checked.

## Full audit pass
- Fixed: duplicate `sendRef` declaration in `chat.tsx` (build-breaking, introduced by the MAX auto-verify patch).
- Fixed: `drop-overlay.tsx` typed the dropped files as `unknown[]` (now `File[]`).
- Perf: MAX starter prompts moved to `src/lib/max-starters.ts` so the browser bundle (command palette) no longer ships the long MAX system prompts.
- Verified: all JSON / manifest / `.mjs` / `sw.js` parse; every referenced `/icons`, `/arcade`, `og.png`, `offline.html` exists; no client component imports a server-only lib; every hook-using file has `"use client"`; no unresolved local imports.
- Remaining `npm run preflight` blockers are configuration only: set `DATABASE_URL` and `GEMINI_API_KEY` (and the optional keys / `assetlinks.json` SHA-256) in Vercel.
