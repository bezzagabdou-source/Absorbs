import { json, serverError } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { runAgent, type AgentEvent } from "@/lib/agent-engine";
import { classifyAgenticIntent } from "@/lib/task-router";
import type { ChatTurn } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const enc = new TextEncoder();

/**
 * POST { goal, history? } → streams the autonomous agent's live trace as NDJSON.
 *
 *   event lines:  {"type":"status"|"step"|"tool_start"|"tool_end"|"model"|"final"|"error", …}
 *
 * `force: true` runs the agent even for goals that don't look agentic (the caller
 * decided explicitly, e.g. the "وكيل" button in the UI).
 */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`agent:${user.uid}`, 8, 60_000).ok) return json(429, { code: "RATE" });

  let body: { goal?: unknown; history?: unknown; force?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }

  const goal = typeof body.goal === "string" ? body.goal.trim().slice(0, 4000) : "";
  if (goal.length < 4) return json(400, { code: "BAD_GOAL" });

  const history: ChatTurn[] = Array.isArray(body.history)
    ? (body.history as unknown[])
        .filter(
          (m): m is { role: "user" | "model"; text: string } =>
            !!m &&
            typeof m === "object" &&
            ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "model") &&
            typeof (m as { text?: unknown }).text === "string"
        )
        .slice(-8)
        .map((m) => ({ role: m.role, text: m.text.slice(0, 3000) }))
    : [];

  const agentic = classifyAgenticIntent(goal) || body.force === true;
  if (!agentic) {
    return json(200, { agentic: false, hint: "goal does not look agentic; use the regular chat route" });
  }

  const ctl = new AbortController();
  req.signal.addEventListener("abort", () => ctl.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      const send = (e: AgentEvent | { type: "hello"; protocol: string }) => {
        try {
          c.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* client gone */
        }
      };
      send({ type: "hello", protocol: "nexus-agent/1.0" });
      try {
        const result = await runAgent({
          goal,
          history,
          userId: user.uid,
          signal: ctl.signal,
          emit: send,
        });
        send({ type: "final", answer: result.answer, steps: result.steps, ms: result.ms });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message.slice(0, 200) : "agent crashed" });
      } finally {
        try {
          c.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      ctl.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Lightweight probe: does this goal require the agent? (used by the composer UI). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const goal = url.searchParams.get("goal") ?? "";
  return json(200, { agentic: classifyAgenticIntent(goal) });
}
