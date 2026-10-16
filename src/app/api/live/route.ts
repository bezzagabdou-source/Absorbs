/**
 * NEXUS FORGE v19 — إدارة الروابط الحية
 * ---------------------------------------------------------------------------
 *   POST   /api/live                { html, files?, title, kind?, language?, models?, visibility?, slug? }
 *                                   → publishes (or updates) a project and returns its live URL
 *   GET    /api/live?list=1         → my published sites
 *   GET    /api/live?gallery=1      → trending public sites (Nexus Code gallery)
 *   GET    /api/live?slug=x         → one site's metadata
 *   PATCH  /api/live                { slug, visibility }
 *   DELETE /api/live?slug=x         → unpublish
 */
import { json, serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { deleteSite, gallery, getSite, isSlug, listSites, publishSite, setSiteVisibility, type SiteVisibility } from "@/lib/live";
import { byteLength, type ModelRef } from "@/lib/forge/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_HTML = 8_000_000;
const MAX_FILES = 200;
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  try {
    if (u.searchParams.get("gallery") === "1") {
      const n = Number(u.searchParams.get("limit") ?? 24);
      return json(200, { sites: await gallery(Number.isFinite(n) ? n : 24) });
    }
    const user = await verifyRequest(req);
    if (!user) return json(401, { code: "UNAUTHENTICATED" });

    const slug = str(u.searchParams.get("slug") ?? "", 64);
    if (slug) {
      if (!isSlug(slug)) return json(400, { code: "BAD_SLUG" });
      const site = await getSite(slug, { owner: user.uid, countView: false });
      if (!site) return json(404, { code: "NOT_FOUND" });
      const { html: _html, ...rest } = site;
      return json(200, { site: rest, urls: { live: `/live/${slug}`, zip: `/live/${slug}?zip=1`, download: `/live/${slug}?download=1` } });
    }
    return json(200, { sites: await listSites(user.uid, Number(u.searchParams.get("limit") ?? 50)) });
  } catch (e) {
    return serverError("live:get", e);
  }
}

export async function POST(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  const rl = rateLimit(`live:${user.uid}`, 20, 60_000);
  if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter ?? 30) });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }

  const html = str(body.html, MAX_HTML + 1000).trim();
  if (!html) return json(400, { code: "NO_HTML" });
  if (byteLength(html) > MAX_HTML) return json(413, { code: "TOO_LARGE", detail: "الملف أكبر من 8 MB" });

  const filesIn = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES) : [];
  const files = filesIn
    .map((f) => {
      const x = (f ?? {}) as { path?: unknown; data?: unknown };
      const p = str(x.path, 160).replace(/\\/g, "/").replace(/^\/+/, "");
      const d = str(x.data, MAX_HTML);
      return p && d ? { path: p, data: d } : null;
    })
    .filter((f): f is { path: string; data: string } => !!f);

  const modelsIn = Array.isArray(body.models) ? body.models.slice(0, 60) : [];
  const models: ModelRef[] = modelsIn
    .map((m): ModelRef | null => {
      const x = (m ?? {}) as Record<string, unknown>;
      const label = str(x.label, 60);
      if (!label) return null;
      const role = str(x.role, 12);
      const mod = str(x.module, 160);
      return {
        key: str(x.key, 60) || label,
        label,
        role: role === "architect" || role === "reviewer" || role === "repair" ? role : "builder",
        ...(mod ? { module: mod } : {}),
      };
    })
    .filter((m): m is ModelRef => !!m);

  const visibility = ["public", "unlisted", "private"].includes(str(body.visibility, 10)) ? (str(body.visibility, 10) as SiteVisibility) : "public";
  const slug = str(body.slug, 64);

  try {
    const out = await publishSite({
      userId: user.uid,
      title: str(body.title, 120) || "مشروع Nexus",
      kind: str(body.kind, 20) || "site",
      language: str(body.language, 6) || "ar",
      html,
      files,
      models,
      visibility,
      slug: slug && isSlug(slug) ? slug : undefined,
    });
    if (!out.ok) return json(out.code === "QUOTA" ? 403 : 400, { code: out.code, detail: out.detail });
    return json(200, out);
  } catch (e) {
    return serverError("live:publish", e);
  }
}

export async function PATCH(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const slug = str(body.slug, 64);
  const visibility = str(body.visibility, 10) as SiteVisibility;
  if (!isSlug(slug) || !["public", "unlisted", "private"].includes(visibility)) return json(400, { code: "BAD_INPUT" });
  const ok = await setSiteVisibility(user.uid, slug, visibility);
  return ok ? json(200, { ok: true, slug, visibility }) : json(404, { code: "NOT_FOUND" });
}

export async function DELETE(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!isSlug(slug)) return json(400, { code: "BAD_SLUG" });
  const ok = await deleteSite(user.uid, slug);
  return ok ? json(200, { ok: true, slug }) : json(404, { code: "NOT_FOUND" });
}
