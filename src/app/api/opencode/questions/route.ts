import { listPermissions } from "@/lib/opencode/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/opencode/questions — pending question requests. */
export async function GET() {
  try {
    const { questions } = await listPermissions();
    return Response.json({ questions }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { questions: [] },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
