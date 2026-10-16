import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { planFromText, buildApexProject, suggestBlueprints, PALETTE_IDS, BLUEPRINT_IDS, type Scale } from "@/lib/apex";
import { APEX_MODULES, APEX_MODULE_STATS } from "@/lib/apex/modules";
import { BLUEPRINTS } from "@/lib/apex/blueprints";
import { PALETTES } from "@/lib/apex/palettes";
import { saveApexProject, liveUrl } from "@/lib/apex/store";

export const runtime = "nodejs";
/** Deterministic builds take ~60 ms; the margin covers a huge "legend" project. */
export const maxDuration = 60;

const SCALES = new Set<Scale>(["standard", "large", "legend"]);

/**
 * GET /api/apex/build
 *
 * The catalogue behind the studio: every blueprint, every palette and the size of
 * the embedded engine. No auth: it is public information that lets the UI render
 * the pickers without shipping the engine to the client.
 */
export async function GET() {
  return json(
    200,
    {
      engine: "NEXUS APEX v18",
      modules: { count: APEX_MODULE_STATS.count, lines: APEX_MODULE_STATS.lines, bytes: APEX_MODULE_STATS.bytes },
      moduleList: APEX_MODULES.map((m) => ({ id: m.id, title: m.title, domain: m.domain, lines: m.lines })),
      blueprints: BLUEPRINTS.map((b) => ({
        id: b.id,
        label: b.label,
        kind: b.kind,
        pages: b.pages.length,
        modules: b.modules.length,
        pitch: b.pitch,
      })),
      palettes: PALETTES.map((p) => ({ id: p.id, label: p.label, mode: p.mode })),
      scales: [
        { id: "standard", lines: "1 200+" },
        { id: "large", lines: "3 000+" },
        { id: "legend", lines: "6 000+" },
      ],
    },
    { "Cache-Control": "public, max-age=300" }
  );
}

/**
 * POST /api/apex/build
 *
 * The heart of NEXUS APEX: the caller sends a plain request ("متجر إلكتروني ضخم…")
 * or an explicit plan, and the deterministic engine writes the whole project —
 * thousands of lines, real datasets, dozens of files — with no model in the loop,
 * so nothing can be truncated and nothing comes back half-finished.
 *
 * Body: { text?, blueprint?, palette?, scale?, title?, modules?, pages?, save?, inline? }
 * → { ok, project: meta, url, report, files?: [...], html?: "..." }
 */
export async function POST(req: Request) {
  /* the studio is open: a guest can build and preview (rate-limited by IP);
     only saving to the vault, publishing and GitHub deploys need an account */
  const user = await verifyRequest(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

  let body: {
    text?: unknown;
    blueprint?: unknown;
    palette?: unknown;
    scale?: unknown;
    title?: unknown;
    modules?: unknown;
    save?: unknown;
    inline?: unknown;
    pages?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }

  const text = typeof body.text === "string" ? body.text.slice(0, 4000) : "";
  const blueprint = typeof body.blueprint === "string" && BLUEPRINT_IDS.includes(body.blueprint) ? body.blueprint : undefined;
  const palette = typeof body.palette === "string" && PALETTE_IDS.includes(body.palette as never) ? body.palette : undefined;
  const scale = typeof body.scale === "string" && SCALES.has(body.scale as Scale) ? (body.scale as Scale) : undefined;
  const title = typeof body.title === "string" ? body.title.slice(0, 90) : undefined;
  const modules = Array.isArray(body.modules) ? body.modules.filter((m): m is string => typeof m === "string").slice(0, 40) : undefined;
  const pages = Array.isArray(body.pages) ? body.pages.filter((p): p is string => typeof p === "string").slice(0, 30) : undefined;
  const save = body.save !== false;
  const inline = body.inline === true;

  if (!text && !blueprint) return json(400, { code: "NOTHING_TO_BUILD" });

  const limited = rateLimit(`apex:${user?.uid ?? `ip:${ip}`}`, user ? 40 : 8, 60_000);
  if (!limited.ok) return json(429, { code: "RATE" }, { "Retry-After": "20" });

  try {
    if (user) await ensureUser(user);

    const read = planFromText(text || blueprint || "", { blueprint, palette, scale, title, modules, pages });
    const started = Date.now();
    const built = buildApexProject({ plan: read.plan, text });

    const meta = {
      id: built.id,
      slug: "",
      title: built.title,
      tagline: built.tagline,
      blueprint: built.blueprint,
      kind: built.kind,
      palette: built.palette,
      emoji: built.emoji,
      dir: built.dir,
      stats: built.stats,
      report: built.report,
      summary: built.summary,
      buildMs: built.buildMs || Date.now() - started,
      url: "" as string,
      preview: "" as string,
      visibility: "private" as string,
      createdAt: built.createdAt,
      reading: read.reading,
      alternatives: suggestBlueprints(text || blueprint || "", 3),
    };

    if (save) {
      const stored = await saveApexProject({
        uid: user?.uid ?? "guest",
        title: built.title,
        tagline: built.tagline,
        blueprint: built.blueprint,
        kind: built.kind,
        palette: built.palette,
        lang: built.lang,
        scale: built.plan.scale,
        plan: built.plan as unknown as Record<string, unknown>,
        manifest: built.files.map((f) => ({ path: f.path, lines: f.lines, bytes: f.bytes, lang: f.lang })),
        html: built.html,
        modules: built.stats.modules,
        lines: built.stats.lines,
        files: built.stats.files,
        bytes: built.stats.bytes,
        score: built.stats.score,
        dataRows: built.stats.dataRows,
        buildMs: meta.buildMs,
      });
      meta.slug = stored.slug;
      meta.url = liveUrl(stored.slug);
      meta.preview = `${liveUrl(stored.slug)}?embed=1`;
      meta.visibility = stored.visibility;
    }

    return json(200, {
      ok: true,
      engine: "v18-apex",
      project: meta,
      url: meta.url,
      report: built.report,
      files: inline ? built.files.map((f) => ({ path: f.path, lang: f.lang, lines: f.lines, bytes: f.bytes, code: f.code })) : built.files.map((f) => ({ path: f.path, lang: f.lang, lines: f.lines, bytes: f.bytes })),
      ...(inline ? { html: built.html } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "build failed";
    return json(500, { code: "BUILD_FAILED", message });
  }
}
