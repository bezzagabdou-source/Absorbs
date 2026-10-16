import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { completeStandalone } from "@/lib/apex";
import { saveApexProject, liveUrl } from "@/lib/apex/store";
import { PALETTE_IDS } from "@/lib/apex/palettes";

export const runtime = "nodejs";
/** Repairing and verifying a single file is a parse job: fast, but allow a huge paste. */
export const maxDuration = 60;

/**
 * POST /api/apex/standalone
 *
 * "Make the model's code complete." The caller pastes whatever a model produced
 * — markdown, half a file, a Tailwind CDN page, an unterminated fence — and gets
 * back ONE complete, offline, verified page, hosted at a live URL.
 *
 * Body: { code, text?, title?, palette?, save?, inline? }
 * → { ok, project, url, fixed[], warnings[], report, html? }
 */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  /* a guest may repair code (that is the whole point of the open studio); saving
     to the vault follows the same rule as /api/apex/build */
  const limited = rateLimit(`apex-std:${user?.uid ?? `ip:${ip}`}`, user ? 40 : 8, 60_000);
  if (!limited.ok) return json(429, { code: "RATE" }, { "Retry-After": "20" });

  let body: { code?: unknown; text?: unknown; title?: unknown; palette?: unknown; save?: unknown; inline?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }

  const code = typeof body.code === "string" ? body.code.slice(0, 400_000) : "";
  if (code.trim().length < 60) return json(400, { code: "CODE_TOO_SHORT" });
  const text = typeof body.text === "string" ? body.text.slice(0, 2000) : "";
  const title = typeof body.title === "string" ? body.title.slice(0, 90) : undefined;
  const palette = typeof body.palette === "string" && PALETTE_IDS.includes(body.palette as never) ? body.palette : undefined;
  const save = body.save !== false;
  const inline = body.inline === true;

  const started = Date.now();
  try {
    const result = completeStandalone(code, { text, title, palette, source: "api" });
    const meta = {
      id: result.plan.id,
      slug: "",
      title: title ?? result.plan.title,
      tagline: result.plan.tagline,
      blueprint: result.plan.blueprint,
      kind: result.kind,
      palette: result.palette.id,
      emoji: result.kind === "game" ? "🎮" : "🧩",
      lines: result.lines,
      bytes: result.bytes,
      modules: result.modules.length,
      files: 1,
      pages: result.stats.pages,
      dataRows: result.stats.dataRows,
      score: result.score,
      buildMs: Date.now() - started,
    };

    let slug = "";
    let url = "";
    if (save) {
      if (user) await ensureUser(user);
      const stored = await saveApexProject({
        uid: user?.uid ?? "guest",
        title: meta.title,
        tagline: meta.tagline,
        blueprint: meta.blueprint,
        kind: meta.kind,
        palette: meta.palette,
        lang: result.lang,
        scale: "standalone",
        plan: {
          ...result.plan,
          source: "standalone",
          modules: result.modules.map((m) => m.id),
          request: text.slice(0, 400),
        },
        manifest: [{ path: "index.html", lines: result.stats.htmlLines, bytes: result.bytes, lang: "html" }],
        html: result.html,
        modules: meta.modules,
        lines: meta.lines,
        files: 1,
        bytes: meta.bytes,
        score: meta.score,
        dataRows: meta.dataRows,
        buildMs: meta.buildMs,
      });
      slug = stored.slug;
      url = liveUrl(stored.slug);
    }

    return json(200, {
      ok: true,
      engine: "v18-apex-standalone",
      project: { ...meta, slug, url },
      url,
      fixed: result.fixed,
      warnings: result.warnings,
      report: result.report,
      stats: result.stats,
      ...(inline ? { html: result.html } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "standalone failed";
    return json(422, { code: "STANDALONE_FAILED", message });
  }
}
