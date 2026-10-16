import { json, serverError } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { getApexProject, setApexVisibility } from "@/lib/apex/store";

export const runtime = "nodejs";

const VISIBILITY = new Set(["private", "unlisted", "public"]);

/** GET /api/apex/projects/<slug>?inline=1 — full project (files + html) for the IDE. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const { slug } = await ctx.params;
  try {
    const project = await getApexProject(user.uid, slug);
    if (!project) return json(404, { code: "NOT_FOUND" });
    const wantHtml = new URL(req.url).searchParams.get("inline") !== "0";
    return json(200, {
      project: {
        ...project,
        html: wantHtml ? project.html : "",
        url: `/p/${project.slug}`,
        preview: `/p/${project.slug}?embed=1`,
      },
    });
  } catch (e) {
    return serverError("apex", e, "APEX_GET_FAILED");
  }
}

/** PATCH /api/apex/projects/<slug> { visibility } — publish / unpublish the live URL. */
export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const { slug } = await ctx.params;
  let body: { visibility?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const visibility = typeof body.visibility === "string" && VISIBILITY.has(body.visibility) ? (body.visibility as "private" | "unlisted" | "public") : null;
  if (!visibility) return json(400, { code: "BAD_VISIBILITY" });
  const updated = await setApexVisibility(user.uid, slug, visibility);
  if (!updated) return json(404, { code: "NOT_FOUND" });
  return json(200, { ok: true, project: { ...updated, html: "", url: `/p/${updated.slug}` } });
}
