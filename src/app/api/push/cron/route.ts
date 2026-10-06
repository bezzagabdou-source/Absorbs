import { json, serverError } from "@/lib/http";
import { pool } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { pushConfigured, sendPush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Call this URL every hour (cron-job.org is free and supports hourly):
 *   https://YOUR-SITE/api/push/cron?key=CRON_SECRET     (or header Authorization: Bearer CRON_SECRET)
 * Sends one notification to every subscribed device; dead subscriptions are removed.
 */
export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const url = new URL(req.url);
  const given = url.searchParams.get("key") ?? (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || given !== secret) return json(401, { code: "UNAUTHORIZED" });
  if (!pushConfigured()) return json(503, { code: "PUSH_NOT_CONFIGURED" });
  try {
    await ensureSchema();
    const { rows } = await pool.query<{ endpoint: string }>("select endpoint from barq.push_subs limit 5000");
    let sent = 0;
    let removed = 0;
    for (let i = 0; i < rows.length; i += 25) {
      const batch = rows.slice(i, i + 25);
      const codes = await Promise.all(batch.map((r) => sendPush(r.endpoint)));
      const dead: string[] = [];
      codes.forEach((c, k) => {
        if (c >= 200 && c < 300) sent++;
        else if (c === 404 || c === 410) dead.push(batch[k].endpoint);
      });
      if (dead.length) {
        await pool.query("delete from barq.push_subs where endpoint = any($1::text[])", [dead]);
        removed += dead.length;
      }
    }
    return json(200, { total: rows.length, sent, removed });
  } catch (e) {
    return serverError("push:cron", e, "DB");
  }
}
