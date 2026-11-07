import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
/** Atomic database bucket works across instances. Reverse proxy must overwrite x-real-ip. */
export async function checkRateLimit(identity: string, limit: number, windowMs: number) {
  const key = createHash("sha256").update(identity).digest("hex");
  const result = await getDb().execute(sql`select * from consume_rate_limit(${key}, ${limit}, ${windowMs})`);
  const row = result.rows[0] as { allowed: boolean; retry_after: number };
  return { allowed: row.allowed, retryAfter: row.retry_after };
}
