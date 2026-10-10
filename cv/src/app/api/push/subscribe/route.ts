import { json, serverError } from "@/lib/http";
import { pool } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { pushConfigured, vapidPublicKey } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → the public VAPID key the browser needs to subscribe. */
export async function GET() {
  if (!pushConfigured()) return json(503, { code: "PUSH_NOT_CONFIGURED" });
  return json(200, { key: vapidPublicKey() });
}

/** POST { subscription } → store this device. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "x";
  if (!rateLimit(`push:${ip}`, 20, 60_000).ok) return json(429, { code: "RATE" });
  let body: { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const sub = body.subscription;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) return json(400, { code: "BAD_SUBSCRIPTION" });
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh.slice(0, 200) : null;
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth.slice(0, 100) : null;
  const user = await verifyRequest(req).catch(() => null);
  try {
    await ensureSchema();
    await pool.query(
      `insert into barq.push_subs (endpoint, p256dh, auth, user_id) values ($1,$2,$3,$4)
       on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_id = coalesce(excluded.user_id, barq.push_subs.user_id)`,
      [endpoint, p256dh, auth, user?.uid ?? null]
    );
    return json(200, { ok: true });
  } catch (e) {
    return serverError("push:subscribe", e, "DB");
  }
}

/** DELETE { endpoint } → stop notifications for this device. */
export async function DELETE(req: Request) {
  let endpoint = "";
  try {
    endpoint = String(((await req.json()) as { endpoint?: unknown }).endpoint ?? "");
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  try {
    await ensureSchema();
    await pool.query("delete from barq.push_subs where endpoint = $1", [endpoint]);
    return json(200, { ok: true });
  } catch (e) {
    return serverError("push:unsubscribe", e, "DB");
  }
}
