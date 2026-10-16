import { NextRequest } from "next/server";
import { repo } from "@/lib/repo";
import { composeReply, makeTitle, streamText } from "@/lib/engine";
import { DEFAULT_MODEL, modelById } from "@/lib/models";
import { AIProviderError, streamAIResult } from "@/lib/ai-providers";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser, isProActive } from "@/lib/usage";
import { rateLimit, acquire } from "@/lib/rate-limit";
import { json, safeDetail } from "@/lib/http";
import { isUuid } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = { conversationId?: string | null; message?: string; model?: string };

const SYSTEM = `You are Nexus, a fast, precise multilingual assistant.
Answer in the user's language (Arabic incl. Algerian Darija, French, English). Use clean markdown; put code in fenced blocks. Be direct and concrete; no filler.`;

/** Folds the last turns into one prompt (ai-providers takes a single prompt string). */
function transcript(history: { role: string; content: string }[], latest: string): string {
  const turns = history.slice(-12).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 6000)}`);
  turns.push(`User: ${latest}`, "Assistant:");
  return turns.join("\n\n");
}

/**
 * POST /api/chat — real token-by-token streaming.
 *
 * Speed design:
 *   • the provider's own stream is piped straight to the client (no wait-for-full)
 *   • fast tasks get a 30s budget and 4k max tokens; the fallback chain tries
 *     the fastest engines first (Groq / Cerebras / Gemini Flash)
 *   • with NO keys configured, the local engine answers instantly (offline mode)
 */
export async function POST(req: NextRequest) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  const rl = rateLimit(`chat:${user.uid}`, 30, 60_000);
  if (!rl.ok) return json(429, { code: "RATE", retryAfter: rl.retryAfter }, { "Retry-After": String(rl.retryAfter) });
  const slot = acquire(`conc:${user.uid}`, 2); // max 2 parallel streams per user
  if (!slot.ok) return json(429, { code: "RATE", retryAfter: 2 }, { "Retry-After": "2" });

  const body = (await req.json().catch(() => ({}))) as Body;
  const text = (body.message ?? "").trim().slice(0, 20_000);
  const modelId = (body.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  if (!text) {
    slot.release();
    return json(400, { code: "MESSAGE_REQUIRED" });
  }

  let dbUser;
  try {
    dbUser = await ensureUser(user);
  } catch (e) {
    slot.release();
    console.error("[chat] db", e);
    return json(500, { code: "DB", detail: safeDetail(e) });
  }

  const model = modelById(modelId);
  if (model.pro && !isProActive(dbUser)) {
    slot.release();
    return json(403, { code: "PRO_MODEL_REQUIRED", message: "هذا النموذج متاح لمشتركي Pro فقط. فعّل كود التفعيل من الإعدادات." });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* client went away */
        }
      };

      let convId: string | null = null;
      let reply = "";
      let engine = "nexus-local";
      let closed = false;

      try {
        // 1 — resolve (owner-checked) or create the conversation
        convId = isUuid(body.conversationId ?? "") ? (body.conversationId as string) : null;
        let title: string | null = null;
        let history: { role: string; content: string }[] = [];
        if (convId) {
          const conv = await repo.getConversation(user.uid, convId);
          if (!conv) convId = null;
          else history = await repo.recentMessages(convId, 12);
        }
        if (!convId) {
          title = makeTitle(text);
          const created = await repo.createConversation(user.uid, title, model.id);
          convId = created.id;
        }

        // 2 — persist the user message
        const userMsg = await repo.appendMessage(convId, { role: "user", content: text, model: null });
        send("meta", { conversationId: convId, title, userMessageId: userMsg.id, model: model.id });

        // 3 — stream the answer (real provider tokens, or the instant local engine)
        try {
          const gen = streamAIResult(model.task, transcript(history, text), {
            system: SYSTEM,
            maxTokens: model.task === "fast" || model.task === "ultra" ? 4096 : 8192,
            timeoutMs: model.task === "fast" || model.task === "ultra" ? 30_000 : 90_000,
            signal: req.signal,
          });
          for await (const ev of gen) {
            if (req.signal.aborted) break;
            if (ev.type === "meta") {
              engine = `${ev.provider}/${ev.model}`;
              send("engine", { engine });
            } else if (ev.type === "delta") {
              reply += ev.text;
              send("delta", { text: ev.text });
            }
            // "done" — nothing extra to emit
          }
          if (!reply.trim()) throw new AIProviderError("EMPTY", "No answer produced.");
        } catch (e) {
          if (e instanceof AIProviderError && (e.code === "NO_KEY" || e.code === "ALL_FAILED") && !reply.trim()) {
            // offline mode: the local engine answers instantly
            engine = "nexus-local";
            send("engine", { engine });
            const local = composeReply(text, model.id);
            await streamText(local, (d) => {
              reply += d;
              send("delta", { text: d });
            });
          } else if (reply.trim()) {
            // partial answer already delivered — keep it, flag it
            send("engine", { engine: `${engine} (truncated)` });
          } else {
            console.error("[chat] ai", e);
            throw e;
          }
        }

        // 4 — persist assistant message + touch the conversation
        const finalText = reply.trim();
        if (finalText) {
          const assistantMsg = await repo.appendMessage(convId, { role: "assistant", content: finalText, model: model.id });
          await repo.touchConversation(convId);
          send("done", { assistantMessageId: assistantMsg.id, engine, title });
        }
      } catch (err) {
        if (req.signal.aborted) {
          // user stopped / closed the tab: persist partial answer quietly
          if (convId && reply.trim().length > 40) {
            await repo.appendMessage(convId, { role: "assistant", content: reply.trim(), model: model.id }).catch(() => undefined);
            await repo.touchConversation(convId).catch(() => undefined);
          }
        } else {
          send("error", { message: err instanceof Error ? safeDetail(err) : "unknown_error" });
        }
      } finally {
        slot.release();
        try {
          if (!closed) controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
