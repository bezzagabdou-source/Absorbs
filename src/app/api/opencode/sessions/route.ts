import {
  actionErrorResponse,
  createSession,
  listSessions,
} from "@/lib/opencode/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/opencode/sessions — newest first. */
export async function GET() {
  try {
    const sessions = await listSessions();
    const sorted = [...sessions].sort(
      (a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0),
    );
    return Response.json(
      { sessions: sorted },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return actionErrorResponse(error);
  }
}

/** POST /api/opencode/sessions — create a session (optionally with a model). */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      title?: unknown;
      model?: { providerID?: unknown; modelID?: unknown };
    };

    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 120)
        : undefined;

    const model =
      body.model &&
      typeof body.model.providerID === "string" &&
      typeof body.model.modelID === "string"
        ? { providerID: body.model.providerID, modelID: body.model.modelID }
        : undefined;

    const session = await createSession({ title, model });
    return Response.json({ session }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return actionErrorResponse(error);
  }
}
