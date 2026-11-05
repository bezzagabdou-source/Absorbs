import { listPermissions } from "@/lib/opencode/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/opencode/permissions — pending permission + question requests. */
export async function GET() {
  try {
    const data = await listPermissions();
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { permissions: [], questions: [] },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
