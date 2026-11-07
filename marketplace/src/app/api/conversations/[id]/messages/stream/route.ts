import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { api } from "@/lib/server/http";
import { AppError } from "@/lib/server/errors";
import { idSchema, uuidSchema } from "@/lib/validation/schemas";
import { getConversation, getMessagesAfter, type MessageCursor } from "@/features/chat/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;
type Context = { params: Promise<{ id: string }> };

function parseCursor(value: string | null): MessageCursor | undefined {
  if (!value) return undefined;
  const separator = value.lastIndexOf("_");
  if (separator < 1) return undefined;
  const createdAt = new Date(value.slice(0, separator));
  const id = value.slice(separator + 1);
  if (!Number.isFinite(createdAt.getTime()) || !uuidSchema.safeParse(id).success) return undefined;
  return { createdAt, id };
}
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); }
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function GET(request: NextRequest, context: Context) {
  return api(request, { auth: true, limit: 30 }, async (actor) => {
    if (!actor) throw new AppError("auth_required", 401);
    const { id } = idSchema.parse(await context.params);
    await getConversation(actor, id);
    let cursor = parseCursor(request.headers.get("last-event-id"));
    const seen = new Set<string>(cursor ? [cursor.id] : []);
    const encoder = new TextEncoder();
    const started = Date.now();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown, eventId?: string) => {
          controller.enqueue(encoder.encode(`${eventId ? `id: ${eventId}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        try {
          controller.enqueue(encoder.encode("retry: 3000\n\n"));
          send("ready", { conversationId: id });
          while (!request.signal.aborted && Date.now() - started < 25_000) {
            const items = await getMessagesAfter(actor, id, cursor);
            const last = items.at(-1);
            if (last) cursor = { createdAt: last.createdAt, id: last.id };
            const fresh = items.filter((item) => !seen.has(item.id));
            for (const item of fresh) seen.add(item.id);
            if (fresh.length && last) send("messages", { items: fresh }, `${last.createdAt.toISOString()}_${last.id}`);
            await wait(1000, request.signal);
          }
          controller.close();
        } catch (error) {
          if (request.signal.aborted) controller.close();
          else controller.error(error);
        }
      },
    });
    return new NextResponse(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" } });
  });
}
