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
  const ok = database.ok && Boolean(key);
  return Response.json(
    {
      ok,
      database,
      gemini: key ? { ok: true, variable: key.name } : { ok: false, error: "No GEMINI_API_KEY variable found" },
    },
    { status: ok ? 200 : 500 }
  );
}
