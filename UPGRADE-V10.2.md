# Nexus AI v10.2 — single model: Nexus 8 Pro
- MAX / Nexus 6 / Nexus 8 removed from the selector; one flagship "Nexus 8 Pro" (free accounts keep Nexus 4).
- Builder contract (src/lib/max-engine.ts) lighter and faster: games ~1500-3000 lines, rich coloured backgrounds, bosses, power-ups, touch+keyboard; MAX_OUTPUT_TOKENS 64k -> 40k; auto-continue rounds 40 -> 8.
- Every Pro build request uses ONE builder pass at low temperature + auto verify/repair (code-check).
- Images: Arabic/Darija requests are translated to a precise English description first (gender, action and subject kept), then sent to the image engine.
- Run `npm run typecheck && npm run lint` before deploying (node_modules not installed in this sandbox).
