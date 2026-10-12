# Nexus AI v8.4 PRO — Tank (final release)

## What changed
1. **Best AI is primary** — `src/lib/task-router.ts`: Claude leads every task (code, writing, reasoning, vision, creative);
   Groq/Cerebras still lead instant short replies. Gemini is now only the safety net / free tier.
   Engines without a key are skipped automatically. Force another lead with `BARQ_LEAD=grok` (or any engine name).
2. **Huge builds, strict minimums** — `src/lib/mega.ts` + `api/ai/mega`:
   up to 150 files / 10 MB; game ≥ 3 MB, site/app ≥ 500 KB, anything ≥ 100 KB (the user's own number wins).
   The architect is re-asked when its plan is too small; per-file targets are scaled up; a code file under 50% of its
   target is regenerated (best attempt is kept as a fallback). Single-file builds (chat / tools) must be ≥ 100 KB (`prompts.ts`).
3. **Nothing is lost when you leave the Studio** — `src/lib/mega-store.ts` and `src/lib/tool-store.ts` run generation at
   module level, outside React. Leaving the page keeps it running; a floating badge (`components/background-jobs.tsx`)
   shows progress and returns you to it. Finished HTML builds are saved to the Studio gallery automatically;
   mega files are saved in IndexedDB and a cut project resumes by itself after a reload.

## Env
Same keys as before (ANTHROPIC_API_KEY for the primary engine, plus GEMINI / DEEPSEEK / XAI / GROQ / CEREBRAS / OPENROUTER / HF_TOKEN).

## Claude: where it comes from
- Direct: `ANTHROPIC_API_KEY` (or `CLAUDE_API_KEY`) → api.anthropic.com (`src/lib/gemini.ts`, `fallbackProviders`).
- Through OpenRouter (paid, opt-in): set `OPENROUTER_CLAUDE=on` together with `OPENROUTER_API_KEY` and no Anthropic key; Claude is called as `anthropic/claude-sonnet-4.5`
  (override with `OPENROUTER_CLAUDE_MODEL`). Same engine name, so the router still puts it first.
- Without either key, Claude is skipped and the next engine in the list (Grok, DeepSeek, Gemini…) leads.
- `src/lib/ai-providers.ts` is not imported by any route (unused).
