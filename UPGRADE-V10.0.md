# Nexus AI v10.0 — Video Studio, File Workspace, Persona Agents, neo-glass UI

Patch on top of v9.9 (nothing was rewritten: auth, billing, Firebase, Arabic UI, DB schema are untouched).

## New
- **Video Studio** `/app/studio/video` — real text-to-video. Engines: Replicate (`REPLICATE_API_TOKEN`) and Gemini Veo (`GEMINI_API_KEY`).
  Jobs are async: `POST /api/ai/video` starts, `GET /api/ai/video?provider=&id=` polls, so no request waits for the render.
  Veo files are streamed through `/api/ai/video/file` (needs the key; only `generativelanguage.googleapis.com` URIs are allowed).
  "حسّن الوصف" calls `/api/ai/optimize` (rewrites the prompt in English for the video model). Pro only, rate-limited.
- **File Workspace** `/app/workspace` — PDFs / images (sent natively), code, text, ZIPs (read in the browser) and up to 4 web links
  (server fetch with SSRF guard). Up to 140k chars are sent whole; bigger sets are chunked and ranked with BM25 (100k chars kept),
  answers cite parts like [D2·5]. Streams the reply. Code: `src/lib/workspace.ts`, `src/app/api/ai/workspace/route.ts`.
- **Persona agents** (tools menu + Ctrl+K): Coder, Copywriter, Designer, Data Analyst. Each has a silent prompt-optimizer protocol
  (`AGENT_CORE` in `src/lib/chat-modes.ts`) and a specialist rule set.
- **UI**: `neo-panel / neo-input / neo-chip / neon-ring` classes in `globals.css` (dark neumorphism, light-theme overrides, reduced-motion respected);
  command palette gets Video, Workspace and the four agents; Studio page links to both new tools.

## Not done on purpose
- No rewrite from scratch, no WebSocket layer (SSE-style text streaming already exists in `/api/ai/chat`), no OpenRouter video
  (no stable public video endpoint was verified).
- Not type-checked or built here (no node_modules / network in the sandbox).

## Run
```
npm install && npm run typecheck && npm run dev
```
Test: add `REPLICATE_API_TOKEN` or use Veo → /app/studio/video (enhance → create → play → download);
/app/workspace (PDF + zip + a link → ask → check citations); Ctrl+K → "وكيل المبرمج".

## v10.0 (part 2) — open to free, inline images, new look
- **Free accounts now get**: files/PDF/image upload, tool modes (Canvas, Deep Research, agents…), voice call + mic, image generation (fast engine, 10/min),
  all tools, Video Studio (1 render / 3 min), File Workspace. **Still Pro**: chat models v8 and MAX (and Grok/OpenRouter, memory, team engines).
  Free keeps the free-tier model strength; the Pro tier is used only when a picture/PDF is attached (only it can read files).
- **Images are drawn inside the chat** ("ولّد لي صورة ..."): `src/lib/inline-image.ts` + `img` renderer in `markdown.tsx` (blob URLs, download button).
  Arabic requests are translated for FLUX engines and Arabic text inside pictures gets an exact-spelling directive (`buildImagePrompt`).
- **Removed** the long "فريق الذكاء…" message (and the ✅ progress lines) in `gemini.ts`; team drafting wait 55s → 30s.
- **Three typing dots → a spinning aurora ring + sweep bar** (`think-orb`, `think-bar`).
- **Call button**: animated waveform pill (`call-button.tsx`), ring pulse while in a call.
- **New skin "midnight aurora"** (dark theme only): ink base, drifting indigo/terracotta/teal aurora, dot grid; light theme untouched.
- Cost note: free image/video/workspace calls use your API keys. Tune the limits in `api/ai/image|video|workspace/route.ts`.
