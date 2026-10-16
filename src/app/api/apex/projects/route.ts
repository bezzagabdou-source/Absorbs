import { json, serverError } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { listApexProjects, deleteApexProject } from "@/lib/apex/store";

export const runtime = "nodejs";

/** GET /api/apex/projects — the vault: every project this account built, newest first. */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    const list = await listApexProjects(user.uid);
    return json(200, {
      projects: list.map((p) => ({ ...p, url: `/p/${p.slug}`, preview: `/p/${p.slug}?embed=1` })),
      total: list.length,
      lines: list.reduce((s, p) => s + p.lines, 0),
    });
  } catch (e) {
    return serverError("apex", e, "APEX_LIST_FAILED");
  }
}

/** DELETE /api/apex/projects?slug=… — removes a project (and its live URL). */
export async function DELETE(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!slug) return json(400, { code: "BAD_SLUG" });
  const ok = await deleteApexProject(user.uid, slug);
  return json(ok ? 200 : 404, { ok });
}
