# Nexus AI v8.4 v9 — Master Upgrade

Run after unzipping:

    npm install        # adds katex, rehype-katex, remark-math, rehype-highlight
    npm run typecheck
    npm run dev

## New files
- src/components/ui/skeleton.tsx            Skeleton, MessageSkeleton, ListSkeleton (shimmer)
- src/components/ui/glass-card.tsx          GlassCard (blur, glow, staggered entrance)
- src/components/chat/code-block-action.tsx code header: language tag, copy, download, wrap, open in panel
- src/components/chat/artifacts-panel.tsx   side panel: HTML / React / JS (live run + console) / SVG / Markdown
- src/components/chat/artifacts-context.tsx context + type detection
- src/components/chat/voice-recorder.tsx    VoiceRecorder (speech-to-text) + VoiceSettings (voice, speed, pitch)
- src/components/chat/export-menu.tsx       export menu: Markdown / PDF
- src/components/chat/drop-overlay.tsx      drag & drop for the whole chat
- src/lib/voice.ts                          Web Speech engine (STT + TTS, saved prefs)
- src/lib/export.ts                         Markdown + PDF export (print to PDF, Arabic-safe)

## Changed files
- markdown.tsx (KaTeX math, syntax highlighting, scrollable tables), code-block.tsx (re-export)
- chat.tsx (skeleton while waiting, VoiceRecorder, VoiceSettings, ExportMenu, drag & drop)
- app/app/page.tsx (ArtifactsProvider), globals.css (dark variant, hljs + KaTeX styles), layout.tsx (class="dark")
- package.json (4 new deps)

Notes: artifacts panel, voice, attachments and export stay Pro-only, same as before.
Single "$" is not treated as math, so prices like $5 stay plain text; use $$...$$ for formulas.

## v9.1 — task routing (each AI does what it is best at)
- src/lib/task-router.ts classifies every message: code / reasoning / creative / vision / writing / quick / general
- Claude: code architecture + final merge · DeepSeek: math, logic, algorithms · Grok: creative ideas
  Gemini: images/PDF, long context, Arabic · Groq: instant short answers · OpenRouter: free fallback + second opinion
- In the AI team each engine receives its own specialty instructions, the best engine for the task merges the result,
  and fallbacks are ordered by task. Images/PDFs only go to engines that can read them (Gemini, Claude).
- Turn off with BARQ_ROUTING=off. Add keys in .env.local / Vercel (see .env.example). Never put keys inside the zip.

### v9.2 — (superseded by v9.3: Claude is no longer primary)
- Pro chat now starts with the strongest engine whose key exists (Claude first; DeepSeek for math, Grok for creative, Groq for short replies).
  Gemini is the safety net and the engine for the free tier. Without an Anthropic key the next engine in the list leads.
- Change the order in src/lib/task-router.ts (ORDER) or force one with BARQ_LEAD in the AI team.

### v9.3 — build fix + Hugging Face
- Fixed Vercel type error in glass-card.tsx (children typed as ReactNode, not MotionValue).
- Claude is no longer primary: Gemini leads, DeepSeek leads math/logic, Grok leads creative. Claude is a backup.
- New src/lib/huggingface.ts: add HF_TOKEN in Vercel → Environment Variables → Redeploy. Optional HUGGINGFACE_MODEL.

### v9.4 — pre-publish hardening
- /api/ai/status: public callers only get {ok}; full diagnostics and the paid ?test=1 run need header x-admin-secret (ADMIN_SECRET).
- package.json version synced to 9.3.0; task-router comment matches the real engine order.
- .gitignore now excludes PRO-CODES-V*.txt — never commit the activation-codes list.

### v9.4 — better websites (prompt fix)
Root cause of weak sites: the build prompt was a GAME spec applied to everything (locked 100vh/overflow:hidden, MENU→PLAYING state machine, forced neon-dark-glass look, 5000-line minimum), and the merge step blended the drafts' different styles.
- prompts.ts: new SITE_SPEC (design tokens, one aesthetic direction, never-clipped nav, inline-SVG icons/logo, 360px self-check). Games keep the game spec. Landing/UI tools use SITE_SPEC.
- prompts.ts: depth contract = games 5000+ lines; sites "quality beats length".
- gemini.ts: merge keeps ONE draft's design as base instead of mixing palettes; EPIC rules no longer force 3000 lines on sites.

### v9.4 — Studio mode (each AI plays one role)
For website / web-app / landing requests (Pro chat + landing-builder + ui-designer tools) the team no longer writes 5 full drafts and blends them. Instead:
- 🧱 Architect (DeepSeek → HF → Claude → Gemini): structure, data model, interactions, 360px plan, pitfalls
- 🎨 Art director (Grok → Gemini → Claude → HF): tokens/palette, type, layout, signature visual, motion
- ✍️ Copywriter (Gemini → Claude → Grok → HF): all final text + real data items
- 🛠️ Lead builder (BARQ_LEAD or the code order, Gemini first): writes the final single-file site following the 3 briefs
With fewer engines one engine plays several roles; a failed role is retried once on another engine; if all briefs fail it falls back to the old flow. Games and image-attached requests keep the classic draft-and-merge team.
Files: src/lib/site-team.ts (new), gemini.ts (studio branch in ensembleStream), api/ai/tool/route.ts.

## v10 — Mega projects (up to 100 files / 5 MB in one ZIP, never stops)
Where the old ~80 KB ceiling came from: a site/game was ONE html file written in ONE answer (token cap), and the
"continue" rounds only re-read the last 90 KB of what was written. Mega mode removes that ceiling by writing every
file in its own request.

- New tab in Studio → Build: «مشروع ضخم (ZIP)» (Pro only; costs ONE credit for the whole project).
- Flow: architect plans file tree + shared "contract" → each file is generated in its own request (3 in parallel,
  respecting `needs` order, index.html last) → auto retries (4×) → ZIP + quick preview.
- Never stops: retries, waits for the network to come back, resumes after closing the app (finished files are kept in
  the browser's IndexedDB), keeps the screen awake, «متابعة» / «أعد المحاولة» buttons.
- Limits live in src/lib/mega.ts: MEGA_MAX_FILES = 100, MEGA_MAX_TOTAL = 5 MB, MEGA_MAX_FILE = 400k chars.
- New files: src/lib/mega.ts, src/lib/mega-client.ts, src/app/api/ai/mega/route.ts, src/components/studio/mega-builder.tsx
- Changed: studio/build/page.tsx (tab), gemini.ts + chat route (continuation window 90 KB → 170 KB).
- Output is plain static files (classic <script>, no modules) so it opens from file:// with no build step.
- No new dependencies and no new env vars. Vercel: the route uses maxDuration 300 like the others.

## v8 Pro engine prompt (added)
- prompts.ts → V8_PRO_ENGINE appended to BUILD_SYSTEM_PRO: data-component tagging, BARQ-RULES memory comment inside the file, targeted-edit rule, template depth, sandbox contract.
- Build page: ⚡ starter kits (SaaS Dashboard / digital store / AI landing page) launch the build in one tap (Pro).

## Precision patch (added)
- Visual editor: click an element → new box «عدّل هذا العنصر بالذكاء الاصطناعي» (Pro). Only that element (outerHTML ≤ 12 KB) is sent
  with the BARQ-RULES + :root tokens to POST /api/ai/patch; the reply {html, css} replaces just that element in the preview and in the export.
- New: src/app/api/ai/patch/route.ts · Changed: src/components/studio/workbench.tsx
- Patch CSS goes into <style id="barq-patch">; <script>, @import and remote url() are stripped server-side.

## One-click deploy (added)
- Studio toolbar «نشر» now opens a panel: Vercel (production deployment) or GitHub (new PRIVATE repo, all files in one commit). Netlify Drop stays as the no-token fallback.
- The user's own token is typed in the panel (optionally kept in localStorage on that device) and sent over HTTPS to POST /api/deploy only for the operation — never stored or logged server-side.
- New: src/app/api/deploy/route.ts, src/components/studio/deploy-panel.tsx · Changed: workbench.tsx. Limit: 100 files / 3.5 MB per deploy.
