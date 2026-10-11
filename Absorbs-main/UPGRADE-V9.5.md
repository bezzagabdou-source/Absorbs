# Nexus AI v9.5 — Grok + OpenRouter (Pro) alongside Gemini

## New files
- src/lib/openai-stream.ts   shared streaming client (model fallback, first-token wait, key redaction)
- src/lib/openrouter.ts      OpenRouter adapter (OPENROUTER_API_KEY)
- src/lib/grok.ts            xAI Grok adapter (GROK_API_KEY or XAI_API_KEY); falls back to Grok via OpenRouter
- src/lib/model-access.ts    model catalog + plan gate (shared by server and client)
- src/lib/model-router.ts    provider -> stream dispatcher
- src/components/app/model-selector.tsx, upgrade-modal.tsx

## Changed files
- src/lib/huggingface.ts     + streamHuggingFace()
- src/app/api/ai/chat/route.ts   provider/model params, 403 PRO_MODEL_REQUIRED, Gemini fallback
- src/components/app/chat.tsx    new selector + upgrade modal
- .env.example, .env.local       GROK_API_KEY / OPENROUTER_API_KEY

## Steps
1. Copy the files over the project (or use this zip).
2. Put your keys in .env.local (and in Vercel -> Settings -> Environment Variables), then redeploy.
3. npm run typecheck && npm run dev
4. Test: free account -> tap Grok/OpenRouter -> upgrade modal; curl with provider=grok -> 403.
5. Service-worker cache name already bumped (nexus-v9-5-models) so installed PWAs reload the new UI.
