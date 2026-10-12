# Nexus AI v9.0 — 7-day free trial, MAX with every OpenRouter model, legendary tools

## 7-day free trial (all models + all features)
- Every new account gets `trial_ends_at = now + 7 days` (existing accounts get 7 days once, at the first deploy: `ensure-schema.ts` adds the column and back-fills it).
- During the trial `getProfile().plan === "pro"` (trial flag + `trialEndsAt` are returned), so every Pro gate in the app opens: MAX, all models, images, tools, voice, files, Studio, no time meter.
- Redeem codes / Chargily still work and stack on top: paid Pro is stored in `plan` / `plan_expires_at`, the trial never touches them.
- New welcome banner (`src/components/trial-welcome.tsx`): shown once per device when a trial account enters the app. Sidebar badge says "تجربة 7 أيام".

## MAX
- ALL OpenRouter text models: `GET /api/ai/models` (Pro/trial, cached 1 h) feeds an extra "OpenRouter — all models" group in the model picker. The chat route accepts any `vendor/model[:variant]` id for Pro.
- New `MAX_MIND_ADDON` (speed + depth protocol): first-token-first answers, silent senior-team reasoning, decisive output, "beyond the ask" extra, honest limits.
- Speed: DeepSeek via OpenRouter (`OPENROUTER_FAST_MODEL`, default `deepseek/deepseek-chat-v3.1`) now leads the `code` plan and is 2nd in `fast`.

## Images
- Reference image: upload a picture and the Gemini image models keep the subject / face / composition and apply your prompt + style (`reference` in `/api/ai/image`, downscaled to 1280 px in the browser).
- 3 new styles: Epic, 3D render, Anime; stronger MAX quality text.

## New AI-built tools (+ menu)
Deep Think, Storybook, Expert Gems, Data analysis dashboard, Mind map, Writing styles.

## Deploy
No new dependencies. Optional env: `OPENROUTER_FAST_MODEL`. Run `npm run typecheck` before deploying (it could not be run in the sandbox that edited this version).
