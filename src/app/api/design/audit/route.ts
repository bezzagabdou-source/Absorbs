/**
 * NEXUS DESIGN v19 — الفحص الاحترافي للمواقع
 * ---------------------------------------------------------------------------
 * POST /api/design/audit   { html? | url? | slug?, lang? }
 *   → { report: AuditReport, source } — نقطة من 100 + ملاحظات مصنّفة بالدليل
 *     (نفس محرّك القواعد الذي يغذّي التحسين بالذكاء الاصطناعي).
 *
 * GET  /api/design/audit?check=1  → صحة قاعدة بيانات التصميم (عدد القواعد/الكاشفات)
 *
 * الفحص محلي 100٪ (بدون استدعاء نموذج) ⇒ مجاني، سريع، وبلا حدود تقريبًا.
 */
import { json, serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { auditHtml } from "@/lib/web-audit";
import { CATS, CAT_AR, DESIGN_RULES, DESIGN_RULE_COUNT, RULE_BY_DETECT } from "@/lib/design-kb";
import { MAX_AUDIT_CHARS, isSourceError, resolveDesignSource } from "@/lib/design-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  try {
    if (u.searchParams.get("check") !== "1") return json(400, { code: "BAD_QUERY" });
    return json(200, {
      ok: DESIGN_RULE_COUNT > 0,
      rules: DESIGN_RULE_COUNT,
      detectors: RULE_BY_DETECT.size,
      categories: CATS.map((c) => ({ id: c, ar: CAT_AR[c], rules: DESIGN_RULES.filter((r) => r.cat === c).length })),
      maxChars: MAX_AUDIT_CHARS,
      version: "v19-design",
    });
  } catch (e) {
    return serverError("design:audit:get", e);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await verifyRequest(req);
    if (!user) return json(401, { code: "UNAUTHENTICATED" });

    const rl = rateLimit(`design:audit:${user.uid}`, 40, 10 * 60_000);
    if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter ?? 60) });

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json(400, { code: "BAD_BODY" });
    }

    const source = await resolveDesignSource(body, user.uid, MAX_AUDIT_CHARS);
    if (isSourceError(source)) return json(400, source);

    const lang = typeof body.lang === "string" && body.lang ? body.lang.slice(0, 12) : undefined;
    const report = auditHtml(source.html, { lang });

    return json(200, {
      report,
      source: { title: source.title, origin: source.origin, chars: source.chars, bytes: source.bytes },
    });
  } catch (e) {
    return serverError("design:audit:post", e);
  }
}
