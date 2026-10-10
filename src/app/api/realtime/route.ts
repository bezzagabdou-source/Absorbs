/**
 * ═══════════════════════════════════════════════════════════════════
 *  REALTIME STREAM SESSION ROUTE  ·  nexus-rt/1.0  (fetch-duplex transport)
 * ═══════════════════════════════════════════════════════════════════
 *  The Vercel-friendly transport of @/lib/realtime-stream: ONE long-lived
 *  streamed session per user instead of one HTTP request per voice turn.
 *
 *  Client → server: NDJSON RTClientEvent stream (request body streaming).
 *  Server → client: NDJSON RTServerEvent stream (token-by-token replies).
 *
 *  Behaviour per mode:
 *    voice  — text turns answered with the voice persona, streamed token
 *             by token; audio frames accepted (VAD/barge-in is handled
 *             client-side, transcripts arrive as "text" events from the
 *             browser speech recogniser); barge-in aborts the in-flight
 *             reply within one event-loop tick.
 *    text   — same loop with the neutral fast system prompt.
 *
 *  A configured ws(s):// gateway (NEXT_PUBLIC_REALTIME_WS) bypasses this
 *  route entirely — the client then talks WebSocket end-to-end.
 */

import { json } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { streamUnified } from "@/lib/model-router";
import { EventDecoder, RT_PROTOCOL_VERSION, type RTClientEvent, type RTServerEvent } from "@/lib/realtime-stream";
import { VOICE_SYSTEM, personaById } from "@/lib/voice-call";
import type { ChatTurn } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const enc = new TextEncoder();
const uuid = (): string => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `s${Date.now().toString(36)}`);

const MAX_TURNS = 120;         // turns per session before the server ends it politely
const TURN_TIMEOUT_MS = 45_000;
const HISTORY_KEEP = 10;       // rolling conversation context per session

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`rt:${user.uid}`, 4, 60_000).ok) return json(429, { code: "RATE" });

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "text" ? "text" : url.searchParams.get("mode") === "vision" ? "vision" : "voice";
  if (!req.body) return json(400, { code: "NO_STREAM" });

  const sessionId = uuid();
  const history: ChatTurn[] = [];
  let personaId = "";
  let turns = 0;
  let audioFrames = 0;
  /** currently generating? barge-in aborts it immediately */
  let currentGen: AbortController | null = null;
  let closed = false;

  const decoder = new EventDecoder<RTClientEvent>();
  const incoming = req.body.getReader();

  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      const send = (e: RTServerEvent) => {
        if (closed) return;
        try {
          c.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          closed = true;
        }
      };

      send({ t: "ready", session: sessionId, heartbeatMs: 15_000 });

      /* pumps one user turn through the fast lane of the unified router */
      const answerTurn = async (text: string) => {
        if (closed || turns >= MAX_TURNS) return;
        turns += 1;
        send({ t: "transcript", role: "user", text, final: true });

        const persona = personaId ? personaById(personaId) : null;
        const system =
          mode === "voice"
            ? VOICE_SYSTEM + (persona ? persona.system : "") + "\n\n[session " + sessionId + "]"
            : "You are Nexus AI. Be concise, structured and direct. Match the user's language (Arabic/Darija/French/English).";

        const gen = new AbortController();
        currentGen = gen;
        try {
          const s = await streamUnified({
            system,
            messages: [...history.slice(-HISTORY_KEEP), { role: "user", text }],
            userText: text,
            maxTokens: mode === "voice" ? 350 : 1200,
            prefer: "fast",
            signal: gen.signal,
          });
          const reader = s.getReader();
          let full = "";
          constTimeout(TURN_TIMEOUT_MS, gen);
          for (;;) {
            const { done, value } = await reader.read();
            if (done || closed || gen.signal.aborted) break;
            full += value;
            send({ t: "token", text: value });
          }
          if (full.trim()) {
            history.push({ role: "user", text }, { role: "model", text: full });
            if (history.length > HISTORY_KEEP * 2) history.splice(0, history.length - HISTORY_KEEP * 2);
            send({ t: "transcript", role: "model", text: full, final: true });
          }
          send({ t: "done", reason: gen.signal.aborted ? "barge-in" : "ok" });
        } catch (e) {
          if (!gen.signal.aborted && !closed) {
            send({ t: "error", code: "ENGINE", message: e instanceof Error ? e.message.slice(0, 160) : "engine error" });
            send({ t: "done", reason: "error" });
          }
        } finally {
          currentGen = null;
        }
      };

      /* the session pump: read client events as they arrive on the wire */
      try {
        for (;;) {
          const { done, value } = await incoming.read();
          if (done) break;
          if (value) {
            for (const ev of decoder.push(value)) {
              if (closed) return;
              switch (ev.t) {
                case "hello":
                  personaId = ev.persona ?? "";
                  break;
                case "text":
                  void answerTurn(ev.text.slice(0, 4000));
                  break;
                case "audio":
                  audioFrames += 1;
                  if (audioFrames === 1) send({ t: "pong", at: Date.now() });
                  break;
                case "control":
                  if (ev.op === "barge-in") {
                    currentGen?.abort();
                    send({ t: "barge-in-ack" });
                  } else if (ev.op === "end") {
                    send({ t: "done", reason: "client-end" });
                    closed = true;
                    try {
                      c.close();
                    } catch {
                      /* closed */
                    }
                    return;
                  }
                  break;
                case "ping":
                  send({ t: "pong", at: ev.at });
                  break;
                default:
                  break;
              }
            }
          }
        }
        send({ t: "done", reason: "eof" });
      } catch {
        /* client dropped */
      } finally {
        closed = true;
        currentGen?.abort();
        try {
          c.close();
        } catch {
          /* closed */
        }
      }
    },
    cancel() {
      closed = true;
      currentGen?.abort();
      void incoming.cancel().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-RT-Protocol": RT_PROTOCOL_VERSION,
    },
  });
}

/** Protocol handshake probe. */
export async function GET() {
  return json(200, { protocol: RT_PROTOCOL_VERSION, modes: ["voice", "text", "vision"], transport: "fetch-duplex + websocket" });
}

function constTimeout(ms: number, ctl: AbortController): void {
  const t = setTimeout(() => ctl.abort(), ms);
  // don't keep the serverless tick alive for the timer alone
  if (typeof t === "object" && t && "unref" in t) (t as { unref: () => void }).unref();
  ctl.signal.addEventListener("abort", () => clearTimeout(t), { once: true });
}
