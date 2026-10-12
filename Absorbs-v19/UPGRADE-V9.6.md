# Nexus AI v9.6 — Engines first, builder that never freezes

## Changed
- src/lib/model-access.ts   order is now Grok (xAI) -> OpenRouter -> Gemini -> Open models; Grok 4 first in the list
- src/app/api/ai/mega/route.ts   plan + file phases: if Gemini cannot start, Grok then OpenRouter write the same plan/file (header x-engine: backup)
- src/lib/mega-client.ts   stall guard: a file stream silent for 120 s is cancelled and retried automatically
- public/sw.js   cache nexus-v9-6-engines (installed PWAs reload the update)

## Unchanged on purpose
- Grok / OpenRouter stay Pro-only, Free = Gemini + Hugging Face (your v9.4 rule). To open them to everyone, empty PRO_PROVIDERS in model-access.ts.
- The builder already runs file-by-file, saves each file in IndexedDB and chains requests for up to 60 minutes; resume works after closing the app.

## Deploy
npm install && npm run typecheck && npm run dev   (not type-checked here: no node_modules in the sandbox)
Keys: GROK_API_KEY, OPENROUTER_API_KEY, GEMINI key in Vercel env, then redeploy.
