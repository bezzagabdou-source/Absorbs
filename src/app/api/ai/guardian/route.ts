import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import {
  blockingIssues,
  guardianPass,
  guardianSummary,
  scanArtefact,
} from "@/lib/guardian";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * NEXUS GUARDIAN — inspect (and optionally repair) any artefact before shipping it.
 *
 * POST { code, kind?: "game" | "site" | "app", repair?: boolean, review?: boolean }
 *   → { score, verdict, summary, before[], after[], repairs, report }
 *
 * `mode: "scan"` (default when `repair` is false and `review` is false) runs the
 * deterministic analyser only: free, instant, and safe on untrusted code.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  let body: { code?: unknown; kind?: unknown; repair?: unknown; review?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }

  const code = typeof body.code === "string" ? body.code.slice(0, 2_000_000) : "";
  if (code.trim().length < 32) return json(400, { code: "MISSING_FIELD" });
  const kind = body.kind === "site" || body.kind === "app" ? body.kind : "game";
  const repair = body.repair === true;
  const review = body.review === true || repair;

  /* the static scan is free — the repair/review path is expensive, so it is capped */
  if (review) {
    const rl = rateLimit(`guardian:${user.uid}`, 12, 60_000);
    if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter) });
  } else {
    const rl = rateLimit(`guardian-scan:${user.uid}`, 60, 60_000);
    if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter) });
  }

  if (!review) {
    const issues = scanArtefact(code);
    const errs = blockingIssues(issues).length;
    const warns = issues.filter((i) => i.level === "warn").length;
    const score = Math.max(0, 100 - errs * 18 - warns * 4);
    return json(200, {
      mode: "scan",
      score,
      verdict: errs === 0 ? "clean" : "issues",
      summary: errs === 0
        ? `✅ فحص الحارس: نظيف (${score}/100)`
        : `🛡️ فحص الحارس: ${errs} خطأ · ${warns} تنبيه (${score}/100)`,
      issues,
      errors: errs,
      warnings: warns,
    });
  }

  const r = await guardianPass(code, {
    kind,
    rounds: repair ? 2 : 0,
    review: true,
    deadlineAt: Date.now() + 45_000,
  });

  return json(200, {
    mode: "full",
    score: r.score,
    verdict: r.verdict,
    summary: guardianSummary(r),
    repairs: r.repairs,
    rounds: r.rounds,
    before: r.before,
    after: r.after,
    report: r.report,
    code: r.code === code ? null : r.code,
  });
}
