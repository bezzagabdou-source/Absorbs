import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { discoveryDue, discoveryStep } from "@/lib/emojiDiscovery";
import { testCapabilities, testCore } from "@/lib/emojiOps";
import { loadCfg } from "@/lib/emojiState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ⏰ Vercel Cron (يومي): كيعاود اكتشاف الباقات مرة في الأسبوع، وكيكمّل أي دفعة ما كملاتش.
 * محمي بـ CRON_SECRET (Vercel كيصيفط: Authorization: Bearer <CRON_SECRET>).
 */
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(request.headers.get("authorization") || "");
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const due = await discoveryDue();
  if (!due) {
    const cfg = await loadCfg();
    return NextResponse.json({ ok: true, skipped: true, nextAfter: cfg.discovery.finishedAt + 7 * 24 * 3600_000 });
  }
  // دفعات قصيرة تحت مهلة الدالة (60 ثانية)
  let step = await discoveryStep({ restart: due !== "resume", budgetMs: 20_000 });
  while (step.ok && !step.done && !step.busy && Date.now() - started < 30_000) {
    step = await discoveryStep({ budgetMs: 15_000 });
  }
  let caps = null;
  let core = null;
  if (step.done && step.ok && Date.now() - started < 42_000) {
    caps = await testCapabilities().catch((e) => ({ ok: false, error: String(e) }));
    if (Date.now() - started < 48_000 && (caps as { text?: boolean | null }).text === true) {
      core = await testCore().catch((e) => ({ ok: false, error: String(e) }));
    }
  }
  return NextResponse.json({ ok: step.ok, due, step, caps, core, ms: Date.now() - started });
}
