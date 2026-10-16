import { after } from "next/server";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { json } from "@/lib/http";
import { pool } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import {
  detectTtsLang,
  geminiTts,
  geminiTtsStream,
  elevenTts,
  sanitizeForSpeech,
  ttsOrder,
} from "@/lib/tts";
import { VOICE_IDS, voiceById, emotionPrompt } from "@/lib/voice-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * v18 ATLAS — cloud voice for live calls and message read-aloud.
 *
 *   POST /api/voice/tts
 *   { text, voice?, lang?, mood?, rate?, emotion?, stream? }
 *
 *   · `stream:true`  → chunked `audio/wav` (the browser starts playing while
 *                      Gemini is still speaking) — this is what makes the call
 *                      feel like a real human with ~0.5 s reaction time.
 *   · default        → one complete `audio/wav` (or `audio/mpeg` via ElevenLabs).
 *   · on failure     → JSON 501 `{code:"NO_TTS"}` and the client falls back to
 *                      the browser voice by itself (unchanged behaviour).
 *
 * Voice list, style prompts and emotion presets live in `@/lib/voice-catalog`.
 */

type Body = {
  text?: unknown;
  voice?: unknown;
  lang?: unknown;
  mood?: unknown;
  rate?: unknown;
  emotion?: unknown;
  stream?: unknown;
};

function str(v: unknown, max = 40): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

async function logVoice(uid: string, voice: string, lang: string, ms: number, engine: string): Promise<void> {
  try {
    await ensureSchema();
    await pool.query(
      `insert into barq.atlas_voice (user_id, voice, lang, turns, duration_ms, latency_ms, engine)
       values ($1,$2,$3,1,0,$4,$5)`,
      [uid, voice, lang, ms, engine]
    );
  } catch {
    /* telemetry must never break a call */
  }
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`tts:${user.uid}`, 240, 60_000).ok) return json(429, { code: "RATE" });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { code: "BAD_JSON" });
  }

  const text = sanitizeForSpeech(typeof body.text === "string" ? body.text : "", 900);
  if (!text) return json(400, { code: "EMPTY" });

  const wanted = str(body.voice, 30);
  const voice = VOICE_IDS.includes(wanted) ? wanted : voiceById(wanted || "Zephyr").id;
  const lang = detectTtsLang(text, str(body.lang, 4));
  const mood = str(body.mood, 20) || voiceById(voice).mood;
  const rateRaw = typeof body.rate === "number" ? body.rate : Number(body.rate);
  const rate = Number.isFinite(rateRaw) && rateRaw > 0 ? Math.min(1.5, Math.max(0.7, rateRaw)) : 1;
  const emotionId = str(body.emotion, 24);
  const emotion = emotionPrompt(emotionId) || emotionId;
  const wantStream = body.stream === true || body.stream === "true";
  const t0 = Date.now();

  /* ── streaming path: first audio chunk out as early as possible ── */
  if (wantStream && ttsOrder()[0] === "gemini") {
    const ctl = new AbortController();
    req.signal.addEventListener("abort", () => ctl.abort());
    let produced = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of geminiTtsStream({ text, voice, lang, mood, rate, emotion }, ctl.signal)) {
            produced = true;
            controller.enqueue(chunk);
          }
        } catch {
          /* fall through to the buffered engines */
        }
        if (!produced) {
          // streaming endpoint unavailable → fall back to the buffered engines
          const one = await geminiTts({ text, voice, lang, mood, rate, emotion }, ctl.signal);
          const two = one.ok ? one : await elevenTts({ text, voice, lang, mood, rate, emotion }, ctl.signal);
          if (two.ok) controller.enqueue(Buffer.from(two.bytes));
        }
        controller.close();
        after(() => void logVoice(user.uid, voice, lang, Date.now() - t0, produced ? "gemini-stream" : "fallback"));
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
        "x-barq-voice": "gemini",
        "x-barq-voice-name": voice,
        "x-barq-stream": "1",
        "Transfer-Encoding": "chunked",
      },
    });
  }

  /* ── buffered path: best available engine ── */
  let out: Response | null = null;
  let engine = "none";
  for (const e of ttsOrder()) {
    const r = e === "gemini" ? await geminiTts({ text, voice, lang, mood, rate, emotion }) : await elevenTts({ text, voice, lang, mood, rate, emotion });
    if (r.ok) {
      engine = r.engine;
      out = new Response(Buffer.from(r.bytes), {
        headers: {
          "Content-Type": r.mime,
          "Cache-Control": "no-store",
          "x-barq-voice": r.engine,
          "x-barq-voice-name": r.voice,
          "x-barq-tts-ms": String(r.ms),
        },
      });
      break;
    }
  }
  if (out) {
    after(() => void logVoice(user.uid, voice, lang, Date.now() - t0, engine));
    return out;
  }
  return json(501, { code: "NO_TTS" });
}

/** Lists the available voices + engine state so the UI can build the picker. */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const { ttsAvailable } = await import("@/lib/tts");
  const { VOICE_CATALOG, EMOTION_PRESETS, PERSONA_VOICES } = await import("@/lib/voice-catalog");
  return json(200, {
    engines: ttsAvailable(),
    voices: VOICE_CATALOG,
    emotions: EMOTION_PRESETS,
    personaVoices: PERSONA_VOICES,
  });
}
