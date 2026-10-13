import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { conversations, messages } from "@/db/schema";
import { composeReply, makeTitle, streamText } from "@/lib/engine";
import { DEFAULT_MODEL, modelById } from "@/lib/models";
import { AIProviderError, generateAIResult } from "@/lib/ai-providers";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser, isProActive } from "@/lib/usage";
import { rateLimit } from "@/lib/rate-limit";
import { json, safeDetail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = { conversationId?: string | null; message?: string; model?: string };

const SYSTEM = `You are Nexus, a fast, precise multilingual assistant.
Answer in the user's language (Arabic incl. Algerian Darija, French, English). Use clean markdown; put code in fenced blocks.`;

/** Folds the last turns into one prompt (ai-providers takes a single prompt string). */
function transcript(history: { role: string; content: string }[], latest: string): string {
  const turns = history.slice(-12).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 6000)}`);
  turns.push(`User: ${latest}`, "Assistant:");
  return turns.join("\n\n");
}

export async function POST(req: NextRequest) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const rl = rateLimit(`chat:${user.uid}`, 30, 60_000);
  if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter) });

  const body = (await req.json().catch(() => ({}))) as Body;
  const text = (body.message ?? "").trim().slice(0, 20_000);
  const modelId = (body.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  if (!text) return json(400, { code: "MESSAGE_REQUIRED" });

  let dbUser;
  try {
    await ensureSchema();
    dbUser = await ensureUser(user);
  } catch (e) {
    console.error("[chat] db", e);
    return json(500, { code: "DB", detail: safeDetail(e) });
  }

  const model = modelById(modelId);
  if (model.pro && !isProActive(dbUser)) {
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
      try {
        // 1 — resolve (owner-checked) or create the conversation
        let convId = body.conversationId ?? null;
        let title: string | null = null;
        let history: { role: string; content: string }[] = [];
        if (convId) {
          const [conv] = await db
            .select()
            .from(conversations)
            .where(and(eq(conversations.id, convId), eq(conversations.userId, user.uid)))
            .limit(1);
          if (!conv) convId = null;
          else
            history = (
              await db.select().from(messages).where(eq(messages.conversationId, convId)).orderBy(desc(messages.createdAt)).limit(12)
            ).reverse();
        }
        if (!convId) {
          title = makeTitle(text);
          const [created] = await db.insert(conversations).values({ userId: user.uid, title, model: model.id }).returning();
          convId = created.id;
        }

        // 2 — persist the user message
        const [userMsg] = await db.insert(messages).values({ conversationId: convId, role: "user", content: text }).returning();
        send("meta", { conversationId: convId, title, userMessageId: userMsg.id, model: model.id });

        // 3 — real AI (Absorbs provider chains); offline engine only when NO key is configured
        let reply: string;
        try {
          const r = await generateAIResult(model.task, transcript(history, text), {
            system: SYSTEM,
            maxTokens: model.task === "fast" ? 4096 : 8192,
            timeoutMs: 60_000,
            signal: req.signal,
          });
          reply = r.text;
        } catch (e) {
          if (e instanceof AIProviderError && e.code === "NO_KEY") {
            reply = composeReply(text, model.id);
          } else {
            console.error("[chat] ai", e);
            throw e;
          }
        }
        await streamText(reply, async (delta) => send("delta", { text: delta }));

        // 4 — persist assistant message + touch the conversation
        const [assistantMsg] = await db
          .insert(messages)
          .values({ conversationId: convId, role: "assistant", content: reply, model: model.id })
          .returning();
        await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, convId));
        send("done", { assistantMessageId: assistantMsg.id });
      } catch (err) {
        send("error", { message: err instanceof Error ? safeDetail(err) : "unknown_error" });
      } finally {
        try {
          controller.close();
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
