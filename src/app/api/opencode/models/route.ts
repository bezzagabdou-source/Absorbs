import { getModels } from "@/lib/opencode/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/opencode/models — connected providers + free text models. */
export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const data = await getModels(force);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        models: [],
        connected: [],
        total: 0,
        error: error instanceof Error ? error.message : "تعذر تحميل النماذج",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
