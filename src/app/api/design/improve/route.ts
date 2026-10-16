/**
 * NEXUS DESIGN v19 — التحسين بالذكاء الاصطناعي
 * ---------------------------------------------------------------------------
 * POST /api/design/improve { html? | url? | slug?, depth?, lang?, keep?, ruleIds?, publish?, title? }
 *   → NDJSON stream of ImproveEvent (see lib/web-audit.ts):
 *     start → stage → delta… → html → audit → live → done
 *
 * كيف يعمل:
 *   1) نفحص المستند محليًا بمحرّك القواعد (design-kb + web-audit) ⇒ «قبل».
 *   2) نبني نصًا نظاميًا = هوية Nexus + قانون التصميم المركّز على الملاحظات
 *      المكتشفة فعلًا + عقد إخراج صارم (ملف كامل، بلا نقصان).
 *   3) نُشغّل أقوى محرّك متاح (وحوض المحرّكات يتبادل الأدوار تلقائيًا) ونبثّ
 *      الرموز حيّة، ثم نعيد الفحص ⇒ «بعد».
 *   4) إذا لم ترتفع النقطة، محاولة ثانية بمحرّك مختلف ونأخذ الأفضل.
 *   5) نشر اختياري ⇒ رابط حي (`/live/slug` أو رابط محمول بلا قاعدة بيانات).
 */
import { json, serverError, safeDetail } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { getProfile, refundCredit, takeCredit } from "@/lib/usage";
import { publishSite } from "@/lib/live";
import { stripFence } from "@/lib/forge/assemble";
import { forgeRolePool, pickEngine, streamForgeModel, type ForgeModel } from "@/lib/forge/pool";
import { countLines, byteLength } from "@/lib/forge/types";
import { auditHtml, improveBrief, type AuditReport } from "@/lib/web-audit";
import { designSystem, DEPTH_META, DEPTH_AR, DESIGN_DEPTHS, type DesignDepth } from "@/lib/design-contract";
import { MAX_DOC_CHARS, isSourceError, resolveDesignSource } from "@/lib/design-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_KEEP = 2_000;
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

async function planOf(uid: string): Promise<"free" | "pro"> {
  try {
    return (await getProfile(uid))?.plan === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}

/** يضمن أن المخرج مستند HTML كامل (النموذج أحيانًا يبعث قطعة فقط). */
function toDocument(code: string, original: string): string {
  let out = stripFence(code, "html").trim();
  if (!out) return "";
  if (!/^<!doctype html|^<html/i.test(out)) {
    // a fragment: graft it into a real shell instead of shipping a half file
    const lang = /lang=["']?(ar|fr|en)/i.exec(original)?.[1] ?? "en";
    const dir = lang === "ar" ? "rtl" : "ltr";
    out = `<!doctype html>\n<html lang="${lang}" dir="${dir}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${
      /<title[^>]*>([\s\S]*?)<\/title>/i.exec(original)?.[1]?.trim() || "Nexus Design"
    }</title>\n</head>\n<body>\n${out}\n</body>\n</html>`;
  }
  return out;
}

export async function POST(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }

  const depthRaw = str(body.depth, 12) as DesignDepth;
  const depth: DesignDepth = DESIGN_DEPTHS.includes(depthRaw) ? depthRaw : "deep";
  const lang = (str(body.lang, 12) || "ar").toLowerCase();
  const keep = str(body.keep, MAX_KEEP).trim();
  const title = str(body.title, 120).trim();
  const publish = body.publish !== false;
  const slugHint = str(body.slug, 64).trim();

  const plan = await planOf(user.uid);
  const rl = rateLimit(`design:improve:${user.uid}`, plan === "pro" ? 14 : 6, 10 * 60_000);
  if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter ?? 60) });

  let source;
  try {
    source = await resolveDesignSource(body, user.uid, MAX_DOC_CHARS);
  } catch (e) {
    return serverError("design:improve:source", e);
  }
  if (isSourceError(source)) return json(400, source);

  const before: AuditReport = auditHtml(source.html, { lang });

  const taken = await takeCredit(user);
  if (taken && !taken.ok) return json(429, { code: "QUOTA" });
  const tracked = !!taken && taken.tracked;

  const engine = pickEngine("builder", plan);
  const backups = forgeRolePool("builder", plan).filter((m) => m.key !== engine?.key);
  if (!engine) {
    if (tracked) await refundCredit(user.uid).catch(() => undefined);
    return json(503, { code: "NO_ENGINE", detail: "لا يوجد محرّك متاح الآن" });
  }

  const encoder = new TextEncoder();
  const signal = req.signal;
  let refunded = false;
  const refundOnce = async () => {
    if (refunded) return;
    refunded = true;
    if (tracked) await refundCredit(user.uid).catch(() => undefined);
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (e: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          closed = true;
        }
      };
      const fail = async (code: string, detail?: string) => {
        send({ t: "error", code, detail });
        await refundOnce();
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };

      try {
        const system = designSystem({ depth, lang, ruleIds: before.ruleIds, keep });
        const prompt = `${improveBrief(before, { lang, keep })}\n\n=== CURRENT DOCUMENT (${source.chars.toLocaleString("en")} chars) ===\n${source.html}\n=== END OF DOCUMENT ===`;

        send({ t: "start", model: engine.label, before: before.score, findings: before.findings.length, lines: countLines(source.html) });
        send({ t: "stage", label: `فحص أولي — ${before.score}/100` });

        /** محاولة واحدة بمحرّك معيّن: نبثّ الرموز ونعيد المستند + نقطته. */
        const runOnce = async (m: ForgeModel, attempt: number): Promise<{ html: string; report: AuditReport; model: string; ms: number }> => {
          let out = "";
          let pending = "";
          let last = Date.now();
          const flush = (force = false) => {
            if (!pending) return;
            if (!force && pending.length < 480 && Date.now() - last < 110) return;
            send({ t: "delta", d: pending });
            pending = "";
            last = Date.now();
          };

          send({ t: "stage", label: attempt === 1 ? `${DEPTH_AR[depth]} — ${m.label}` : `محاولة ثانية بمحرّك ${m.label}` });
          const it = streamForgeModel(m, {
            system,
            prompt,
            maxTokens: DEPTH_META[depth].maxTokens,
            signal,
          })[Symbol.asyncIterator]();
          let realModel = m.label;
          let ms = 0;
          for (;;) {
            const step = await it.next();
            if (step.done) {
              if (step.value) {
                realModel = step.value.model || m.label;
                ms = step.value.ms;
              }
              break;
            }
            if (signal.aborted) break;
            out += step.value;
            pending += step.value;
            flush();
          }
          flush(true);

          const html = toDocument(out, source.html);
          if (!html) throw Object.assign(new Error("empty model output"), { code: "EMPTY_OUTPUT" });
          send({ t: "html", html, lines: countLines(html), bytes: byteLength(html) });
          const report = auditHtml(html, { lang });
          send({ t: "audit", report });
          send({ t: "stage", label: `بعد التحسين — ${report.score}/100` });
          return { html, report, model: realModel, ms };
        };

        const t0 = Date.now();
        let best = await runOnce(engine, 1);

        // لم تتحسّن النقطة؟ نحوّل المهمة لمحرّك آخر (دمج المحرّكات) ونأخذ الأفضل.
        if (best.report.score <= before.score && backups.length > 0 && !signal.aborted) {
          try {
            const second = await runOnce(backups[0], 2);
            if (second.report.score > best.report.score) best = second;
          } catch (e) {
            send({ t: "stage", label: `المحرّك الاحتياطي فشل (${safeDetail(e)}) — نكمل بالأول` });
          }
        }

        if (publish) {
          send({ t: "stage", label: "نشر الرابط الحي" });
          try {
            const res = await publishSite({
              userId: user.uid,
              title: title || `${source.title} — محسَّن`,
              kind: "site",
              language: lang,
              html: best.html,
              models: [{ key: best.model, label: best.model, role: "designer", ms: best.ms }],
              slug: slugHint || undefined,
            });
            if (res.ok) send({ t: "live", url: res.url, slug: res.slug });
            else send({ t: "stage", label: `النشر تعذّر (${res.detail}) — حمّل الملف مباشرة` });
          } catch (e) {
            send({ t: "stage", label: `النشر تعذّر (${safeDetail(e)})` });
          }
        }

        send({ t: "done", before: before.score, after: best.report.score, model: best.model, ms: Date.now() - t0 });
        if (!closed) {
          closed = true;
          controller.close();
        }
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (signal.aborted) await fail("CANCELLED");
        else await fail(code || "IMPROVE_FAILED", safeDetail(e));
      }
    },
    cancel() {
      void refundOnce();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
      "x-nexus": "design-improve",
      "x-design-depth": depth,
      "x-design-before": String(before.score),
    },
  });
}
