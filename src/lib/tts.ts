/**
 * NEXUS ATLAS — محرك الصوت الواقعي (v18)
 * ---------------------------------------------------------------------------
 * Server-side text-to-speech built for LIVE calls:
 *   1. Gemini TTS  (prebuilt human voices, `:streamGenerateContent` so the
 *                   first audio chunk leaves the server in ~300-600 ms)
 *   2. ElevenLabs  (flash model, optional, when ELEVENLABS_API_KEY is set)
 *   3. the browser's own voice (client-side fallback, handled in @/lib/voice)
 *
 * Everything here is engine-agnostic: the route only chooses a provider and
 * pipes bytes, so adding a new voice engine is a single function.
 */
import { getGeminiKey } from "@/lib/gemini";
import { VOICE_IDS, ttsStylePrompt, emotionPrompt, type VoiceMood } from "@/lib/voice-catalog";

export type TtsRequest = {
  text: string;
  /** Gemini prebuilt voice name */
  voice?: string;
  /** ar | fr | en (auto-detected when missing) */
  lang?: string;
  mood?: VoiceMood | string;
  rate?: number;
  emotion?: string;
  conversational?: boolean;
};

export type TtsResult =
  | { ok: true; engine: "gemini" | "eleven"; mime: string; bytes: Uint8Array; voice: string; ms: number }
  | { ok: false; engine: string; reason: string };

const cleanKey = (v: string | undefined): string => (v ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();

export function detectTtsLang(text: string, forced?: string): string {
  const f = (forced ?? "").slice(0, 2).toLowerCase();
  if (f === "ar" || f === "fr" || f === "en") return f;
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/\b(le|la|les|des|est|une|que|pour|dans|avec|vous|bonjour|merci)\b/i.test(text)) return "fr";
  return "en";
}

/** Wraps raw 16-bit mono PCM in a WAV header so every browser can play it. */
export function pcmToWav(pcm: Uint8Array, rate = 24000): Uint8Array {
  const buf = Buffer.from(pcm);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + buf.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(buf.length, 40);
  return new Uint8Array(Buffer.concat([h, buf]));
}

async function withTimeout(url: string, init: RequestInit, ms: number, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Keeps only the spoken text: no markdown, no URLs, no emoji names. */
export function sanitizeForSpeech(text: string, max = 900): string {
  return (text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!?[[\]]?\([^)]*\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>|~]+/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function geminiModels(): string[] {
  const env = cleanKey(process.env.GEMINI_TTS_MODEL);
  const list = env
    ? [env, "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"]
    : ["gemini-2.5-flash-preview-tts", "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];
  return Array.from(new Set(list.filter(Boolean)));
}

/** One-shot Gemini TTS (used for short lines and as the streaming fallback). */
export async function geminiTts(req: TtsRequest, signal?: AbortSignal): Promise<TtsResult> {
  const started = Date.now();
  const key = getGeminiKey();
  if (!key) return { ok: false, engine: "gemini", reason: "NO_KEY" };
  const text = sanitizeForSpeech(req.text);
  if (!text) return { ok: false, engine: "gemini", reason: "EMPTY" };
  const voice = VOICE_IDS.includes(req.voice ?? "") ? (req.voice as string) : cleanKey(process.env.GEMINI_TTS_VOICE) || "Zephyr";
  const lang = detectTtsLang(text, req.lang);
  const style = ttsStylePrompt({
    lang,
    mood: req.mood,
    rate: req.rate,
    emotion: emotionPrompt(req.emotion ?? "") || req.emotion,
    conversational: req.conversational,
  });

  for (const model of geminiModels()) {
    try {
      const r = await withTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${style}\n\nTEXT:\n${text}` }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
            },
          }),
        },
        20_000,
        signal
      );
      if (!r.ok) {
        if (r.status === 429 || r.status >= 500) await new Promise((res) => setTimeout(res, 350));
        continue;
      }
      const j = (await r.json()) as {
        candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
      };
      const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      const b64 = part?.inlineData?.data;
      if (!b64) continue;
      const rateMatch = /rate=(\d+)/.exec(part?.inlineData?.mimeType ?? "");
      const wav = pcmToWav(new Uint8Array(Buffer.from(b64, "base64")), rateMatch ? Number(rateMatch[1]) : 24000);
      if (wav.length < 500) continue;
      return { ok: true, engine: "gemini", mime: "audio/wav", bytes: wav, voice, ms: Date.now() - started };
    } catch {
      /* next model */
    }
  }
  return { ok: false, engine: "gemini", reason: "FAILED" };
}

/**
 * Streaming Gemini TTS: yields WAV-ready byte chunks as they arrive, so the
 * client starts playing before the model finished speaking the sentence.
 */
export async function* geminiTtsStream(req: TtsRequest, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
  const key = getGeminiKey();
  if (!key) return;
  const text = sanitizeForSpeech(req.text, 600);
  if (!text) return;
  const voice = VOICE_IDS.includes(req.voice ?? "") ? (req.voice as string) : cleanKey(process.env.GEMINI_TTS_VOICE) || "Zephyr";
  const lang = detectTtsLang(text, req.lang);
  const style = ttsStylePrompt({
    lang,
    mood: req.mood,
    rate: req.rate,
    emotion: emotionPrompt(req.emotion ?? "") || req.emotion,
    conversational: req.conversational,
  });

  for (const model of geminiModels()) {
    try {
      const r = await withTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${style}\n\nTEXT:\n${text}` }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
            },
          }),
        },
        25_000,
        signal
      );
      if (!r.ok || !r.body) continue;
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let headerSent = false;
      let produced = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload) as {
              candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
            };
            const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
            const b64 = part?.inlineData?.data;
            if (!b64) continue;
            const pcm = new Uint8Array(Buffer.from(b64, "base64"));
            if (!pcm.length) continue;
            if (!headerSent) {
              const rateMatch = /rate=(\d+)/.exec(part?.inlineData?.mimeType ?? "");
              yield wavHeader(rateMatch ? Number(rateMatch[1]) : 24000);
              headerSent = true;
            }
            produced = true;
            yield pcm;
          } catch {
            /* partial JSON line — ignore */
          }
        }
      }
      if (produced) return;
    } catch {
      /* next model */
    }
  }
}

/** 44-byte WAV header with an open-ended data size (streamed playback). */
export function wavHeader(rate = 24000): Uint8Array {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(0xffffffff, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(0xffffffff, 40);
  return new Uint8Array(h);
}

/** ElevenLabs (optional second engine — flash model for low latency). */
export async function elevenTts(req: TtsRequest, signal?: AbortSignal): Promise<TtsResult> {
  const started = Date.now();
  const key = cleanKey(process.env.ELEVENLABS_API_KEY);
  if (!key) return { ok: false, engine: "eleven", reason: "NO_KEY" };
  const text = sanitizeForSpeech(req.text);
  if (!text) return { ok: false, engine: "eleven", reason: "EMPTY" };
  const voice = cleanKey(process.env.ELEVENLABS_VOICE_ID) || "EXAVITQu4vr4xnSDxMaL";
  const model = cleanKey(process.env.ELEVENLABS_MODEL) || "eleven_flash_v2_5";
  try {
    const r = await withTimeout(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64&optimize_streaming_latency=4`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: { stability: 0.4, similarity_boost: 0.85, style: 0.3, use_speaker_boost: true },
        }),
      },
      15_000,
      signal
    );
    if (!r.ok) return { ok: false, engine: "eleven", reason: `HTTP_${r.status}` };
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length < 500) return { ok: false, engine: "eleven", reason: "EMPTY_AUDIO" };
    return { ok: true, engine: "eleven", mime: "audio/mpeg", bytes, voice, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, engine: "eleven", reason: e instanceof Error ? e.message.slice(0, 60) : "ERROR" };
  }
}

/** Chooses the engine: env BARQ_TTS_FIRST=eleven flips the order. */
export function ttsOrder(): ("gemini" | "eleven")[] {
  return cleanKey(process.env.BARQ_TTS_FIRST).toLowerCase() === "eleven" ? ["eleven", "gemini"] : ["gemini", "eleven"];
}

/** One call, best available engine. */
export async function synthesize(req: TtsRequest, signal?: AbortSignal): Promise<TtsResult> {
  let last: TtsResult = { ok: false, engine: "none", reason: "NO_ENGINE" };
  for (const engine of ttsOrder()) {
    const r = engine === "gemini" ? await geminiTts(req, signal) : await elevenTts(req, signal);
    if (r.ok) return r;
    last = r;
  }
  return last;
}

/** True when at least one cloud engine is configured (used by /api/ai/status). */
export function ttsAvailable(): { gemini: boolean; eleven: boolean } {
  return { gemini: !!getGeminiKey(), eleven: !!cleanKey(process.env.ELEVENLABS_API_KEY) };
}
