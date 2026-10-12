/**
 * Nexus AI v12 — THE COUNCIL.
 *
 * POST /api/ai/council
 *   { text: string, preset?: string }
 *
 * Opens N model streams in parallel, forwards every token as an NDJSON event so the
 * browser can render four live columns, scores the finished drafts with the v11 fusion
 * engine, then streams one merged verdict.
 *
 * The response is a single long-lived NDJSON stream. It can never hang: each seat has
 * its own deadline and the whole council has a hard ceiling.
 */
import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { takeCredit, FREE_DAILY } from "@/lib/usage";
import { streamGemini, type ChatTurn } from "@/lib/gemini";
import { streamSelectedModel } from "@/lib/model-router";
import { rank, keepUsable, fusionPrompt, type Draft } from "@/lib/fusion";
import { cleanOutput } from "@/lib/turbo";
import {
  COUNCIL,
  SEAT_SYSTEM,
  verdictSystem,
  presetById,
  seatsFor,
  encodeEvent,
  type CouncilEvent,
} from "@/lib/council";
import { toSelection, type Model12 } from "@/lib/models-v12";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_TEXT = 24_000;

/** Open one seat's stream, whichever provider it belongs to. */
async function openSeat(m: Model12, system: string, messages: ChatTurn[]): Promise<ReadableStream<string>> {
  if (m.provider === "gemini") {
    return streamGemini({
      system,
      messages,
      tier: "pro",
      task: "general",
      mode: "quality",
      maxTokens: COUNCIL.SEAT_MAX_TOKENS,
      temperature: 0.7,
      noFallback: true,
      lowThink: m.speed === "instant" || m.speed === "fast",
    });
  }
  return streamSelectedModel({
    selection: toSelection(m),
    system,
    messages,
    maxTokens: COUNCIL.SEAT_MAX_TOKENS,
    onModel: () => {},
    onDone: () => {},
  });
}

export async function POST(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHORIZED" });

  const rl = rateLimit(`council:${user.uid}`, 6, 60_000);
  if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter) });

  let body: { text?: unknown; preset?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_JSON" });
  }

  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
  if (!text) return json(400, { code: "EMPTY" });

  const taken = await takeCredit(user);
  if (taken && !taken.ok) return json(429, { code: "QUOTA" });
  const plan = taken?.plan ?? "free";

  const preset = presetById(typeof body.preset === "string" ? body.preset : "");
  const seats = seatsFor(preset, plan).slice(0, COUNCIL.MAX_SEATS);
  if (seats.length === 0) return json(500, { code: "NO_SEATS" });

  const messages: ChatTurn[] = [{ role: "user", text }];
  const started = Date.now();

  const stream = new ReadableStream<string>({
    async start(controller) {
      let closed = false;
      const send = (e: CouncilEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encodeEvent(e));
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      send({
        t: "open",
        seats: seats.map((m, i) => ({
          id: `s${i}`,
          label: m.label,
          blurb: m.blurb,
          speed: m.speed,
        })),
      });

      const drafts: Draft[] = [];

      /* ---------- stage 1: every seat answers in parallel ---------- */
      await Promise.all(
        seats.map(async (m, i) => {
          const id = `s${i}`;
          const t0 = Date.now();
          let acc = "";
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), COUNCIL.SEAT_DEADLINE_MS);
          try {
            const rs = await openSeat(m, SEAT_SYSTEM, messages);
            const reader = rs.getReader();
            for (;;) {
              if (ctl.signal.aborted) break;
              const { value, done } = await reader.read();
              if (done) break;
              if (!value) continue;
              acc += value;
              send({ t: "delta", id, d: value });
            }
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            const clean = cleanOutput(acc).trim();
            if (clean) {
              drafts.push({ engine: m.label, text: clean, ms: Date.now() - t0 });
              send({ t: "seat-done", id, ms: Date.now() - t0, chars: clean.length });
            } else {
              send({ t: "seat-error", id, message: "ما رجع حتى جواب" });
            }
          } catch (e) {
            send({
              t: "seat-error",
              id,
              message: e instanceof Error ? e.message.slice(0, 160) : "فشل المحرّك",
            });
          } finally {
            clearTimeout(timer);
          }
        })
      );

      if (drafts.length === 0) {
        send({ t: "error", message: "كل أعضاء المجلس فشلو. جرّب مرة أخرى." });
        finish();
        return;
      }

      /* ---------- stage 2: score ---------- */
      const scored = rank(drafts, { userText: text, kind: "chat" });
      const byLabel = new Map(seats.map((m, i) => [m.label, `s${i}`]));
      send({
        t: "scores",
        scores: scored.map((s) => ({
          id: byLabel.get(s.engine) ?? s.engine,
          score: Math.round(s.score * 100),
          reasons: s.reasons.slice(0, 3),
        })),
        winner: byLabel.get(scored[0]?.engine ?? "") ?? "",
      });

      /* ---------- stage 3: one merged verdict ---------- */
      const usable = keepUsable(scored);
      if (usable.length < 2) {
        // only one usable draft — it IS the verdict, no second model call needed
        send({ t: "verdict-open" });
        send({ t: "verdict", d: usable[0]?.text ?? scored[0].text });
        send({ t: "done", ms: Date.now() - started });
        finish();
        return;
      }

      send({ t: "verdict-open" });
      const left = COUNCIL.TOTAL_DEADLINE_MS - (Date.now() - started);
      if (left < 8000) {
        send({ t: "verdict", d: usable[0].text });
        send({ t: "done", ms: Date.now() - started });
        finish();
        return;
      }

      try {
        const merge = fusionPrompt(scored, { userText: text, kind: "chat" });
        const rs = await streamGemini({
          system: verdictSystem(usable.length),
          messages: [{ role: "user", text: merge || text }],
          tier: "pro",
          task: "reasoning",
          mode: "quality",
          maxTokens: COUNCIL.VERDICT_MAX_TOKENS,
          temperature: 0.6,
        });
        const reader = rs.getReader();
        const hardStop = Date.now() + left;
        for (;;) {
          if (Date.now() > hardStop) break;
          const { value, done } = await reader.read();
          if (done) break;
          if (value) send({ t: "verdict", d: value });
        }
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
      } catch {
        // synthesis failed — fall back to the best single draft, never an empty screen
        send({ t: "verdict", d: usable[0].text });
      }

      send({ t: "done", ms: Date.now() - started });
      finish();
    },
  });

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "x-nexus": "v12-council",
      "x-seats": String(seats.length),
      "x-plan": plan,
      "x-free-daily": String(FREE_DAILY),
    },
  });
}
