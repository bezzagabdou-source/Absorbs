# Nexus AI v9.1 — Algerian school brain + "مدرّس الجزائر الذكي"

## Identity
Anyone who asks who made / developed the AI gets: "طورني المطور abdelrezakbezzag من الجزائر 🇩🇿" (Darija/Arabic, French, English) — in chat, fast path, free models and voice calls.

## Algerian curriculum solver (`src/lib/dz-school.ts`)
- Active automatically when the message looks like schoolwork (تمرين، فرض، اختبار، bac، exercice, devoir…) or has an image / file attached.
- Reads the photo, detects level / stream / subject, solves with the official Algerian method per subject (maths, physics, SVT, Arabic, philosophy, French, English, history/geo, Islamic ed.), model answer + marking scheme /20 + "نصيحة المصحّح".
- Non-school images are ignored by the block (normal answer).

## New legendary feature: مدرّس الجزائر الذكي (tools "+" menu, first entry)
Send a photo of an exercise / test and get a full study pack: model solution with marking scheme, the idea in 30 s + common mistakes, 3 similar exercises, an interactive self-correcting quiz (timer, score /20, medal, error review), and a 3-day revision plan.

## Deploy
No new dependencies, no new env. Run `npm run typecheck` before deploying (not runnable in the editing sandbox).

## PWA icon + name
- New neon "N" AI icon (`public/icons/nexus-*.png`, `favicon.ico`): any 192/512, maskable 512, apple-touch 180. New file names, so installed apps and browsers pick them up despite the 1-year cache.
- PWA name: "Nexus AI — الذكاء الاصطناعي الجزائري", short name "Nexus AI" (manifest, layout metadata, apple title). Theme colour #0b0620. Service-worker cache renamed so the update is applied.
- To rename again: edit `name` / `short_name` in `public/manifest.webmanifest` and `applicationName` / `appleWebApp.title` in `src/app/layout.tsx`.

## Standalone legal site
- `public/privacy.html`: one self-contained HTML file (no external requests): privacy policy, terms, data deletion, payments, AI disclaimer, school work, children, rights, contact + EN/FR summary. Dark/light, sticky index, print-friendly.
- `/privacy` and `/terms` now redirect to it (`next.config.ts`); the sitemap points to `/privacy.html`. You can also host this one file anywhere (e.g. a separate domain) for store listings.
