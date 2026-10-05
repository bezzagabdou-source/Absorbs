import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { json } from "@/lib/http";
import { getGeminiKey } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Cloud voice for calls (clear, human, fast).
 *   1) ElevenLabs   — env ELEVENLABS_API_KEY (+ optional ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL)
 *   2) Gemini TTS   — uses the Gemini key you already set (optional GEMINI_TTS_VOICE, e.g. Kore / Puck / Aoede)
 * When neither works the client falls back to the browser voice by itself.
 */

function cleanKey(v: string | undefined): string {
  return (v ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

/** Wraps raw 16-bit mono PCM in a WAV header so every browser can play it. */
function pcmToWav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
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
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function withTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

async function eleven(text: string): Promise<Response | null> {
  const key = cleanKey(process.env.ELEVENLABS_API_KEY);
  if (!key) return null;
  const voice = cleanKey(process.env.ELEVENLABS_VOICE_ID) || "EXAVITQu4vr4xnSDxMaL";
  const model = cleanKey(process.env.ELEVENLABS_MODEL) || "eleven_flash_v2_5";
  try {
    const r = await withTimeout(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64&optimize_streaming_latency=3`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: { stability: 0.45, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true },
        }),
      },
      15_000
    );
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 500) return null;
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "x-barq-voice": "eleven" },
    });
  } catch {
    return null;
  }
}

/** Gemini's own prebuilt voices (same family as Gemini Live). */
const GEMINI_VOICES = ["Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"];

const STYLE: Record<string, string> = {
  ar: "Speak in a warm, friendly, natural Algerian-Arabic conversational tone, clear and relaxed, like a real person on a phone call. Read only this text, do not add anything",
  fr: "Speak in warm, natural, clear conversational French, like a real person on a phone call. Read only this text, do not add anything",
  en: "Speak in warm, natural, clear conversational English, like a real person on a phone call. Read only this text, do not add anything",
};

async function geminiTts(text: string, wanted: string, lang: string): Promise<Response | null> {
  const key = getGeminiKey();
  if (!key) return null;
  const envVoice = cleanKey(process.env.GEMINI_TTS_VOICE);
  const voiceName = GEMINI_VOICES.includes(wanted) ? wanted : GEMINI_VOICES.includes(envVoice) ? envVoice : "Zephyr";
  const style = STYLE[lang] ?? STYLE.ar;
  const models = [cleanKey(process.env.GEMINI_TTS_MODEL), "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"].filter(Boolean);
  for (const model of models) {
    try {
      const r = await withTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${style}: ${text}` }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
            },
          }),
        },
        20_000
      );
      if (!r.ok) continue;
      const j = (await r.json()) as {
        candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
      };
      const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      const b64 = part?.inlineData?.data;
      if (!b64) continue;
      const rateMatch = /rate=(\d+)/.exec(part?.inlineData?.mimeType ?? "");
      const wav = pcmToWav(Buffer.from(b64, "base64"), rateMatch ? Number(rateMatch[1]) : 24000);
      return new Response(new Uint8Array(wav), {
        headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store", "x-barq-voice": "gemini" },
      });
    } catch {
      /* try next model */
    }
  }
  return null;
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`tts:${user.uid}`, 90, 60_000).ok) return json(429, { code: "RATE" });

  let body: { text?: unknown; voice?: unknown; lang?: unknown };
  try {
    body = (await req.json()) as { text?: unknown; voice?: unknown; lang?: unknown };
  } catch {
    return json(400, { code: "BAD_JSON" });
  }
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, 700) : "";
  if (!text) return json(400, { code: "EMPTY" });

  const voice = typeof body.voice === "string" ? body.voice : "";
  const lang = typeof body.lang === "string" ? body.lang.slice(0, 2).toLowerCase() : /[\u0600-\u06FF]/.test(text) ? "ar" : "en";
  // Gemini voice first (your Google AI Studio key); ElevenLabs only as a backup (or first when BARQ_TTS_FIRST=eleven)
  const elevenFirst = cleanKey(process.env.BARQ_TTS_FIRST).toLowerCase() === "eleven";
  const out = elevenFirst
    ? ((await eleven(text)) ?? (await geminiTts(text, voice, lang)))
    : ((await geminiTts(text, voice, lang)) ?? (await eleven(text)));
  if (out) return out;
  return json(501, { code: "NO_TTS" });
}
