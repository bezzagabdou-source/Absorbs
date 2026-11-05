import { actionErrorResponse, replyQuestion } from "@/lib/opencode/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/opencode/questions/:id — { answers: string[][] } */
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { answers?: unknown };
    const answers = body.answers;
    if (
      !Array.isArray(answers) ||
      !answers.every(
        (answer) =>
          Array.isArray(answer) &&
          answer.every((value) => typeof value === "string"),
      )
    ) {
      return Response.json(
        { ok: false, error: "الإجابات غير صالحة" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    await replyQuestion(id, answers as string[][]);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return actionErrorResponse(error);
  }
}
