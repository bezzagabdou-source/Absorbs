import crypto from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import {
  AI_TASKS,
  generateAIResult,
  getProviderStatus,
  isAITask,
  AIProviderError,
} from "@/lib/ai-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Owner-only test of src/lib/ai-providers.ts (never returns keys):
 *
 *   /api/ai/test?secret=<ADMIN_SECRET>                      → which providers have a key
 *   /api/ai/test?secret=<ADMIN_SECRET>&task=code            → real call, shows provider + model + answer
 *   &task=fast | grok | reasoning   &prompt=your text (optional)
 *
 * The secret can also be sent as the header  x-admin-secret.
 */
function isAdmin(req: Request, url: URL): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < 12) return false;
  const given = req.headers.get("x-admin-secret") ?? url.searchParams.get("secret") ?? "";
  const a = crypto.createHash("sha256").update(secret).digest();
  const b = crypto.createHash("sha256").update(given).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!isAdmin(req, url)) return Response.json({ ok: false }, { status: 404 });
  if (!rateLimit("ai-test", 10, 60_000).ok) {
    return Response.json({ ok: false, error: "rate-limited, retry in a minute" }, { status: 429 });
  }

  const providers = getProviderStatus();
  const task = url.searchParams.get("task");
  if (!task) return Response.json({ ok: true, providers, tasks: AI_TASKS });
  if (!isAITask(task)) {
    return Response.json({ ok: false, error: `task must be one of: ${AI_TASKS.join(", ")}`, providers }, { status: 400 });
  }

  const prompt = (url.searchParams.get("prompt") ?? "Say hello in one short sentence.").slice(0, 2000);
  const t0 = Date.now();
  try {
    const r = await generateAIResult(task, prompt, { maxTokens: 400, timeoutMs: 30_000 });
    return Response.json({
      ok: true,
      task,
      provider: r.provider,
      model: r.model,
      ms: Date.now() - t0,
      text: r.text,
      skipped: r.failed.map((f) => `${f.provider}/${f.model}: ${f.code}`),
      providers,
    });
  } catch (e) {
    const err = e instanceof AIProviderError ? e : null;
    return Response.json(
      {
        ok: false,
        task,
        code: err?.code ?? "UPSTREAM",
        error: err?.message ?? "unexpected error",
        attempts: err?.attempts.map((a) => `${a.provider}/${a.model}: ${a.code}`) ?? [],
        providers,
      },
      { status: 502 }
    );
  }
}
