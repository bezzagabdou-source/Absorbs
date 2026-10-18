# GNAB AI — تحديث v6 الأخير (هذه هي النسخة المحدّثة، ليست القديمة)

هذه الحزمة فيها **6 ملفات فقط** — هي آخر ما تم تطويره ونشره بنجاح على الموقع الحي
**https://gnabdz.vercel.app**. باقي ملفات المشروع القديم (النسخة اللي عندك) تبقى كما هي بدون تغيير.

## طريقة الدمج (مهم)
انسخ كل ملف من هنا إلى **نفس المسار** داخل المشروع القديم واستبدل الملف الموجود:

| الملف هنا | يروح إلى |
|---|---|
| `src/lib/limits.ts` | نفس المسار في المشروع |
| `src/lib/ai/registry.ts` | نفس المسار |
| `src/lib/ai/system-prompt.ts` | نفس المسار |
| `src/lib/code.ts` | نفس المسار |
| `src/app/api/voice/token/route.ts` | نفس المسار |
| `src/app/(app)/call/page.tsx` | نفس المسار (مجلد جديد `call`) |

---

# INSTRUCTIONS FOR CLAUDE (redesign task)

You are redesigning the GNAB AI Next.js app. The 6 files in this package are the
**latest production code, already deployed and verified live**. The rest of the
project (the older zip the user gave you) is unchanged. Replace those 6 files at
their identical paths, then do the design work. **Do not rewrite their logic.**

## What changed in this update (do not undo)
1. **Voice call fixed** (`src/app/(app)/call/page.tsx` + `src/app/api/voice/token/route.ts`):
   The old Gemini Live voice was dead (provider quota). The new call page uses the
   **browser Web Speech API** (`webkitSpeechRecognition` lang `ar-SA` +
   `speechSynthesis` with an Arabic voice) talking to the existing `/api/chat`
   SSE stream. The token route now just returns `{ ok, mode: 'browser', plan }`.
   Keep this approach — no Gemini Live, no external keys.
2. **Free Pro for everyone** (`src/lib/limits.ts`): `getPlan()` returns `pro` for
   every user (rolling +7 days), and all plan limits are effectively unlimited
   (100000): messages, files, projects, voice, codeLines, huge contextChars.
   Note: verify its column references against `src/db/schema.ts` when you build.
3. **Strongest model registry** (`src/lib/ai/registry.ts`): strongest-first
   defaults — OpenRouter `anthropic/claude-sonnet-4.5`, Cerebras `gpt-oss-120b`,
   OpenRouter `deepseek/deepseek-chat-v3.1`, `moonshotai/kimi-k2`, Gemini
   `gemini-2.5-flash`, HF `Qwen/Qwen3-Coder-480B-A35B-Instruct`, Gemini
   `gemini-2.5-pro`. The router skips providers with missing/failing keys.
4. **Mega system prompt** (`src/lib/ai/system-prompt.ts`): genius rules, identity,
   design law, and a continuation protocol for ~10,000-line projects
   (end with "— الجزء التالي جاهز، اكتب: كمّل —", resume on "كمّل").
5. **Code generation** (`src/lib/code.ts`): `CODE_RULES` demands complete,
   big, multi-file static apps (index.html root, CDN-only, relative paths).

## Contracts you MUST NOT break
- Exports must stay exactly: limits.ts → `LIMITS, consume, getPlan, getUsage, refund, today`;
  registry.ts → `PROVIDERS, defaultRegistry, getRegistry` + types `Tier, Capability, ModelDef, ModelEntry`;
  router.ts imports `ModelDef`/`defaultRegistry` from `./registry` — keep them.
  system-prompt.ts → `DEVELOPER_NAME, buildSystemPrompt({mode, memories, customInstructions})`;
  code.ts → `CODE_RULES, MIME, extractJson` (**generic** `extractJson<T>`), `ownProject, reviewFiles, safePath, stripFences`.
- `DEVELOPER_NAME` must stay exactly `'Abdelrezak Bezzag'`. AI identity: GNAB AI,
  "طوّرني Abdelrezak Bezzag" — never name underlying models/providers.
- Chat API stays: POST `{conversationId?, action, content}` → SSE events
  `{type: meta|delta|done|error|phase|thinking}`. Streaming is already gradual
  server-side — the client must render deltas incrementally (typewriter feel),
  never wait for the full reply.
- Build: `npx next build --webpack`; keep `transpilePackages: ['firebase-admin']`
  and the `next.config.ts` `env:` block that overrides NEXT_PUBLIC_FIREBASE_*
  (project `gnab-ai`) — removing it breaks auth.
- Use `@/lib/...` alias imports in route files (relative `../../../lib/...` breaks the build).
- Keep all API routes, DB schema, and auth logic untouched.

## Your design mission
- Radically modern, gorgeous **light glassmorphism** UI, animated background,
  beautiful realistic bottom nav/buttons — Claude-desktop-level polish on ALL pages.
- **ABSOLUTELY NO purple/violet/pink or rainbow gradients, no glowing orbs** —
  nothing that looks "AI-generated". Clean light surfaces + ONE accent
  (azure/teal/emerald/amber), strong typography, subtle shadows.
- Settings page: organized Claude-style sections. **No fake/dead buttons** —
  every control must actually work or be removed.
- In-chat: when a website is generated, auto-open a live preview inside the chat
  with its live link; during code generation show a progress bar with file size
  that visibly fills.
- Maximum speed, zero breakage: type-check (`tsc`) must pass and the production
  build must succeed before you call it done.
