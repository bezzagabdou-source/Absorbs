# Nexus AI v8.7 — Claude Warm Dark + Unified System Footer

## Theme
- Default theme is now Claude Warm Dark: page #181816, cards #22211f, controls #2a2926, terracotta #d97757, text #f3f3ee / #b0ad9e.
- Tokens (`ink`, `brand`, `aqua`, `slate`) are remapped in `src/app/globals.css`, so every existing Tailwind class follows the new palette. Gold stays as the Pro identity.
- The light orange theme is still available as an opt-in in Settings. Theme storage key is now `nexus_theme_v3`, so everyone starts on the new default.
- PWA manifest / offline page / theme-color updated to #181816.

## Unified System Footer
- `src/components/system-footer.tsx` links: /privacy, /terms, /report, /help, /activity, /memory.
- Used by `PublicShell` (all public pages) and the landing footer.
- New pages: /help, /report (opens a prefilled email, with optional diagnostics), /activity (live AI status + latency), /memory (redirects to /app/settings/memory).

## MAX prompt (`src/lib/max-engine.ts`)
- Default palette + template-grade finish rules added to `MAX_DESIGN_RULES`.
- New rules 9 (exact-resume continuation) and 10 (quality bar) in `MAX_STRICT_ADDON`.
