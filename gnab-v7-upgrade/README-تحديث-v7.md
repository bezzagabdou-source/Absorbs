# GNAB v7 upgrade (deployed 2026-10-19)
Live: https://gnab-final-v7.vercel.app — clean deployment dpl_8GgjcEpFv2QoHgHanDs2rF3baArV
Changed files (blob sha1 == sha1 of file content):
- src/lib/ai/registry.ts 3950f9b2 — +groq +pollinations providers, deep capability, 11 models
- src/lib/ai/system-prompt.ts fe55e2e7 — never-stop, 5000 lines, auto-fix, live clock, userText opt
- src/lib/code.ts 8c7dace9 — CODE_RULES never-stop/auto-fix/all-buttons/Pollinations media + codeKnowledge() + sizeDirective()
- src/app/(app)/call/page.tsx 3b088bfd — speak() via /api/voice/speak (Gemini TTS) + speechSynthesis fallback
- src/app/api/voice/token/route.ts 96eed9f9 — engine gemini-tts
- src/app/api/voice/speak/route.ts 43df21e8 — NEW Gemini TTS (Kore, WAV 24kHz)
- src/app/api/media/route.ts ea44bff1 — NEW Pollinations passthrough (text/image/embeddings/video)
Env: POLLINATIONS_API_KEY (sensitive) added on project prj_LiX1zfBsD9ohcM6eGsQKiUqDtX9b, verified live 200.
NOTE: v7 code.ts MUST keep exports codeKnowledge() and sizeDirective() (called by projects routes) and system-prompt SystemPromptOptions.userText.

Update 2026-10-19 (2): POLLINATIONS_API_KEY replaced with user new secret key (env id kJUz9Yml9WoMvGJM, sensitive, all targets) — verified live: polliDirect 200, /api/media 200, Gemini TTS speak 200 (148410 bytes), auth E2E 200. Clean production deployment: dpl_HqARymSDtuFcPAdpmGbRfPubTWhT (no tkx9, 404 verified).
