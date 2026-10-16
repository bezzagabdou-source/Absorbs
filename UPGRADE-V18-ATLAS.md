# Nexus AI v18 — ATLAS

What this upgrade adds, where it lives, and how to prove it works.

v18 is not a coat of paint: it gives the assistant a **verified knowledge base**,
a **real file factory** (preview · download · ZIP · share link), an **internet
engine** that fetches media and documents on its own, a **human voice call with
30 switchable voices**, an **art-directing image engine**, and a **control centre
with 100+ knobs**. Everything is wired — no feature flags, no new required env
vars.

Identity, fixed everywhere and impossible to override by a prompt:
> طوّرني المطوّر **abdelrezakbezzag** من الجزائر 🇩🇿، وأنا من تصميم شركة جزائرية يقودها abdelrezakbezzag.

---

## 1 · قاعدة المعرفة الضخمة — ATLAS KB (`src/lib/kb/`)

A dependency-free, deterministic retrieval engine + a curated corpus. It runs in
the browser, in the API route and in the Node test script from the **same files**.

| | |
|---|---|
| **Corpus** | `data.ts` (50 entries) + `data-atlas.ts` (13 entries) = **63 entries**, 16 categories, **1 526 tags**, ≈18 000 words, ≈75 KB — every entry titled in `ar` + `fr` + `en` |
| **Domains** | 🇩🇿 الجزائر والإدارة · 🎓 الدراسة · 🏢 الأعمال · 💳 المال · ⚖️ القانون · 🩺 الصحة · 💼 العمل · 💻 التقنية · 🤖 الذكاء الاصطناعي · 🎨 التصميم · 🔤 اللغات · ✈️ السفر · 🏠 الحياة اليومية · 🔬 العلوم · 🕌 الدين · ⚡ عن Nexus |
| **Entry shape** | `id`, `category`, `title{ar,fr,en}`, `summary`, `body` (markdown), `tags[]`, `facts[]` (exact numbers), `source{name,url}`, `reliability 1-5`, `updated`, `weight 0-100` |
| **Engine** | normalisation for Arabic (diacritics, أ/إ/آ→ا, ة→ه, Arabizi) → inverted index → TF-IDF → strong-tag boost ×2.6 → phrase bonus +3.5 → fuzzy floor → priors from `weight`/`reliability`. **< 5 ms per query**, explainable (`matched[]`, `score`) |
| **Output** | `kbAnswer()` builds the exact prompt block injected into the system prompt; `kbNeeds()` decides when the KB is worth consulting at all |

`kbSelfCheck()` enforces corpus integrity: unique ids, ≥ 5 tags per entry, known
category. It is exposed as `GET /api/kb?check=1` and run by `npm run test:kb`.

**API** — `GET /api/kb` (public, read-only): `?q=` search · `?cat=` filter ·
`?id=` one entry · `?all=1` whole corpus · `?check=1` self-test.
**UI** — `/app/knowledge`: live search, category chips, expandable entry with its
facts, source, last-verification date, tag cloud and «اسأل Nexus».

**Where it is used**

- `src/app/api/ai/chat/route.ts` — `buildAtlasContext()` puts the top KB hits in
  the system prompt of every turn (skippable with `kb:false`), and answers
  `x-atlas-kb: <ids>` so the client can show what was used.
- `src/lib/agent-engine.ts` — the `knowledge_search` tool (with category
  validation) is now the planner's **first** move, before `web_search`.
- `src/lib/atlas-constitution.ts` — the identity answers, the voice contract and
  the ATLAS thinking protocol.

---

## 2 · خزنة البيانات — VAULT (`src/lib/kb/vault*.ts`, `GET|POST|DELETE /api/vault`)

The user's own corpus. Upload a file, paste text, or give a URL: the server
extracts the text (PDF, DOCX, XLSX, ZIP listing, plain text — `src/lib/net/extract.ts`,
zero dependency), chunks it and indexes it with the same engine as the KB.

- Quotas: **25 documents free / 120 Pro**, 25 MB per upload.
- Retrieved chunks are injected as `[D#·#]` references so the model can cite the
  user's own data instead of guessing; the agent reaches it with `vault_search`.
- `invalidateVault(uid)` clears the per-user index cache on every write.

---

## 3 · محرك الإنترنت — INTERNET ENGINE (`src/lib/net/`)

The user asked for internet access **built into the programming**: when a request
implies «زيدلي صور», «جيب صوت», «نزّل هذا الملف», Nexus goes and gets it.

| module | what it does |
|---|---|
| `net/fetch.ts` | `netFetch()` — SSRF-guarded fetch (public hosts only), size caps, timeouts, kind detection (`text/image/audio/pdf/docx/zip/json/csv/binary`), returns `{ok,url,finalUrl,status,kind,mime,bytes,ms,title,text,dataUrl,entries}`. Plus `wantsInternet()` / `wantedAssetKind()` / `urlsIn()` intent detection in Arabic, Darija, French and English |
| `net/media.ts` | `findMedia({query,kind,limit})` over **Openverse**, **Wikimedia Commons** and **Internet Archive** — all keyless — plus Pixabay / Pexels / Freesound when their keys exist. Every asset carries `license`, `author`, `attribution`, `page`. `attributionLine()` / `mediaBlock()` turn results into a prompt block with credits |
| `net/extract.ts` | `extractText()` — PDF text streams, DOCX/XLSX (unzip + XML strip), ZIP listing, scanned-PDF detection (returns an Arabic note asking for vision instead) |

**API**

- `GET|POST /api/internet/fetch` — read a URL (60 req/min; 40 MB Pro / 12 MB free).
- `GET /api/internet/media?q=&kind=&limit=` — search free-licensed media.
- `POST /api/internet/media {url,kind,save}` — download it server-side, return a
  data URL for preview, and optionally store its text in the vault.

**Where it is used** — the chat route runs the asset search automatically for
non-voice turns when `wantsInternet()` fires and `body.internet !== false`; the
agent has `internet_fetch`, `find_media` and `download_file`; **`/app/media`** is
the same engine as a screen (preview, download, save to vault, open source).

---

## 4 · مصنع الملفات — FILE FACTORY (`src/lib/atlas-files.ts`, `zip-server.ts`, `/api/files`)

Every deliverable becomes a real file with a real preview, **inside the chat**.

```
src/components/chat/file-card.tsx   ← the card rendered under every code block
  معاينة  ·  تنزيل  ·  ZIP  ·  رابط  ·  حفظ في ملفاتي  ·  من السيرفر
```

- **`FileCard`** appears under any fenced block whose language/content is a real
  deliverable (`html`, `svg`, `markdown`, `json`, `csv`, ≥ 160 chars) — wired in
  `src/components/chat/code-block-action.tsx`.
- **Preview** opens full-screen in the chat layer: HTML/SVG render in a sandboxed
  iframe (`allow-scripts allow-forms allow-popups allow-modals`, CSP injected with
  `connect-src 'none'`), other formats render in a reader.
- **ZIP** uses `src/lib/zip-server.ts` (server) or `src/lib/zip.ts` (client):
  `createZipBuffer(items, comment)` — raw-deflate for text > 128 B, store for
  binary, CRC32 table, UTF-8 name flag, EOCD comment
  «Nexus AI v18 ATLAS — by abdelrezakbezzag (Algeria)».
- **Share link** — `GET /api/files/deliver/[id]` with `?mode=preview|download`,
  `?zip=1`, `?meta=1`. `private` files need the owner's token, `unlisted` files
  work for anyone with the link. Served with a unique-origin `sandbox` CSP (no
  `allow-same-origin`), `nosniff`, `no-referrer`, RFC 5987 `filename*`.
- **Storage** — `barq.atlas_files` (id, user, conversation, title, kind, filename,
  mime, content, bytes, extras jsonb, visibility, views, downloads, created_at).
  Quotas **400 free / 5 000 Pro**, 6 MB per file.
- **`/app/files`** — the vault: stats, kind filters, search, preview, download,
  ZIP, copy link, delete one or all.
- **Agent** — `save_file` writes a deliverable straight into `barq.atlas_files`
  and returns its preview/download URLs in the observation.

---

## 5 · المكالمة الصوتية — VOICE (`src/lib/voice-catalog.ts`, `tts.ts`, `/api/voice/tts`)

| | |
|---|---|
| **Voices** | **30** curated Gemini prebuilt voices, each characterised: gender, mood, `arabic/french/english` 1-5 proficiency, best use, emoji, ElevenLabs equivalent |
| **Personas** | `PERSONA_VOICES` gives every call persona a masculine + feminine voice (friend → Schedar/Aoede, coach → Fenrir/Zephyr, teacher → Alnilam/Kore, storyteller → Charon/Gacrux, interpreter → Orus/Aoede, interviewer → Algieba/Autonoe) |
| **Emotions** | 10 presets (طبيعي، ودّي، متحمّس، هادئ، جاد، همس، مذيع أخبار، حكواتي، معلّق رياضي، حزين) → a spoken-direction prompt, not a filter |
| **Latency** | `POST /api/voice/tts {text,voice,lang,mood,rate,emotion,stream}` — with `stream:true` the first audio chunk leaves before generation ends (chunked WAV header, no `Content-Length`); `x-barq-tts-ms` reports the real time and the call UI shows it live |
| **Fallback** | Gemini → ElevenLabs (if keyed) → browser voice, with a 12-failure circuit breaker in `src/lib/voice.ts` |

`src/components/voice/voice-call.tsx` now has an in-call **voice studio**
(🌊 button): gender/mood filters, 30-voice grid with proficiency dots, emotion
chips, speed slider, current engine + measured latency — and the choice is
remembered (`barq_call_voice_v18`, synced to `barq.atlas_prefs`). The
`ATLAS_VOICE_CONTRACT` plus the caller's mood/voice are appended to the voice
system prompt, and `barq.atlas_voice` logs voice, turns, duration, latency and
engine — **never any audio**.

---

## 6 · محرّك التصميم — ATLAS ART DIRECTION (`src/lib/atlas-image.ts`)

What separates a great image engine from an average one is the *brief*.
`planScene()` reads the raw request (Arabic, Darija, French, English, mixed,
misspelled) and recognises **21 scenes**: poster, logo, branding, product, food,
portrait, fashion, landscape, architecture, interior, tech, science, religious,
sport, animal, vehicle, kids, celebration, abstract, comic, generic.

Each scene carries a full art-direction paragraph (composition, shot, lighting,
palette, materials, typography) **and its own negative list**. On top of that:

- **Algerian context** detection (القصبة، كاراكو، كسكسي، تمنراست، مقام الشهيد…) →
  «authentic, modern, dignified — never a tourist cliché».
- **Typography** detection («كتب…», «عنوان», quotes) → layout block reserved for
  the text, RTL lettering rules, plus `ARABIC_NEGATIVE`.
- **Design deliverables** (logo/poster/branding) are forced out of photorealism
  into vector/layout language.
- `suggestFraming()` picks the aspect ratio that suits the scene when the user
  did not choose one (poster → 3:4, landscape → 16:9, logo → 1:1…).

All of it is injected by `buildImagePrompt()` in `src/lib/image-gen.ts`, which
already routes to the strongest Gemini image models when real Arabic lettering
must appear inside the picture. `npm run test:image` checks 15 real requests
(Arabic/Darija/French) against their expected scene — **15/15**.

---

## 7 · مركز التحكم — CONTROL CENTRE (`/app/control`, `src/lib/prefs*.ts`)

One typed, versioned preference object (`PREFS_VERSION = 18`) with **8 groups and
100+ knobs**, validated and clamped server-side (`normalizePrefs`) so stored or
synced values can never break the app.

| group | knobs |
|---|---|
| `appearance` | theme (lumen/noctis/midnight/aurora/system), accent (7 colours), density, fontScale, animations, particles, glass, glow, reducedMotion, wallpaper (aurora/mesh/stars/none) |
| `voice` | engine, voice, voiceF, lang, rate, pitch, style, persona, autoSpeak, streamPlayback, bargeIn, vadSensitivity, subtitles, callGreeting, noiseSuppression, echoCancellation, autoGain, soundFx |
| `ai` | tier, persona, thinking (instant→titan), length, temperature, language (incl. **darija**), webAuto, kbAuto, vaultAuto, memoryAuto, artifactsAuto, imageAuto, followUpChips, codeStyle, safety, autoVerify, showReasoning, streaming |
| `internet` | enabled, searchProvider, maxResults, readPages, autoFetchUrls, downloadMedia, maxDownloadMb, allowed/blocked domains, citeSources, safeSearch |
| `files` | autoPreview, saveToVault, defaultFormat, naming, autoZipMulti, publicLinks, keepHistory, maxHistory |
| `privacy` | cloudSync, saveTranscripts, telemetry, analyticsVoice, personalizedAds |
| `a11y` | highContrast, dyslexicFont, largeTargets, screenReaderHints, autoContrastText |
| `lab` | council, agentMode, smithInstant, commandPalette, offlineKit, betaModels, devPanel |

**How it travels**

1. `PrefsProvider` (`src/lib/prefs-context.tsx`, mounted in `src/app/app/layout.tsx`)
   loads localStorage on first paint, then pulls the server copy and turns prefs
   into `data-theme` / `data-accent` / `data-density` / `data-wallpaper` +
   `--nx-accent-from|to|ring` + `a11y-*` / `no-*` classes on `<html>`.
2. Every change is debounced 700 ms to `POST /api/prefs` → `barq.atlas_prefs`.
3. `chatPrefsPayload()` rides along with **every** chat turn; the server turns it
   into explicit directives via `userPrefsAddon()` («THINKING DEPTH: titan»,
   «ANSWER LENGTH: exhaustive», «LANGUAGE: Algerian Darija», «CODE STYLE:
   complete file», «SELF-CHECK before sending»…).
4. `THEME_BOOT_SCRIPT` (`src/lib/theme.ts`) applies theme + accent **before first
   paint**, so there is no flash and no wrong-colour frame.

**Design system additions** (`src/app/globals.css`, ~310 lines, all additive):
accent variables, three complete looks (Noctis warm-dark, Midnight OLED, Aurora
animated), four wallpapers, density via root font-size, effect kill-switches
(`no-animations`, `no-particles`, `no-glass`, `no-glow`), accessibility classes,
`nx-range` slider, `atlas-file-card` sweep animation, `atlas-hero` /
`atlas-grid-item` / `atlas-fade-up`.

---

## 8 · الوكيل — 6 ATLAS tools (`src/lib/tools.tsx`, `src/lib/agent-engine.ts`)

`knowledge_search` · `vault_search` · `internet_fetch` · `find_media` ·
`download_file` (fetch → extract → store in the vault) · `save_file` (write a
deliverable into `barq.atlas_files` and return its URLs).

Schemas live in `AGENT_TOOL_SCHEMAS`, executors in `AGENT_TOOL_EXECUTORS`, and the
planner discovers them automatically through `agentFunctionSchemas()` → `%TOOLS%`
in `AGENT_SYSTEM`. New rules added there: **ATLAS FIRST** (KB before web),
**INTERNET ENGINE** (never invent a URL), **VAULT** (`[D#·#]` citations),
**FILE FACTORY** (deliverables via `save_file`).

---

## 9 · Database (`src/db/schema.ts` + `src/db/ensure-schema.ts`)

Four new tables, created idempotently on first use (both files are edited in
lockstep — `ensure-schema.ts` holds the raw DDL):

| table | purpose |
|---|---|
| `barq.atlas_prefs` | `user_id` PK, `prefs` jsonb, `updated_at` |
| `barq.atlas_docs` | the user vault: name, origin, source, text, bytes, created_at |
| `barq.atlas_files` | the file factory (see §4) |
| `barq.atlas_voice` | call telemetry: voice, lang, turns, duration_ms, latency_ms, engine |

---

## 10 · API surface added in v18

| route | methods | notes |
|---|---|---|
| `/api/kb` | GET | public read-only KB: `q`, `cat`, `id`, `all`, `check`, `limit` |
| `/api/vault` | GET POST DELETE | auth'd; upload / paste / URL; quotas 25 · 120 |
| `/api/internet/fetch` | GET POST | SSRF-guarded reader; 60 req/min; 40 MB · 12 MB |
| `/api/internet/media` | GET POST | media search + server-side download (+ save to vault) |
| `/api/files` | GET POST DELETE | the vault: list, save fenced code, delete one / all |
| `/api/files/deliver/[id]` | GET | `mode=preview\|download`, `zip=1`, `meta=1`; sandboxed CSP |
| `/api/prefs` | GET POST DELETE | sync the control centre across devices |
| `/api/voice/tts` | GET POST | GET = voice catalog; POST = streamed/buffered speech |

Response headers on chat: `x-nexus: v18-atlas`, `x-atlas-kb`, `x-atlas-vault`,
`x-atlas-assets`.

---

## 11 · How to verify

```bash
npx tsc --noEmit          # 0 errors
npx next build            # production build, every route above present
npm run test:kb           # 63 entries · self-check · 8 must-hit queries · 10 samples
npm run test:kb:json      # same, machine-readable
npm run test:image        # 15 real requests → expected scene (15/15)
npm run smoke:smith       # unchanged from v17
```

`npm run test:kb` compiles `src/lib/kb/*` to CommonJS in a temp dir (rewriting the
`@/` aliases), then exercises the **real** engine: `kbSelfCheck()`, `kbStats()`,
`kbSearch()` and `kbAnswer()`. It fails (exit 1) if the corpus is inconsistent or
if any must-hit query misses — including the Darija and typo cases:

```
✅ "شكون صنعك"        → nexus-identity (1)      ✅ "cnie"     → dz-cnie (1)
✅ "باك"              → science-math-bac (1)    ✅ "permis"   → dz-permis (1)
✅ "g50"              → dz-taxe (1)             ✅ "auto entrepreneur" → dz-auto-entrepreneur (1)
✅ "البطاقة الذهبية"   → dz-payment-online (1)   ✅ "prompt"   → tech-prompt-engineering (1)
```

---

## 12 · Env vars (all optional — everything degrades gracefully)

`DATABASE_URL` · `GEMINI_API_KEY` · `GEMINI_TTS_VOICE` / `GEMINI_TTS_MODEL` ·
`ELEVENLABS_API_KEY` / `_VOICE_ID` / `_MODEL` · `BARQ_TTS_FIRST` ·
`OPENROUTER_API_KEY` · `NEXT_PUBLIC_REALTIME_WS` · `NEXT_PUBLIC_SITE_URL` ·
`ADMIN_SECRET` · `CHARGILY_*` · search keys · `PIXABAY_KEY` · `PEXELS_API_KEY` ·
`FREESOUND_TOKEN`.

Openverse, Wikimedia Commons and Internet Archive need **no key**, so the media
engine works on a bare deployment.

---

## 13 · Guardrails kept from v17 (do not undo)

- `src/lib/prompts.ts` — `CHAT_SYSTEM*` / `BUILD_SYSTEM_PRO` are consumed by
  `.replace()` in the MAX engine; ATLAS text is **appended**, never edited there.
- `src/lib/theme.ts` stays the single source of theme truth; `lumen` remains the
  default look and the light design is untouched unless the user opts in.
- The artifact sandbox CSP bridge `{__barq:1,t,a}` in `artifacts-panel.tsx` is
  preserved — `FileCard` is additive, it does not replace the artifact panel.
- All new previews run without `allow-same-origin` and with `connect-src 'none'`.
