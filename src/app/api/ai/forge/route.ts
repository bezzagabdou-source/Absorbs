/**
 * NEXUS CODE — FORGE v19
 * ---------------------------------------------------------------------------
 * POST /api/ai/forge   { prompt, scale?, kind?, extra?, internet?, publish? }
 *   → one long-lived NDJSON stream of ForgeEvent (see lib/forge/types.ts):
 *     start → architect plan → parallel builders (one model per module) →
 *     assemble → QA → repair → tree → stats → live link → done.
 *
 * GET  /api/ai/forge?lineup=1 → the engines available for this account
 * GET  /api/ai/forge?check=1  → Forge health (used by the smoke test)
 *
 * The build is spread across every reachable model, so no single provider's
 * output limit can cap the size of the project.
 */
import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { takeCredit, refundCredit, getProfile } from "@/lib/usage";
import { forgeBuild } from "@/lib/forge/build";
import { forgeLineup, forgePool } from "@/lib/forge/pool";
import { publishSite } from "@/lib/live";
import { SCALES, SCALE_META, type ForgeEvent, type ForgeKind, type ForgeRequest, type ForgeScale, type ModelRef } from "@/lib/forge/types";
import { PATTERN_CHARS, PATTERN_COUNT } from "@/lib/forge/patterns";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PROMPT = 24_000;
const MAX_EXTRA = 8_000;
const KINDS: ForgeKind[] = ["game", "site", "system", "app", "tool", "landing"];

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

async function planOf(uid: string): Promise<"free" | "pro"> {
  try {
    return (await getProfile(uid))?.plan === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.searchParams.get("check") === "1") {
    const pool = forgePool("pro");
    return json(200, {
      ok: pool.length > 0,
      engines: pool.length,
      lineup: pool.map((m) => ({ key: m.key, label: m.label, roles: m.roles, maxTokens: m.maxTokens })),
      scales: SCALES,
      kinds: KINDS,
      duo: true,
      thinking: true,
      openEngines: pool.filter((m) => m.open).length,
      freeEngines: pool.filter((m) => m.free).length,
      recipes: PATTERN_COUNT,
      recipeChars: PATTERN_CHARS,
      version: "v20-forge",
    });
  }

  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const plan = await planOf(user.uid);
  return json(200, {
    plan,
    engines: forgePool(plan).length,
    lineup: forgeLineup(plan),
    scales: SCALES.map((s) => ({ id: s, ...SCALE_META[s] })),
    /** the local recipe database every builder prompt is fed from (real counts) */
    recipes: PATTERN_COUNT,
    kinds: KINDS,
  });
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

  const prompt = str(body.prompt, MAX_PROMPT).trim();
  if (prompt.length < 4) return json(400, { code: "BAD_PROMPT" });

  const plan = await planOf(user.uid);
  const scaleRaw = str(body.scale, 12) as ForgeScale;
  const scale: ForgeScale = SCALES.includes(scaleRaw) ? scaleRaw : plan === "pro" ? "titan" : "big";
  const kindRaw = str(body.kind, 12) as ForgeKind;
  const kind = KINDS.includes(kindRaw) ? kindRaw : undefined;
  const publish = body.publish !== false; // a live link by default — that is the point of v19

  const rl = rateLimit(`forge:${user.uid}`, plan === "pro" ? 10 : 4, 10 * 60_000);
  if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter ?? 60) });

  const taken = await takeCredit(user);
  if (taken && !taken.ok) return json(429, { code: "QUOTA" });
  const tracked = !!taken && taken.tracked;

  const request: ForgeRequest = {
    prompt,
    kind,
    scale,
    extra: str(body.extra, MAX_EXTRA).trim(),
    internet: body.internet !== false,
    publish,
    /* v20 — DUO: two engines + a locally computed plan (fastest first token),
       and `thinking`: stream the engines' real reasoning to the workspace. */
    duo: body.duo === true,
    thinking: body.thinking !== false,
    userId: user.uid,
  };

  const encoder = new TextEncoder();
  let refunded = false;
  const refundOnce = async () => {
    if (refunded) return;
    refunded = true;
    if (tracked) {
      try {
        await refundCredit(user.uid);
      } catch {
        /* ignore */
      }
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ForgeEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* the client hung up */
        }
      };

      let html = "";
      let tree: { path: string; data: string }[] = [];
      let title = "مشروع Nexus";
      let kindOut: string = "site";
      let langOut = "ar";
      let models: ModelRef[] = [];
      let sawDone = false;

      try {
        for await (const e of forgeBuild(request, { plan, userId: user.uid, signal: req.signal })) {
          if (e.t === "html") html = e.html;
          else if (e.t === "tree") tree = e.files;
          else if (e.t === "plan") {
            title = e.plan.title || title;
            kindOut = e.plan.kind;
            langOut = e.plan.language;
          } else if (e.t === "stats") models = e.meta.models;
          else if (e.t === "error") await refundOnce();
          else if (e.t === "done") {
            sawDone = true;
            /* ---- publish the live link before telling the client we are done ---- */
            if (publish && html) {
              send({ t: "stage", stage: "publish", label: "نشر الرابط الحي", pct: 98, state: "working" });
              try {
                const out = await publishSite({ userId: user.uid, title, kind: kindOut, language: langOut, html, files: tree, models });
                if (out.ok) send({ t: "live", url: out.url, slug: out.slug, kind: out.mode });
                else send({ t: "log", text: `تعذّر النشر: ${out.detail}` });
                if ("note" in out && out.note) send({ t: "log", text: out.note });
              } catch (e2) {
                send({ t: "log", text: `تعذّر النشر: ${(e2 as Error).message?.slice(0, 120) ?? "error"}` });
              }
            }
          }
          send(e);
        }
        if (!sawDone) await refundOnce();
      } catch (e) {
        await refundOnce();
        send({ t: "error", code: "ENGINE_DOWN", detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      void refundOnce();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-nexus": "v19-forge",
      "x-forge-plan": plan,
      "x-forge-scale": scale,
      "x-accel-buffering": "no",
    },
  });
}
