import { json } from "@/lib/http";
import { MAX_OUTPUT_TOKENS, PRO_OUTPUT_TOKENS } from "@/lib/limits";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { takeCredit, refundCredit, getProfile } from "@/lib/usage";
import {
  streamGemini,
  streamToResponse,
  withAutoContinue,
  GeminiError,
  type ChatTurn,
} from "@/lib/gemini";
import {
  FILE_SYSTEM,
  PLAN_SYSTEM,
  MEGA_MAX_FILE,
  MEGA_MAX_FILES,
  fileUserPrompt,
  minTotalKb,
  parsePlan,
  planTotalKb,
  planUserPrompt,
  scalePlan,
  type MegaPlan,
  safePath,
  type MegaFileRequest,
} from "@/lib/mega";
import { MAX_STUDIO_ADDON } from "@/lib/max-engine";
import { streamSelectedModel } from "@/lib/model-router";

/**
 * Backup engines for the builder: if Gemini cannot start a stream (quota, outage, overload),
 * Grok and then OpenRouter write the same plan / file instead, so one provider never freezes a build.
 */
async function streamBackup(system: string, messages: ChatTurn[], maxTokens: number): Promise<ReadableStream<string> | null> {
  for (const provider of ["grok", "openrouter"] as const) {
    try {
      return await streamSelectedModel({
        selection: { provider },
        system,
        messages,
        maxTokens: Math.min(maxTokens, 16_000),
        onModel: () => {},
        onDone: () => {},
      });
    } catch (e) {
      console.error(`[mega] backup ${provider} failed:`, e instanceof Error ? e.message : String(e));
    }
  }
  return null;
}

export const runtime = "nodejs";
export const maxDuration = 300; // Hobby max. Vercel Pro: you may raise to 800 (then also raise REQUEST_* in lib/limits.ts)

async function readAll(stream: ReadableStream<string>): Promise<string> {
  const r = stream.getReader();
  let out = "";
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    out += value;
  }
  return out;
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const phase = body.phase;
  const prompt = str(body.prompt, 12_000).trim();
  if (prompt.length < 4) return json(400, { code: "BAD_PROMPT" });

  /* ---------------- phase 1: the architect plans the file tree (costs ONE credit) ---------------- */
  if (phase === "plan") {
    if (!rateLimit(`mega-plan:${user.uid}`, 6, 60_000).ok) return json(429, { code: "RATE" }, { "Retry-After": "20" });
    const taken = await takeCredit(user);
    if (taken && !taken.ok) return json(429, { code: "QUOTA" });
    const tracked = !!taken && taken.tracked;
    if (!taken || taken.plan !== "pro") {
      // the server is the real gate: mega projects are Pro only
      let pro = false;
      try {
        pro = (await getProfile(user.uid))?.plan === "pro";
      } catch {
        pro = false;
      }
      if (!pro) {
        if (tracked) await refundCredit(user.uid);
        return json(403, { code: "PRO_ONLY" });
      }
    }
    try {
      let best: MegaPlan | null = null;
      let extra = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        const planMessages: ChatTurn[] = [{ role: "user", text: planUserPrompt(prompt) + extra }];
        let stream: ReadableStream<string>;
        try {
          stream = await streamGemini({
            system: PLAN_SYSTEM + MAX_STUDIO_ADDON,
            messages: planMessages,
            tier: "pro",
            primaryFirst: true,
            mode: "speed",
            lowThink: true,
            task: "code",
            temperature: 0.5,
            maxTokens: PRO_OUTPUT_TOKENS,
          });
        } catch (e) {
          const backup = await streamBackup(PLAN_SYSTEM + MAX_STUDIO_ADDON, planMessages, PRO_OUTPUT_TOKENS);
          if (!backup) throw e;
          stream = backup;
        }
        const plan = parsePlan(await readAll(stream));
        if (!plan) continue;
        if (!best || planTotalKb(plan) > planTotalKb(best)) best = plan;
        const min = minTotalKb(plan.kind, prompt);
        if (planTotalKb(plan) >= min * 0.8) break;
        // too small for this kind of project: ask the architect again, with the exact numbers
        extra = `\n\nYOUR PREVIOUS PLAN WAS TOO SMALL (${planTotalKb(plan)} KB, ${plan.files.length} files). Return a NEW, bigger plan: at least ${min} KB in total and at least ${Math.ceil(min / 90)} files, every file with a real job (more systems, levels, pages, data, features).`;
      }
      if (best) {
        const fixed = scalePlan(best, minTotalKb(best.kind, prompt));
        return json(200, { plan: fixed });
      }
      throw new GeminiError("ERROR", "plan could not be parsed");
    } catch (e) {
      console.error("[mega] plan failed:", e);
      if (tracked) await refundCredit(user.uid);
      return json(502, { code: "ERROR" });
    }
  }

  /* ---------------- phase 2: ONE file per request (free: the credit was paid at the plan) ---------------- */
  if (phase === "file") {
    if (!rateLimit(`mega-file:${user.uid}`, 120, 60_000).ok) return json(429, { code: "RATE" }, { "Retry-After": "15" });
    let pro = false;
    try {
      pro = (await getProfile(user.uid))?.plan === "pro";
    } catch {
      pro = false;
    }
    if (!pro) return json(403, { code: "PRO_ONLY" });

    const path = safePath(body.path);
    if (!path) return json(400, { code: "BAD_PATH" });
    const planIn = Array.isArray(body.plan) ? body.plan.slice(0, MEGA_MAX_FILES) : [];
    const plan = planIn
      .map((f) => {
        const x = (f ?? {}) as { path?: unknown; desc?: unknown; kb?: unknown };
        const p = safePath(x.path);
        return p ? { path: p, desc: str(x.desc, 400), kb: typeof x.kb === "number" ? Math.min(Math.max(x.kb, 1), 150) : 20 } : null;
      })
      .filter((f): f is { path: string; desc: string; kb: number } => !!f);
    const needIn = Array.isArray(body.needTexts) ? body.needTexts.slice(0, 4) : [];
    const needTexts = needIn
      .map((n) => {
        const x = (n ?? {}) as { path?: unknown; text?: unknown };
        const p = safePath(x.path);
        return p ? { path: p, text: str(x.text, 60_000) } : null;
      })
      .filter((n): n is { path: string; text: string } => !!n);

    const request: MegaFileRequest = {
      prompt,
      title: str(body.title, 80),
      contract: str(body.contract, 8000),
      plan,
      path,
      desc: str(body.desc, 400),
      kb: typeof body.kb === "number" ? Math.min(Math.max(body.kb, 1), 150) : 20,
      digest: str(body.digest, 40_000),
      needTexts,
    };
    const messages: ChatTurn[] = [{ role: "user", text: fileUserPrompt(request) }];
    try {
      const fileTokens = Math.min(MAX_OUTPUT_TOKENS, Math.max(16_000, Math.round(request.kb * 450)));
      let base: ReadableStream<string> | null = null;
      try {
        base = await streamGemini({
          system: FILE_SYSTEM + MAX_STUDIO_ADDON,
          messages,
          tier: "pro",
          primaryFirst: true,
          mode: "speed",
          lowThink: true,
          task: "code",
          temperature: 0.6,
          maxTokens: fileTokens,
        });
      } catch (e) {
        const backup = await streamBackup(FILE_SYSTEM + MAX_STUDIO_ADDON, messages, fileTokens);
        if (!backup) throw e;
        return streamToResponse(backup, { "x-mega-max": String(MEGA_MAX_FILE), "x-engine": "backup" });
      }
      // if the file is cut by the token limit, it is continued (up to 12 rounds) inside this same request
      const stream = withAutoContinue(base, { system: FILE_SYSTEM + MAX_STUDIO_ADDON, messages, rounds: 12 });
      return streamToResponse(stream, { "x-mega-max": String(MEGA_MAX_FILE) });
    } catch (e) {
      console.error("[mega] file failed:", e);
      return json(502, { code: e instanceof GeminiError ? e.code : "ERROR" });
    }
  }

  return json(400, { code: "BAD_PHASE" });
}
