import {
  abortSession,
  actionErrorResponse,
  assertSessionId,
} from "@/lib/opencode/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/opencode/sessions/:id/abort — stop the current generation. */
export async function POST(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    assertSessionId(id);
    await abortSession(id);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return actionErrorResponse(error);
  }
}
