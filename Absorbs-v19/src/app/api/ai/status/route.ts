import { findGeminiKey, listEngines, MODELS } from "@/lib/gemini";
import { ensureSchema } from "@/db/ensure-schema";
import { algeriaToday, tryConsume } from "@/lib/usage";
import { rateLimit } from "@/lib/rate-limit";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostics (never returns the key):
 *   /api/ai/status          → is a Gemini key found + does Google accept it
 *   /api/ai/status?test=1   → also runs a tiny real generation on every model
 *                             and a harmless dry-run of the credits SQL
 */

/** Full diagnostics only for the site owner: header  x-admin-secret: <ADMIN_SECRET>  */
function isAdmin(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < 12) return false;
  const given = req.headers.get("x-admin-secret") ?? "";
  const a = crypto.createHash("sha256").update(secret).digest();
  const b = crypto.createHash("sha256").update(given).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const found = findGeminiKey();
  const team0 = listEngines().map((e) => e.name);
  if (!isAdmin(req)) {
    // public callers only learn whether the AI is up — no key info, no paid test calls
    const up = Boolean(found) || team0.length > 0;
    return Response.json({ ok: up }, { status: up ? 200 : 503 });
  }
  const team = listEngines().map((e) => e.name); // names only, never keys
  if (!found && team.length > 0) {
    return Response.json({ keyFound: false, team, note: "Gemini key missing — other engines are active." });
  }
  if (!found) {
    return Response.json(
      {
        keyFound: false,
        hint: "Add GEMINI_API_KEY in Vercel → Settings → Environment Variables, then Redeploy.",
      },
      { status: 503 }
    );
  }

  let google: { ok: boolean; status: number; message?: string };
  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
      { headers: { "x-goog-api-key": found.value }, cache: "no-store" }
    );
    const txt = res.ok ? "" : (await res.text().catch(() => "")).slice(0, 200);
    google = { ok: res.ok, status: res.status, message: txt || undefined };
  } catch (e) {
    google = { ok: false, status: 0, message: String(e).slice(0, 200) };
  }

  const base = {
    team,
    keyFound: true,
    variableName: found.name,
    keyLength: found.value.length,
    looksLikeGoogleKey: found.value.startsWith("AIza"),
    google,
  };

  if (new URL(req.url).searchParams.get("test") !== "1") {
    return Response.json(base, { status: google.ok ? 200 : 502 });
  }

  if (!rateLimit("status-test", 6, 60_000).ok) {
    return Response.json({ ...base, test: "rate-limited, retry in a minute" }, { status: 429 });
  }

  // 1) real generation on each model (what the chat actually does)
  const models: { model: string; status: number; reply?: string; error?: string }[] = [];
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": found.value },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Say hi in one word." }] }],
            generationConfig: { maxOutputTokens: 32 },
          }),
          cache: "no-store",
        }
      );
      const raw = await res.text().catch(() => "");
      if (res.ok) {
        let reply = "";
        try {
          reply = JSON.parse(raw)?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        } catch {
          /* ignore */
        }
        models.push({ model, status: res.status, reply: String(reply).slice(0, 60) });
      } else {
        models.push({ model, status: res.status, error: raw.slice(0, 300) });
      }
    } catch (e) {
      models.push({ model, status: 0, error: String(e).slice(0, 200) });
    }
  }

  // 2) dry-run of the credits SQL on a user id that doesn't exist (changes nothing)
  let creditsSql: { ok: boolean; error?: string };
  try {
    await ensureSchema();
    await tryConsume("__probe__", algeriaToday(), 25);
    creditsSql = { ok: true };
  } catch (e) {
    creditsSql = { ok: false, error: String(e).slice(0, 300) };
  }

  return Response.json({ ...base, models, creditsSql });
}
