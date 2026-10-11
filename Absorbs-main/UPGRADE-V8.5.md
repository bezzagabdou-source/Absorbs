# v8.5 — never-stop builds + clear cloud voice

1. Building: while a site/game/app is generated, only the "thinking" card shows (no long message, no raw code). After it ends: result card (open / download / code).
2. Never stops: up to 12 automatic continuation rounds, survives dropped connections, screen kept awake while building.
3. Voice call: new /api/voice/tts. Order: ElevenLabs -> Gemini TTS -> browser voice. Next sentences download while the current one plays.
   Vercel env (optional): ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL, GEMINI_TTS_VOICE (Kore / Puck / Aoede).
4. Call screen: persona/language chips only appear when paused; bigger reply text.

## v8.5.1 — Gemini voice first
- /api/voice/tts now uses Gemini TTS first (your Google AI Studio key, nothing else to add). ElevenLabs is only a backup.
- A different Gemini voice per persona (friend Zephyr, coach Puck, teacher Kore, storyteller Charon, interpreter Aoede, interviewer Orus).
- Optional env: GEMINI_TTS_VOICE, GEMINI_TTS_MODEL, BARQ_TTS_FIRST=eleven.
