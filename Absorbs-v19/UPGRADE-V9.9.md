# Nexus AI v9.9 — Image edit, working image chat, saved conversation, draft prompts

## New
- **Image editor** (Image Studio -> "تعديل" under every image): tap an element to mark it, then "احذف العنصر" (remove), "أعد تصميمه" (redesign) or "عدّل بالوصف" (free Arabic instruction). Undo history, download, save back to the studio.
  Server: `/api/ai/image` accepts `edit: { action, point }` (+ `reference` = the picture). Prompt builder: `buildEditPrompt` in `src/lib/image-gen.ts` (Arabic instruction is also sent with an English twin).
- **Chat -> images works**: "ولّد لي صورة ..." opens the Image Studio and starts generating at once (Pro). Before, the chat answered "image generation unavailable".
- **OpenRouter image engine** added after Gemini (`google/gemini-2.5-flash-image`, `google/gemini-3.1-flash-image-preview`), so images keep working when Gemini is busy.
- **OpenRouter Auto** in the model list: OpenRouter itself routes each question to the best model.
- **Conversation never restarts**: the open conversation id is saved (`nexus_active_conv`) and reopened when you come back from the studio / other pages or reopen the app. "New chat" clears it.
- **Prompt drafts**: when you ask for a prompt, the model puts it in a ```prompt block -> shown as a draft card with a copy button (`src/components/prompt-draft.tsx`).
- **Long-press / right-click on any message -> floating "نسخ" button.**
- **Instant replies UI**: the long "thinking" card + skeleton are replaced by three small typing dots; the system prompt now says "answer first, no preamble".
- **Security**: system prompt rules against prompt injection / secret leaks; new headers (COOP same-origin-allow-popups, X-Permitted-Cross-Domain-Policies, X-DNS-Prefetch-Control).

## Not type-checked here (no node_modules in the sandbox)
Run: `npm install && npm run typecheck && npm run dev`, then test: image generation, edit (remove / redesign), open studio -> back, close app -> reopen, long-press copy.
Cache: nexus-v9-9-studio

## Firebase (added)
`src/lib/firebase.ts` now lazy-loads, browser only, each failing silently:
- **Performance Monitoring** (always on)
- **App Check** with reCAPTCHA v3 — only when `NEXT_PUBLIC_FIREBASE_APPCHECK_KEY` is set (enable it in Firebase console -> App Check; do NOT enforce it before testing)
- **Analytics** + `trackEvent(name, params)` helper (events: image_generate, image_edit)
- **Remote Config** via `loadRemoteConfig()` (keys: announcement, image_edit_enabled, maintenance) — create the same keys in the console to control the app without redeploying
Already in the project: Auth (Google / email, persistent login), push via the app's own web-push API.
Not added (needs console rules + a decision): Firestore, Cloud Storage. Chat data stays in your PostgreSQL.

## Cloud Storage + Firestore (added)
- "حفظ" under every image -> uploads to Cloud Storage (`users/{uid}/images/...`) and indexes it in Firestore (`users/{uid}/images/{id}`); "صوري" in the studio header shows the saved gallery (newest 30) with delete. Code: `src/lib/firebase-cloud.ts`.
- **Required before it works:** in the Firebase console enable Firestore + Storage, then publish `firestore.rules` and `storage.rules`.
  The Firebase project in `firebase-config.ts` may be shared with other apps: MERGE these rules into the existing ones, never replace them.
- Limits: 5 MB per image, jpeg/png/webp only, each user reads/writes only their own folder.
