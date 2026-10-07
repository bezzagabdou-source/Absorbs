import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { getProfile } from "@/lib/usage";
import { GeminiError, streamGemini, streamToResponse, type Attachment } from "@/lib/gemini";
import { buildContext, fetchReference, WORKSPACE_SYSTEM, type WsDoc } from "@/lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const MAX_BODY = 4_000_000;

type Body = {
  question?: unknown;
  docs?: unknown;
  files?: unknown;
  urls?: unknown;
  history?: unknown;
};

export async function POST(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return json(413, { code: "TOO_BIG" });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 4000) : "";
  if (question.length < 2) return json(400, { code: "MISSING_FIELD" });

  const prof = await getProfile(user.uid).catch(() => null);
  const pro = prof?.plan === "pro";
  const rl = rateLimit(`ws:${user.uid}`, pro ? 12 : 5, 60_000);
  if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter) });

  // text documents (already extracted in the browser: code, zips, text, csv…)
  const docs: WsDoc[] = [];
  if (Array.isArray(body.docs)) {
    for (const d of body.docs.slice(0, 20)) {
      const o = d as { name?: unknown; text?: unknown };
      if (typeof o.name === "string" && typeof o.text === "string" && o.text.trim()) {
        docs.push({ name: o.name.slice(0, 120), text: o.text.slice(0, 1_500_000) });
      }
    }
  }

  // PDFs / images go to the model natively
  const attachments: Attachment[] = [];
  let b64 = 0;
  if (Array.isArray(body.files)) {
    for (const f of body.files.slice(0, 4)) {
      const o = f as { mime?: unknown; data?: unknown };
      if (
        typeof o.mime === "string" && /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(o.mime) &&
        typeof o.data === "string" && /^[A-Za-z0-9+/=]+$/.test(o.data)
      ) {
        b64 += o.data.length;
        if (b64 > 3_600_000) return json(413, { code: "TOO_BIG" });
        attachments.push({ mime: o.mime, data: o.data });
      }
    }
  }

  // web references
  const failedUrls: string[] = [];
  if (Array.isArray(body.urls)) {
    const urls = body.urls.filter((u): u is string => typeof u === "string").slice(0, 4);
    const got = await Promise.allSettled(urls.map((u) => fetchReference(u)));
    got.forEach((g, i) => {
      if (g.status === "fulfilled" && g.value.text.trim()) docs.push(g.value);
      else failedUrls.push(urls[i].slice(0, 120));
    });
  }

  if (docs.length === 0 && attachments.length === 0) return json(400, { code: "NO_MATERIAL", failedUrls });

  const { context, mode, sources } = buildContext(docs, question);
  const prompt = [
    docs.length ? `MATERIAL (${mode === "whole" ? "complete" : "most relevant parts only"})\nSources: ${sources.join(" | ")}\n\n${context}` : "",
    attachments.length ? `(${attachments.length} attached image/PDF file(s) are included with this message.)` : "",
    failedUrls.length ? `(Could not read: ${failedUrls.join(", ")} — tell the user.)` : "",
    `QUESTION\n${question}`,
  ].filter(Boolean).join("\n\n");

  const history: { role: "user" | "model"; text: string }[] = [];
  if (Array.isArray(body.history)) {
    for (const h of body.history.slice(-6)) {
      const o = h as { role?: unknown; text?: unknown };
      if ((o.role === "user" || o.role === "model") && typeof o.text === "string") {
        history.push({ role: o.role, text: o.text.slice(0, 3000) });
      }
    }
  }

  try {
    const stream = await streamGemini({
      system: WORKSPACE_SYSTEM,
      messages: [...history, { role: "user", text: prompt }],
      tier: pro || attachments.length > 0 ? "pro" : "free",
      mode: pro ? "quality" : "speed",
      maxTokens: 8192,
      attachments,
      primaryFirst: pro,
    });
    return streamToResponse(stream, { "X-Ws-Mode": mode, "X-Ws-Docs": String(docs.length) });
  } catch (e) {
    if (e instanceof GeminiError) return json(503, { code: "NO_PROVIDER" });
    console.error("[workspace]", e);
    return json(500, { code: "ERROR" });
  }
}
