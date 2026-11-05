import {
  actionErrorResponse,
  assertSessionId,
  deleteSession,
  getSession,
} from "@/lib/opencode/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** GET /api/opencode/sessions/:id */
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    assertSessionId(id);
    const session = await getSession(id);
    return Response.json({ session }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return actionErrorResponse(error);
  }
}

/** DELETE /api/opencode/sessions/:id */
export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    assertSessionId(id);
    await deleteSession(id);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return actionErrorResponse(error);
  }
}
