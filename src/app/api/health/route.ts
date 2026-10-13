import { db } from "@/db";
import { findDatabaseUrl } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Model providers that have a key on this deployment (names only — never the keys). */
const PROVIDER_KEYS = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
] as const;

/** Small diagnostic endpoint: is the database reachable, and which providers are wired? */
export async function GET() {
  const providers = PROVIDER_KEYS.filter((k) => (process.env[k] ?? "").trim().length > 0);
  const dbConfigured = Boolean(findDatabaseUrl());

  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "reachable", providers });
  } catch {
    // No raw driver message here — it can contain the host/user of the connection string.
    return Response.json(
      {
        ok: false,
        db: dbConfigured ? "unreachable" : "not-configured",
        hint: dbConfigured
          ? "DATABASE_URL is set but the database did not answer — check the URL, the password, or the provider status."
          : "DATABASE_URL is missing — add it in your host's Environment Variables, then redeploy.",
        providers,
      },
      { status: 500 },
    );
  }
}
