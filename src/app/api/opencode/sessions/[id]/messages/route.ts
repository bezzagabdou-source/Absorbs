import {
  actionErrorResponse,
  assertSessionId,
  getMessages,
  sendPrompt,
} from "@/lib/opencode/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** GET /api/opencode/sessions/:id/messages */
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    assertSessionId(id);
    const messages = await getMessages(id);
    return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return actionErrorResponse(error);
  }
}

/**
 * POST /api/opencode/sessions/:id/messages
 * Enqueues a prompt (async). The dashboard renders the reply from the SSE stream.
 */
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    assertSessionId(id);

    const body = (await request.json().catch(() => ({}))) as {
      text?: unknown;
      model?: { providerID?: unknown; modelID?: unknown };
    };

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return Response.json(
        { ok: false, error: "نص الرسالة مطلوب" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (text.length > 20_000) {
      return Response.json(
        { ok: false, error: "الرسالة طويلة جداً (الحد 20,000 حرف)" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const model =
      body.model &&
      typeof body.model.providerID === "string" &&
      typeof body.model.modelID === "string"
        ? { providerID: body.model.providerID, modelID: body.model.modelID }
        : undefined;

    await sendPrompt(id, { text, model });
    return Response.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return actionErrorResponse(error);
  }
}
