import { actionErrorResponse, replyPermission } from "@/lib/opencode/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/opencode/permissions/:id — { reply: "once" | "always" | "reject" } */
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { reply?: unknown };
    const reply = body.reply;
    if (reply !== "once" && reply !== "always" && reply !== "reject") {
      return Response.json(
        { ok: false, error: "قيمة الرد غير صالحة" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    await replyPermission(id, reply);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return actionErrorResponse(error);
  }
}
