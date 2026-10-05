# Barq v8.1 — MAX

## New
- **MAX engine** (`src/lib/max-engine.ts`, tier "MAX" in the chat model switch, Pro only)
  Forces the AI team on every message, 64k output budget, and a game/site-builder brief
  (Canvas / Three.js / Phaser from pinned cdnjs, modular structure, full physics, audio, save/load).
  The Studio mega builder (up to 150 files / 10 MB) uses the same brief for the plan and every file.
- **Orange Claude theme** — Settings → المظهر, or the sun/moon button in the header/sidebar.
  Animated peach background, remembered per device, applied before first paint (no flash).
- **V8 PRO GOLD** pill is now a real link to /app/upgrade (it used to sit inside the "/" landing link).
- **Command palette** — Ctrl/⌘+K (or the search button on phones): jump to any page, switch theme,
  or start one of 6 MAX build ideas (fills the chat box and switches to MAX).

## Glitches fixed
- 5 Tailwind glow shadows were silently broken (spaces inside `rgba(...)`): chat send button, user bubble, logo, game preview, arcade frame.
- "Continue cut answer" ignored the v8 brain (it fell back to the older prompt) — now keeps v8 / MAX.
- Leftover purple hover colour on ghost buttons.
- `.env.example`: duplicated `GEMINI_API_KEY` and a routing note that contradicted the real routing (Claude leads).
- Service-worker cache bumped (`barq-v8-max1`) so installed PWAs pick up the new look.

## Run
    npm install
    npm run typecheck
    npm run dev

---

# v8.2 — Voice Call (مكالمة صوتية)

Tap the headphones button in the chat box (Pro), or Ctrl/⌘+K -> "مكالمة صوتية مع برق".

## What it does
- Full-screen call: a living orb (listening / thinking / speaking colours, ring spectrum), live captions, call timer, screen kept awake.
- Hands-free loop: you speak -> pause -> it answers by voice -> it listens again by itself.
- The voice starts after the FIRST sentence (the answer is spoken while it is still being written).
- Tap the orb (or Space) to interrupt it, or to send what you said right now. Esc or the red button hangs up.
  Saying "وقف" / "مع السلامة" / "bye" / "au revoir" also hangs up.
- 6 personas: صاحبي, مدرّب, أستاذ, حكواتي, مترجم فوري, مقابلة عمل. Speech language: دارجة/عربي, Français, English.
- Code and long text: the model gives a short spoken summary and puts the full content in a code block; code blocks are NOT read aloud
  and are saved in the conversation, which opens in the chat when the call ends.
- Typed fallback (keyboard button) for browsers without speech recognition (e.g. Firefox).
- Voice, speed and pitch use the existing voice settings.

## Files
- src/components/voice/voice-call.tsx   the call screen
- src/lib/voice-call.ts                 voice system prompt, personas, hang-up phrases (shared by server + client)
- src/lib/voice.ts                      + createSpeechQueue (sentence-by-sentence TTS)
- src/app/api/ai/chat/route.ts          `voice: true` turn: Pro only, fast engine first, short answers, saved to history
- src/components/app/chat.tsx           headphones button opens the call (old inline talk mode removed)

## Notes
- Each spoken turn costs one credit like a chat message (Pro is unlimited).
- Speech recognition/synthesis are the browser's own (Chrome/Edge/Safari work best; voice quality for Arabic depends on the voices installed on the device).
