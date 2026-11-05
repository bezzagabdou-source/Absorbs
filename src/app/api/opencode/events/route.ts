import {
  getOpenCodeConfig,
  ocStream,
  OpenCodeActionError,
} from "@/lib/opencode/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/**
 * GET /api/opencode/events — server-side proxy for OpenCode's /event SSE.
 *
 * Keeping this on the Next.js origin means the browser never talks to
 * localhost:4000 directly (which is impossible from a phone) and the basic-auth
 * password stays on the server.
 */
export async function GET(request: Request) {
  const config = getOpenCodeConfig();
  let upstream: Response;

  try {
    upstream = await ocStream("/event", request.signal);
  } catch (error) {
    const message =
      error instanceof OpenCodeActionError
        ? error.message
        : "تعذر الاتصال بسيرفر OpenCode";
    const payload = `data: ${JSON.stringify({
      id: "evt_proxy_disconnected",
      type: "server.disconnected",
      properties: { message },
    })}\n\n`;
    return new Response(payload, { status: 200, headers: SSE_HEADERS });
  }

  const body = upstream.body;
  if (!body) {
    return new Response(
      `data: ${JSON.stringify({
        id: "evt_proxy_no_body",
        type: "server.disconnected",
        properties: { message: "لم يصل أي تيار من السيرفر" },
      })}\n\n`,
      { status: 200, headers: SSE_HEADERS },
    );
  }

  const reader = body.getReader();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const push = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(new TextEncoder().encode(chunk));
        } catch {
          cleanup();
        }
      };

      // open the stream with a comment (ignored by EventSource, keeps proxies happy)
      push(`: connected ${JSON.stringify({ baseUrl: config.baseUrl })}\n\n`);
      heartbeat = setInterval(() => push(`: ping\n\n`), 15_000);

      request.signal.addEventListener("abort", () => {
        reader.cancel().catch(() => undefined);
        cleanup();
      });

      void (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) controller.enqueue(value);
          }
        } catch {
          /* upstream closed / client aborted */
        } finally {
          cleanup();
        }
      })();
    },
    cancel() {
      closed = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      reader.cancel().catch(() => undefined);
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
