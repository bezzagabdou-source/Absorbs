import { json, serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { ensureSchema } from "@/db/ensure-schema";
import { pool } from "@/db";
import { DEFAULT_PREFS, normalizePrefs, patchPrefs, prefsKnobCount } from "@/lib/prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * v18 ATLAS — مزامنة الإعدادات بين الأجهزة.
 *   GET   /api/prefs           الإعدادات المحفوظة (أو الافتراضية)
 *   POST  /api/prefs           { patch } أو { prefs } — يُطبَّق ويُتحقَّق منه خادميًا
 *   DELETE /api/prefs          العودة إلى الإعدادات الافتراضية
 */

async function read(uid: string) {
  await ensureSchema();
  const r = await pool.query(`select prefs, updated_at from barq.atlas_prefs where user_id = $1 limit 1`, [uid]);
  const row = r.rows[0] as { prefs: unknown; updated_at: Date | string } | undefined;
  return {
    prefs: normalizePrefs(row?.prefs ?? {}),
    updatedAt: row ? (typeof row.updated_at === "string" ? row.updated_at : row.updated_at.toISOString()) : null,
  };
}

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    const { prefs, updatedAt } = await read(user.uid);
    return json(200, { prefs, updatedAt, knobs: prefsKnobCount(prefs), defaults: DEFAULT_PREFS });
  } catch (e) {
    return serverError("prefs:get", e);
  }
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`prefs:${user.uid}`, 120, 60_000).ok) return json(429, { code: "RATE" });

  let body: { patch?: unknown; prefs?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_JSON" });
  }

  try {
    const current = (await read(user.uid)).prefs;
    const next = body.prefs ? normalizePrefs(body.prefs) : patchPrefs(current, body.patch ?? {});
    await pool.query(
      `insert into barq.atlas_prefs (user_id, prefs, updated_at) values ($1,$2,now())
       on conflict (user_id) do update set prefs = excluded.prefs, updated_at = now()`,
      [user.uid, JSON.stringify(next)]
    );
    return json(200, { prefs: next });
  } catch (e) {
    return serverError("prefs:set", e);
  }
}

export async function DELETE(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    await ensureSchema();
    await pool.query(`delete from barq.atlas_prefs where user_id = $1`, [user.uid]);
    return json(200, { prefs: DEFAULT_PREFS });
  } catch (e) {
    return serverError("prefs:reset", e);
  }
}
