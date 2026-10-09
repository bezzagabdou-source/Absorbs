import { db, findDatabaseUrl } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { findGeminiKey } from "@/lib/gemini";
import { safeDetail } from "@/lib/http";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Quick self-check: open /api/health after deploying. Never returns secrets. */
export async function GET() {
  const key = findGeminiKey();
  const hasDbUrl = Boolean(findDatabaseUrl());
  let database: { ok: boolean; error?: string } = { ok: false };
  if (!hasDbUrl) {
    database = { ok: false, error: "No DATABASE_URL (or POSTGRES_URL) variable found" };
  } else {
    try {
      await ensureSchema();
      await db.execute(sql`select 1`);
      database = { ok: true };
    } catch (e) {
      database = { ok: false, error: safeDetail(e) };
    }
  }
  // which AI engines have a key (names only, never values)
  const has = (...names: string[]) => names.some((n) => (process.env[n] ?? "").trim().length > 0);
  const engines = {
    gemini: Boolean(key),
    grok: has("GROK_API_KEY", "XAI_API_KEY"),
    openrouter: has("OPENROUTER_API_KEY"),
    huggingface: has("HF_TOKEN", "HUGGINGFACE_API_KEY"),
    claude: has("ANTHROPIC_API_KEY"),
    deepseek: has("DEEPSEEK_API_KEY"),
    groq: has("GROQ_API_KEY"),
  };
  // the app is healthy when the database answers; missing AI keys are reported, not fatal
  const ok = database.ok;
  return Response.json(
    {
      ok,
      database,
      engines,
      enginesOn: Object.values(engines).filter(Boolean).length,
      web: { ok: true, provider: "duckduckgo + r.jina.ai (no key required)" },
      gemini: key ? { ok: true, variable: key.name } : { ok: false, error: "No GEMINI_API_KEY variable found" },
    },
    { status: ok ? 200 : 500 }
  );
}
