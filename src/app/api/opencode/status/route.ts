import { getServerStatus } from "@/lib/opencode/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/opencode/status — health, version, project, session count. */
export async function GET() {
  try {
    const status = await getServerStatus();
    return Response.json(status, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        connected: false,
        version: null,
        project: null,
        worktree: null,
        vcs: null,
        sessions: 0,
        authRequired: false,
        hasAuth: false,
        baseUrl: "",
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "تعذر فحص حالة السيرفر",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
