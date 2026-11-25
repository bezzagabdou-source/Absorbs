import { env } from "@/lib/env";
import { ensureDb, one } from "@/lib/db";
import { aiProviders } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const checks: Record<string, unknown> = {
    service: "chinwi-store",
    site: env.siteUrl,
    hasToken: Boolean(env.botToken),
    hasDatabase: Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL),
    ai: aiProviders(),
  };
  try {
    await ensureDb();
    const db = await one<{ now: string }>("SELECT now()::text AS now");
    const users = await one<{ count: string }>("SELECT count(*)::text AS count FROM users");
    const products = await one<{ count: string }>("SELECT count(*)::text AS count FROM products");
    checks.db = { connected: true, now: db?.now, users: Number(users?.count ?? 0), products: Number(products?.count ?? 0) };
  } catch (err) {
    checks.db = { connected: false, error: String(err).slice(0, 300) };
  }
  return Response.json({ ok: Boolean(checks.hasToken), ...checks });
}
